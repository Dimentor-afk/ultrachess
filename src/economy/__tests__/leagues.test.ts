import { describe, expect, it } from 'vitest';
import { parseSquare } from '../../engine/coords';
import { classicDeck } from '../../engine/deck';
import { legalMoves } from '../../engine/legal';
import { type Action, createMatch, performAction } from '../../engine/match';
import { BOT_LEVELS, eloOfLevel, levelForElo } from '../../engine/bot/levels';
import { BOT_LEAGUES, trialById } from '../leagues';
import { MemoryStore } from '../memoryStore';
import { type BotRunner, CLAIM_MS, GameService } from '../service';
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

/** A bot that plays a given line; tests set `bot.line` before a game. */
const bot = { line: [] as Action[] };
const scripted: BotRunner = async (state) => ({ actions: [bot.line[state.history.length]], score: 0 });

/** Play the player's (white's) side of `line` through the server; the scripted bot plays the rest. */
async function playLine(svc: GameService, token: string, matchId: string, line: Action[]) {
  bot.line = line;
  let view = (await svc.matchAction(token, matchId, null, '')).view;
  // No hidden actions in these lines: the history counts the actions played.
  while (!view.state.result && view.state.history.length < line.length) {
    const r = await svc.matchAction(token, matchId, line[view.state.history.length], view.v);
    if (r.stale) throw new Error('the server did not take the move');
    view = r.view;
  }
}

async function setup(now: () => number = Date.now) {
  const store = new MemoryStore();
  const svc = new GameService(store, hasher, now, seeded(3), scripted);
  await svc.init();
  const reg = async (email: string, name: string) => {
    const r = await svc.register(email, 'secret12', `Гравець ${name}`);
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
    expect((await svc.startMatch(token, { ranked: true })).botLevel).toBe(0);

    await store.updateUser(profile.id, { botTrophies: BOT_LEAGUES[1].minTrophies - 5 });
    await store.insertMatch({ id: 'b1', userId: profile.id, ranked: true, mode: 'bot', color: 'w', botLevel: 0, playerDeck: classicDeck(), botDeck: classicDeck(), status: 'active', result: null, createdAt: Date.now(), actions: [] });
    const gold = (await svc.me(token)).gold;
    await playLine(svc, token, 'b1', WHITE_MATES);
    const r = await svc.finishMatch(token, 'b1', false);
    expect(r.leagueUps).toEqual([{ ladder: 'bot', name: BOT_LEAGUES[1].name, gold: BOT_LEAGUES[1].reward.gold, pack: null }]);
    expect(r.profile.gold).toBe(gold + 10 + BOT_LEAGUES[1].reward.gold);
    expect(r.profile.ladders.bot.league).toBe(1);

    // Dropping back and climbing again pays nothing more.
    await store.updateUser(profile.id, { botTrophies: BOT_LEAGUES[1].minTrophies - 5 });
    await store.insertMatch({ id: 'b2', userId: profile.id, ranked: true, mode: 'bot', color: 'w', botLevel: 0, playerDeck: classicDeck(), botDeck: classicDeck(), status: 'active', result: null, createdAt: Date.now(), actions: [] });
    await playLine(svc, token, 'b2', WHITE_MATES);
    expect((await svc.finishMatch(token, 'b2', false)).leagueUps).toEqual([]);
  });
});

describe('bot ladder: rating and win streak', () => {
  it('the bot is as strong as the trophies', async () => {
    const { store, svc, reg } = await setup();
    const { token, profile } = await reg('e@e.com', 'E');
    await store.updateUser(profile.id, { botTrophies: 460 });
    const start = await svc.startMatch(token, { ranked: true });
    expect(start.botLevel).toBe(levelForElo(460));
    expect(eloOfLevel(start.botLevel)).toBe(460);
    expect((await svc.me(token)).ladders.bot.botElo).toBe(460);
    // Far past the strongest preset: the strongest bot.
    expect(levelForElo(5000)).toBe(BOT_LEVELS.length - 1);
  });

  it('the 3rd win in a row pays 30, the 4th and later 40; a loss ends the streak', async () => {
    const { store, svc, reg } = await setup();
    const { token, profile } = await reg('s@s.com', 'S');
    await store.updateUser(profile.id, { botTrophies: 500 });
    const game = async (id: string, line: Action[]) => {
      await store.insertMatch({ id, userId: profile.id, ranked: true, mode: 'bot', color: 'w', botLevel: 0, playerDeck: classicDeck(), botDeck: classicDeck(), status: 'active', result: null, createdAt: Date.now(), actions: [] });
      await playLine(svc, token, id, line);
      return svc.finishMatch(token, id, false);
    };
    const deltas: number[] = [];
    for (let i = 0; i < 5; i++) deltas.push((await game(`w${i}`, WHITE_MATES)).trophiesDelta);
    expect(deltas).toEqual([20, 20, 30, 40, 40]);
    expect((await svc.me(token)).ladders.bot).toMatchObject({ streak: 5, win: 40 });
    const lost = await game('l1', BLACK_MATES);
    expect(lost).toMatchObject({ trophiesDelta: -15, streak: 0 });
    expect((await svc.me(token)).ladders.bot).toMatchObject({ streak: 0, win: 20 });
  });
});

describe('trials', () => {
  it('costs half a legendary pack, needs three wins in a row and pays a legendary pack', async () => {
    const { store, svc, reg } = await setup();
    const { token, profile } = await reg('t@t.com', 'T');
    const trial = trialById('classic')!;
    expect(trial.cost).toBe(500);
    await expect(svc.enterTrial(token, 'classic')).rejects.toThrow(/уламків/);
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
      await playLine(svc, token, start.matchId, WHITE_MATES);
      const r = await svc.finishMatch(token, start.matchId, false);
      expect(r.trial).toMatchObject({ wins: round + 1, status: round === 2 ? 'won' : 'active' });
      if (round === 2) expect(r.trial!.reward?.type).toBe('legendary');
    }
    await expect(svc.startMatch(token, { ranked: false, trial: 'classic' })).rejects.toThrow(/вхід/);
  });

  it('a defeat ends the run; an abandoned game is resumed', async () => {
    const { store, svc, reg } = await setup();
    const { token, profile } = await reg('u@u.com', 'U');
    await store.updateUser(profile.id, { shards: 2000 });
    await svc.enterTrial(token, 'classic');
    const s1 = await svc.startMatch(token, { ranked: false, trial: 'classic' });
    store.data.matches.find((m) => m.id === s1.matchId)!.color = 'w';
    await playLine(svc, token, s1.matchId, BLACK_MATES);
    expect((await svc.finishMatch(token, s1.matchId, false)).trial).toMatchObject({ status: 'lost', wins: 0 });

    // A game left unfinished is not restarted: the same game goes on.
    await svc.enterTrial(token, 'classic');
    const s2 = await svc.startMatch(token, { ranked: false, trial: 'classic' });
    store.data.matches.find((m) => m.id === s2.matchId)!.color = 'w';
    bot.line = WHITE_MATES;
    const v = (await svc.matchAction(token, s2.matchId, null, '')).view.v;
    await svc.matchAction(token, s2.matchId, WHITE_MATES[0], v);
    const again = await svc.startMatch(token, { ranked: false, trial: 'classic' });
    expect(again.matchId).toBe(s2.matchId);
    expect(again.view.state.history).toHaveLength(2);
    expect(again.trial).toMatchObject({ round: 1, rounds: 3 });
    // Resigning it ends the run.
    expect((await svc.finishMatch(token, s2.matchId, true)).trial).toMatchObject({ status: 'lost' });
  });
});

describe('new trials', () => {
  /** Win a bot-trial round with the known mate line (as white, classic decks). */
  async function winRound(store: MemoryStore, svc: GameService, token: string, id: string) {
    const start = await svc.startMatch(token, { ranked: false, trial: id });
    const row = store.data.matches.find((m) => m.id === start.matchId)!;
    row.color = 'w';
    row.playerDeck = classicDeck();
    row.botDeck = classicDeck();
    await playLine(svc, token, start.matchId, WHITE_MATES);
    return { start, r: await svc.finishMatch(token, start.matchId, false) };
  }

  it('Шлях Комети: four strong bots with card decks, and Комета as the prize', async () => {
    const { store, svc, reg } = await setup();
    const { token, profile } = await reg('k@k.com', 'K');
    const t = trialById('comet')!;
    await store.updateUser(profile.id, { shards: 5000 });
    await svc.enterTrial(token, 'comet');
    let last;
    for (let round = 0; round < 4; round++) {
      const { start, r } = await winRound(store, svc, token, 'comet');
      expect(start.botLevel).toBe(t.opponents[round]);
      last = r;
    }
    expect(last!.trial).toMatchObject({ status: 'won', card: 'king-comet', reward: null });
    expect((await svc.collection(token)).owned['king-comet']).toBeTruthy();

    // Won again with the card already owned: a mythic pack instead.
    await svc.enterTrial(token, 'comet');
    for (let round = 0; round < 4; round++) last = (await winRound(store, svc, token, 'comet')).r;
    expect(last!.trial).toMatchObject({ status: 'won', card: null });
    expect(last!.trial!.reward?.type).toBe('mythic');
  });

  it('Арсенал: bots play random card decks, not the classic one', async () => {
    const { store, svc, reg } = await setup();
    const { token, profile } = await reg('r@r.com', 'R');
    await store.updateUser(profile.id, { shards: 1000 });
    await svc.enterTrial(token, 'arsenal');
    const start = await svc.startMatch(token, { ranked: false, trial: 'arsenal' });
    const deck = start.botDeck as unknown as Record<string, string>;
    expect(Object.values(deck).some((v) => typeof v === 'string' && v.includes('-') && !v.endsWith('-classic') && v !== 'bot')).toBe(true);
  });

  it('Арена гравців counts player-ladder games: three wins in a row pay a legendary pack', async () => {
    let now = Date.UTC(2026, 3, 1, 12);
    const { store, svc, reg } = await setup(() => now);
    const a = await reg('a@a.com', 'A');
    const b = await reg('b@b.com', 'B');
    await store.updateUser(a.profile.id, { shards: 1000 });
    await svc.enterTrial(a.token, 'arena');
    await expect(svc.startMatch(a.token, { ranked: false, trial: 'arena' })).rejects.toThrow(/лізі гравців/);
    for (let i = 0; i < 3; i++) {
      now += 10_000;
      await svc.seek(a.token);
      const g = (await svc.seek(b.token)).pvpId!;
      await svc.pvpResign(b.token, g); // B gives up: A wins
      expect((await svc.pvpState(a.token, g)).trial).toMatchObject({ wins: i + 1 });
      const run = (await svc.me(a.token)).trials.arena;
      expect(run.wins).toBe(i + 1);
      expect(run.status).toBe(i === 2 ? 'won' : 'active');
    }
    const packs = await svc.packs(a.token);
    expect(packs.some((p) => p.type === 'legendary' && p.source.includes('Арена гравців'))).toBe(true);
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
