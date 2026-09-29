import { describe, expect, it } from 'vitest';
import { parseSquare } from '../../engine/coords';
import { classicDeck } from '../../engine/deck';
import { legalMoves } from '../../engine/legal';
import { type Action, createMatch, performAction } from '../../engine/match';
import { BOT_LEAGUES, TRIALS } from '../leagues';
import { MemoryStore } from '../memoryStore';
import { CLAIM_MS, GameService } from '../service';
import type { Hasher } from '../store';

const hasher: Hasher = { hash: async (p) => `h:${p}`, verify: async (p, h) => h === `h:${p}` };

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/** Actions of a UCI line from the start position (classic decks). */
function line(ucis: string[]): Action[] {
  let m = createMatch(classicDeck(), classicDeck());
  const out: Action[] = [];
  for (const u of ucis) {
    const move = legalMoves(m).find((x) => x.from === parseSquare(u.slice(0, 2)) && x.target === parseSquare(u.slice(2)))!;
    out.push({ type: 'move', move });
    m = performAction(m, out[out.length - 1]);
  }
  return out;
}
const WHITE_MATES = line(['e2e4', 'e7e5', 'f1c4', 'b8c6', 'd1h5', 'g8f6', 'h5f7']);
const BLACK_MATES = line(['f2f3', 'e7e5', 'g2g4', 'd8h4']);

async function setup(now: () => number = Date.now) {
  const store = new MemoryStore();
  const svc = new GameService(store, hasher, now, seeded(3));
  await svc.init();
  const reg = async (email: string, name: string) => {
    const r = await svc.register(email, 'secret1', name);
    const [p] = await svc.packs(r.token);
    await svc.openPack(r.token, p.id);
    return r;
  };
  return { store, svc, reg };
}

describe('bot ladder', () => {
  it('starts with the weakest bot and pays a league bonus once', async () => {
    const { store, svc, reg } = await setup();
    const { token, profile } = await reg('a@a.com', 'A');
    expect(profile.ladders.bot).toMatchObject({ trophies: 0, league: 0, packsLimit: 5 });
    expect((await svc.startMatch(token, { ranked: true })).botLevel).toBe(BOT_LEAGUES[0].botLevel);

    await store.updateUser(profile.id, { botTrophies: BOT_LEAGUES[1].minTrophies - 5 });
    await store.insertMatch({ id: 'b1', userId: profile.id, ranked: true, mode: 'bot', color: 'w', botLevel: 0, playerDeck: classicDeck(), botDeck: classicDeck(), status: 'active', result: null, createdAt: Date.now() });
    const gold = (await svc.me(token)).gold;
    const r = await svc.finishMatch(token, 'b1', WHITE_MATES, false);
    expect(r.leagueUps).toEqual([{ ladder: 'bot', name: BOT_LEAGUES[1].name, gold: BOT_LEAGUES[1].reward.gold, pack: null }]);
    expect(r.profile.gold).toBe(gold + 10 + BOT_LEAGUES[1].reward.gold);
    expect(r.profile.ladders.bot.league).toBe(1);

    // Dropping back and climbing again pays nothing more.
    await store.updateUser(profile.id, { botTrophies: BOT_LEAGUES[1].minTrophies - 5 });
    await store.insertMatch({ id: 'b2', userId: profile.id, ranked: true, mode: 'bot', color: 'w', botLevel: 0, playerDeck: classicDeck(), botDeck: classicDeck(), status: 'active', result: null, createdAt: Date.now() });
    expect((await svc.finishMatch(token, 'b2', WHITE_MATES, false)).leagueUps).toEqual([]);
  });
});

describe('trials', () => {
  it('costs half a legendary pack, needs three wins in a row and pays a legendary pack', async () => {
    const { store, svc, reg } = await setup();
    const { token, profile } = await reg('t@t.com', 'T');
    const trial = TRIALS[0];
    expect(trial.cost).toBe(500);
    await expect(svc.enterTrial(token, 'classic')).rejects.toThrow(/осколків/);
    await store.updateUser(profile.id, { shards: 600 });
    const entered = await svc.enterTrial(token, 'classic');
    expect(entered.shards).toBe(100);
    await expect(svc.enterTrial(token, 'classic')).rejects.toThrow(/вже/);

    for (let round = 0; round < 3; round++) {
      const start = await svc.startMatch(token, { ranked: false, trial: 'classic' });
      expect(start.botLevel).toBe(trial.opponents[round]);
      expect(start.playerDeck.rook1).toBe('rook-classic');
      // Make the player white so the known mate line fits.
      await store.updateMatch(start.matchId, {});
      (store.data.matches.find((m) => m.id === start.matchId)!).color = 'w';
      const r = await svc.finishMatch(token, start.matchId, WHITE_MATES, false);
      expect(r.trial).toMatchObject({ wins: round + 1, status: round === 2 ? 'won' : 'active' });
      if (round === 2) expect(r.trial!.reward?.type).toBe('legendary');
    }
    await expect(svc.startMatch(token, { ranked: false, trial: 'classic' })).rejects.toThrow(/вхід/);
  });

  it('a defeat or an abandoned game ends the run', async () => {
    const { store, svc, reg } = await setup();
    const { token, profile } = await reg('u@u.com', 'U');
    await store.updateUser(profile.id, { shards: 2000 });
    await svc.enterTrial(token, 'classic');
    const s1 = await svc.startMatch(token, { ranked: false, trial: 'classic' });
    store.data.matches.find((m) => m.id === s1.matchId)!.color = 'w';
    expect((await svc.finishMatch(token, s1.matchId, BLACK_MATES, false)).trial).toMatchObject({ status: 'lost', wins: 0 });

    await svc.enterTrial(token, 'classic');
    await svc.startMatch(token, { ranked: false, trial: 'classic' });
    await expect(svc.startMatch(token, { ranked: false, trial: 'classic' })).rejects.toThrow(/поразку/);
    expect((await svc.me(token)).trials.classic.status).toBe('lost');
  });
});

describe('player ladder', () => {
  it('matchmaking pairs two searching players and the game settles trophies for both', async () => {
    let now = Date.UTC(2026, 3, 1, 12);
    const { svc, reg } = await setup(() => now);
    const a = await reg('a@a.com', 'Анна');
    const b = await reg('b@b.com', 'Богдан');
    expect((await svc.seek(a.token)).pvpId).toBeNull();
    const found = await svc.seek(b.token);
    expect(found.pvpId).not.toBeNull();
    // The first player finds the game on the next poll.
    expect((await svc.seek(a.token)).pvpId).toBe(found.pvpId);

    const st = await svc.pvpState(a.token, found.pvpId!);
    expect(st.ranked).toBe(true);
    const white = st.color === 'w' ? a : b;
    const black = st.color === 'w' ? b : a;
    // Starter decks are random: the white player simply resigns.
    now += 1000;
    await svc.pvpResign(white.token, found.pvpId!);
    const bView = await svc.pvpState(black.token, found.pvpId!);
    expect(bView.ladder).toMatchObject({ ladder: 'pvp', trophiesDelta: 30, goldDelta: 20 });
    expect(bView.ladder!.reward).not.toBeNull();
    expect((await svc.me(black.token)).ladders.pvp.trophies).toBe(30);
    expect((await svc.me(white.token)).ladders.pvp.trophies).toBe(0);
  });

  it('a stalled opponent can be timed out, a stale search is ignored', async () => {
    let now = Date.UTC(2026, 3, 1, 12);
    const { svc, reg } = await setup(() => now);
    const a = await reg('a@a.com', 'A');
    const b = await reg('b@b.com', 'B');
    const c = await reg('c@c.com', 'C');
    await svc.seek(a.token);
    now += 60_000;
    // A's search went stale: C does not get matched with it.
    expect((await svc.seek(c.token)).pvpId).toBeNull();
    const g = (await svc.seek(b.token)).pvpId!;
    const st = await svc.pvpState(b.token, g);
    const waiting = st.color === 'w' ? c : b; // black waits for white's first move
    const mover = st.color === 'w' ? b : c;
    await expect(svc.pvpClaim(waiting.token, g)).rejects.toThrow();
    now += CLAIM_MS + 1;
    const done = await svc.pvpClaim(waiting.token, g);
    expect(done.status).toBe('finished');
    expect(done.ladder!.trophiesDelta).toBe(30);
    await expect(svc.pvpClaim(mover.token, g)).rejects.toThrow();
  });
});
