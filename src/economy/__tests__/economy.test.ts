import { describe, expect, it } from 'vitest';
import { CARD_BY_ID } from '../../engine/cards';
import { parseSquare } from '../../engine/coords';
import { classicDeck } from '../../engine/deck';
import { legalMoves } from '../../engine/legal';
import { type Action, createMatch, performAction } from '../../engine/match';
import { MemoryStore } from '../memoryStore';
import {
  PACKS,
  PACK_SHARD_PRICE,
  RARITIES,
  SHARDS_PER_DUPE,
  maxOfRarity,
  rollPack,
  rollRarity,
  rollStarter,
} from '../packs';
import { LADDER_PACK_LIMIT, LADDER_WIN_GOLD } from '../leagues';
import { type BotRunner, GameService } from '../service';
import { BOARD_THEMES } from '../themes';
import { CAPTURE_FX } from '../captureFx';
import type { Hasher } from '../store';

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const plainHasher: Hasher = {
  hash: async (p) => `plain:${p}`,
  verify: async (p, h) => h === `plain:${p}`,
};

/** A bot that plays a given line; tests set `bot.line` before a game. */
const bot = { line: [] as Action[] };
const scripted: BotRunner = async (state) => ({ actions: [bot.line[state.history.length]], score: 0 });

/** Play the player's side of `line` through the server; the scripted bot plays the rest. */
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

async function setup(seed = 1) {
  const store = new MemoryStore();
  const svc = new GameService(store, plainHasher, Date.now, seeded(seed), scripted);
  await svc.init();
  return { store, svc };
}

describe('packs', () => {
  it('starter pack: one card per piece, exactly one rare and one epic', () => {
    for (let i = 0; i < 300; i++) {
      const ids = rollStarter(seeded(i + 1));
      const cards = ids.map((id) => CARD_BY_ID[id]);
      expect(new Set(cards.map((c) => c.pieceType)).size).toBe(6);
      expect(cards.filter((c) => c.rarity === 'rare')).toHaveLength(1);
      expect(cards.filter((c) => c.rarity === 'epic')).toHaveLength(1);
      expect(cards.filter((c) => c.rarity === 'common')).toHaveLength(4);
    }
  });

  it('per-card rarity roll matches the odds table', () => {
    const r = seeded(7);
    const counts: Record<string, number> = {};
    const N = 40000;
    for (let i = 0; i < N; i++) {
      const rarity = rollRarity(PACKS.common.odds, r);
      counts[rarity] = (counts[rarity] ?? 0) + 1;
    }
    for (const rarity of RARITIES) {
      const got = ((counts[rarity] ?? 0) / N) * 100;
      expect(Math.abs(got - PACKS.common.odds[rarity])).toBeLessThan(Math.max(0.5, PACKS.common.odds[rarity] * 0.12));
    }
  });

  it('packs never exceed their rarity caps', () => {
    const r = seeded(11);
    for (const def of Object.values(PACKS)) {
      for (let i = 0; i < 3000; i++) {
        const rarities = rollPack(def.type, r).map((id) => CARD_BY_ID[id].rarity);
        for (const rarity of RARITIES) {
          const atLeast = rarities.filter((x) => RARITIES.indexOf(x) >= RARITIES.indexOf(rarity)).length;
          expect(atLeast).toBeLessThanOrEqual(maxOfRarity(def, rarity));
        }
      }
    }
    // A mythic pack holds one mythological card and at most one legendary.
    expect(maxOfRarity(PACKS.mythic, 'mythological')).toBe(1);
    expect(maxOfRarity(PACKS.mythic, 'legendary')).toBe(2);
  });

  it('guaranteed rarity is always present', () => {
    const r = seeded(3);
    for (const type of ['rare', 'epic', 'legendary', 'mythic'] as const) {
      const g = RARITIES.indexOf(PACKS[type].guarantee!);
      for (let i = 0; i < 500; i++) {
        const ids = rollPack(type, r);
        expect(ids).toHaveLength(PACKS[type].cards);
        expect(ids.some((id) => RARITIES.indexOf(CARD_BY_ID[id].rarity) >= g)).toBe(true);
      }
    }
  });
});

describe('service', () => {
  it('seeds the admin account, claimable by registering', async () => {
    const { svc } = await setup();
    await expect(svc.login('koldmiand@gmail.com', 'whatever')).rejects.toThrow();
    const { token, profile } = await svc.register('KoldMiand@gmail.com', 'secret12', 'Власник');
    expect(profile.role).toBe('admin');
    await expect(svc.register('koldmiand@gmail.com', 'other123', 'Хтось')).rejects.toThrow();
    expect((await svc.adminUsers(token)).length).toBe(1);
  });

  it('new players get a starter pack that builds a playable deck', async () => {
    const { svc } = await setup(5);
    const { token, profile } = await svc.register('a@b.com', 'secret12', 'Гравець');
    expect(profile.role).toBe('player');
    await expect(svc.adminUsers(token)).rejects.toThrow();
    const packs = await svc.packs(token);
    expect(packs).toHaveLength(1);
    expect(packs[0]).toMatchObject({ type: 'starter' });
    const opened = await svc.openPack(token, packs[0].id);
    expect(opened.cards).toHaveLength(6);
    expect(opened.gold).toBe(100);
    expect((await svc.me(token)).gold).toBe(100);
    await expect(svc.openPack(token, packs[0].id)).rejects.toThrow();
    const decks = await svc.decks(token);
    expect(decks).toHaveLength(1);
    const start = await svc.startMatch(token, { ranked: true });
    expect(start.botLevel).toBe(0);
    // Cards outside the collection cannot be put in a deck.
    await expect(svc.saveDeck(token, classicDeck('x', 'Класика'))).rejects.toThrow(/колекції|немає/);
  });

  it('duplicates turn into shards, and shards buy packs', async () => {
    const { svc, store } = await setup();
    const { token, profile } = await svc.register('d@d.com', 'secret12', 'Гравець D');
    await store.addCard(profile.id, 'bishop-piercer'); // epic
    await store.setDupes(profile.id, 'bishop-piercer', 4);
    expect((await svc.collection(token)).owned['bishop-piercer'].dupes).toBe(0);
    let me = await svc.me(token);
    expect(me.shards).toBe(4 * SHARDS_PER_DUPE.epic);
    // Four epic duplicates are a good part of an epic pack, but not all of it.
    expect(me.shards).toBeLessThan(PACK_SHARD_PRICE.epic);
    await expect(svc.buyPack(token, 'epic')).rejects.toThrow(/осколків/);
    const bought = await svc.buyPack(token, 'common');
    expect(bought.pack.type).toBe('common');
    expect(bought.profile.shards).toBe(4 * SHARDS_PER_DUPE.epic - PACK_SHARD_PRICE.common);
    // A duplicate from a pack is reported with its shards.
    const res = await svc.openPack(token, bought.pack.id);
    me = await svc.me(token);
    const fromDupes = res.cards.reduce((n, c) => n + c.shards, 0);
    expect(res.shards).toBe(fromDupes);
    expect(me.shards).toBe(bought.profile.shards + fromDupes);
  });

  it('board themes are bought with gold, only from the daily offer', async () => {
    const { svc } = await setup();
    const { token, profile } = await svc.register('g@g.com', 'secret12', 'Гравець G');
    expect(profile.themes).toEqual(['classic']);
    const offer = await svc.shop(token);
    expect(offer.themes).toHaveLength(3);
    const id = offer.themes[0];
    const price = BOARD_THEMES.find((t) => t.id === id)!.price;
    const notToday = BOARD_THEMES.find((t) => t.price > 0 && !offer.themes.includes(t.id))!.id;
    await expect(svc.buyTheme(token, id)).rejects.toThrow(/золота/);
    await expect(svc.setBoardTheme(token, id)).rejects.toThrow();
    const admin = await svc.register('koldmiand@gmail.com', 'secret12', 'Гравець A');
    await svc.adminGrantCurrency(admin.token, profile.id, 5000, 0);
    await expect(svc.buyTheme(token, notToday)).rejects.toThrow(/сьогодні немає/);
    const p = await svc.buyTheme(token, id);
    expect(p).toMatchObject({ gold: 5000 - price, boardTheme: id });
    expect(p.themes).toContain(id);
    expect((await svc.setBoardTheme(token, 'classic')).boardTheme).toBe('classic');
    await expect(svc.buyTheme(token, id)).rejects.toThrow();
  });

  it('capture effects are bought only from the daily offer', async () => {
    const { svc } = await setup();
    const { token, profile } = await svc.register('f@f.com', 'secret12', 'Гравець F');
    const offer = await svc.shop(token);
    const admin = await svc.register('koldmiand@gmail.com', 'secret12', 'Гравець A');
    await svc.adminGrantCurrency(admin.token, profile.id, 5000, 0);
    const notToday = CAPTURE_FX.find((f) => f.price > 0 && !offer.fx.includes(f.id))!.id;
    await expect(svc.buyCaptureFx(token, notToday)).rejects.toThrow(/сьогодні немає/);
    const p = await svc.buyCaptureFx(token, offer.fx[0]);
    expect(p.captureFx).toBe(offer.fx[0]);
    expect(p.ownedFx).toContain(offer.fx[0]);
    // Owned items stay usable after they leave the shop.
    expect((await svc.setCaptureFx(token, 'impact')).captureFx).toBe('impact');
    expect((await svc.setCaptureFx(token, offer.fx[0])).captureFx).toBe(offer.fx[0]);
  });

  it('ranked win is verified by replay and rewards trophies and a pack', async () => {
    const { svc, store } = await setup();
    const { token, profile } = await svc.register('w@w.com', 'secret12', 'Гравець W');
    await svc.adminGrantAllCards(token, profile.id).catch(() => undefined);
    // Insert a known match: the player is white with classic decks.
    await store.insertMatch({
      id: 'm1',
      userId: profile.id,
      ranked: true,
      mode: 'bot',
      color: 'w',
      botLevel: 1,
      playerDeck: classicDeck(),
      botDeck: classicDeck(),
      status: 'active',
      result: null,
      createdAt: Date.now(),
      actions: [],
    });
    // Scholar's mate.
    const line = ['e2e4', 'e7e5', 'f1c4', 'b8c6', 'd1h5', 'g8f6', 'h5f7'];
    let m = createMatch(classicDeck(), classicDeck());
    const actions: Action[] = [];
    for (const uci of line) {
      const mv = legalMoves(m).find((x) => x.from === parseSquare(uci.slice(0, 2)) && x.target === parseSquare(uci.slice(2)))!;
      actions.push({ type: 'move', move: mv });
      m = performAction(m, actions[actions.length - 1]);
    }
    expect(m.status).toBe('checkmate');
    // The game is not over yet: no result.
    await expect(svc.finishMatch(token, 'm1', false)).rejects.toThrow(/не завершена/);
    await playLine(svc, token, 'm1', actions);
    const res = await svc.finishMatch(token, 'm1', false);
    expect(res).toMatchObject({ outcome: 'win', trophiesDelta: 20, ladder: 'bot' });
    expect(res.reward?.type).toBe('common');
    expect(res.profile.ladders.bot.trophies).toBe(20);
    // The bot ladder does not touch the player ladder.
    expect(res.profile.trophies).toBe(0);
    await expect(svc.finishMatch(token, 'm1', false)).rejects.toThrow();

    // An illegal move is rejected.
    await store.insertMatch({ ...(await store.getMatch('m1'))!, id: 'm2', status: 'active', actions: [] });
    const v = (await svc.matchAction(token, 'm2', null, '')).view.v;
    await expect(svc.matchAction(token, 'm2', actions[1], v)).rejects.toThrow(/неможливий/);
  });

  it('the server plays the bot: the client cannot choose its moves', async () => {
    const { svc, store } = await setup();
    const { token, profile } = await svc.register('c@c.com', 'secret12', 'Гравець C');
    await store.insertMatch({ id: 'c1', userId: profile.id, ranked: true, mode: 'bot', color: 'w', botLevel: 1, playerDeck: classicDeck(), botDeck: classicDeck(), status: 'active', result: null, createdAt: Date.now(), actions: [] });
    const mate = scholarsMate();
    // The bot answers 1.e4 with its own move (here 1…e6, not the 1…e5 the mate needs).
    bot.line = [mate[0], line(['e2e4', 'e7e6'])[1]];
    const v0 = (await svc.matchAction(token, 'c1', null, '')).view.v;
    const r = await svc.matchAction(token, 'c1', mate[0], v0);
    expect(r.view.state.history.map((h) => h.text)).toEqual(['Пішак e2–e4', 'Пішак e7–e6']);
    // Sending "the bot's move" with the old version changes nothing.
    const stale = await svc.matchAction(token, 'c1', mate[1], v0);
    expect(stale.stale).toBe(true);
    expect(stale.view.state.history).toHaveLength(2);
    // With the current version a black move is simply illegal for white.
    await expect(svc.matchAction(token, 'c1', mate[1], r.view.v)).rejects.toThrow();
  });

  it('a bot that fails still moves, and an unfinished ranked game is resumed', async () => {
    const store = new MemoryStore();
    const broken: BotRunner = async () => {
      throw new Error('worker died');
    };
    const svc = new GameService(store, plainHasher, Date.now, seeded(2), broken);
    await svc.init();
    const { token } = await svc.register('r@r.com', 'secret12', 'Гравець R');
    const [p] = await svc.packs(token);
    await svc.openPack(token, p.id);
    const start = await svc.startMatch(token, { ranked: true });
    const first = await svc.matchAction(token, start.matchId, null, '');
    // As black the bot opened; as white it waits for the player.
    expect(first.view.state.history).toHaveLength(start.color === 'b' ? 1 : 0);
    const again = await svc.startMatch(token, { ranked: true });
    expect(again.matchId).toBe(start.matchId);
    expect(again.view.state.history).toEqual(first.view.state.history);
  });

  it('a bot game saved by an older demo (no record of actions) is closed: a new one starts with the current deck', async () => {
    const { store, svc } = await setup(3);
    const { token } = await svc.register('o@o.com', 'secret12', 'Гравець O');
    const [p] = await svc.packs(token);
    await svc.openPack(token, p.id);
    const start = await svc.startMatch(token, { ranked: true });
    // What an older version left in localStorage: the same game without `actions`.
    const old = JSON.parse(JSON.stringify(store.data));
    for (const m of old.matches) delete m.actions;
    const later = new GameService(new MemoryStore(old), plainHasher, Date.now, seeded(3), scripted);
    await later.init();
    const again = await later.startMatch(token, { ranked: true });
    expect(again.matchId).not.toBe(start.matchId);
    expect(again.view.state.ply).toBe(0);
    expect((await later.history(token)).some((h) => h.id === start.matchId)).toBe(false);
  });
});

function line(ucis: string[]): Action[] {
  let m = createMatch(classicDeck(), classicDeck());
  const out: Action[] = [];
  for (const uci of ucis) {
    const mv = legalMoves(m).find((x) => x.from === parseSquare(uci.slice(0, 2)) && x.target === parseSquare(uci.slice(2)))!;
    out.push({ type: 'move', move: mv });
    m = performAction(m, out[out.length - 1]);
  }
  return out;
}

describe('bot-ladder rewards', () => {
  it('bot-ladder wins give packs right away, at most 5 a day', async () => {
    let now = Date.UTC(2026, 0, 1, 12);
    const store = new MemoryStore();
    const svc = new GameService(store, plainHasher, () => now, seeded(9), scripted);
    await svc.init();
    const { token, profile } = await svc.register('t@t.com', 'secret12', 'Гравець T');
    const mate = scholarsMate();
    const win = async (id: string) => {
      await store.insertMatch({ id, userId: profile.id, ranked: true, mode: 'bot', color: 'w', botLevel: 1, playerDeck: classicDeck(), botDeck: classicDeck(), status: 'active', result: null, createdAt: now, actions: [] });
      await playLine(svc, token, id, mate);
      return svc.finishMatch(token, id, false);
    };
    const limit = LADDER_PACK_LIMIT.bot;
    for (let i = 0; i < limit; i++) {
      const r = await win(`w${i}`);
      expect(r.reward).not.toBeNull();
      expect(r.goldDelta).toBe(LADDER_WIN_GOLD.bot);
    }
    const capped = await win('capped');
    expect(capped).toMatchObject({ reward: null, rewardSkipped: true, goldDelta: LADDER_WIN_GOLD.bot });
    expect(capped.profile.ladders.bot.packsToday).toBe(limit);
    // Packs are ready to open at once: no timers.
    const packs = await svc.packs(token);
    expect(packs.filter((p) => p.source.startsWith('Перемога'))).toHaveLength(limit);
    await svc.openPack(token, packs[packs.length - 1].id);
    // Next day the limit resets.
    now += 864e5;
    expect((await svc.me(token)).ladders.bot.packsToday).toBe(0);
    expect((await win('tomorrow')).reward).not.toBeNull();
  });
});

function scholarsMate(): Action[] {
  const line = ['e2e4', 'e7e5', 'f1c4', 'b8c6', 'd1h5', 'g8f6', 'h5f7'];
  let m = createMatch(classicDeck(), classicDeck());
  const actions: Action[] = [];
  for (const uci of line) {
    const mv = legalMoves(m).find((x) => x.from === parseSquare(uci.slice(0, 2)) && x.target === parseSquare(uci.slice(2)))!;
    actions.push({ type: 'move', move: mv });
    m = performAction(m, actions[actions.length - 1]);
  }
  return actions;
}

describe('daily quests', () => {
  it('count games, packs and wins and pay out once', async () => {
    let now = Date.UTC(2026, 2, 3, 10);
    const store = new MemoryStore();
    const svc = new GameService(store, plainHasher, () => now, seeded(4), scripted);
    await svc.init();
    const { token, profile } = await svc.register('q@q.com', 'secret12', 'Гравець Q');
    const play3 = profile.quests.find((q) => q.id === 'play3')!;
    expect(play3).toMatchObject({ progress: 0, target: 3, claimed: false });
    await expect(svc.claimQuest(token, 'play3')).rejects.toThrow(/не виконано/);
    for (let i = 0; i < 3; i++) {
      await store.insertMatch({ id: `q${i}`, userId: profile.id, ranked: true, mode: 'bot', color: 'w', botLevel: 1, playerDeck: classicDeck(), botDeck: classicDeck(), status: 'active', result: null, createdAt: now, actions: [] });
      await playLine(svc, token, `q${i}`, scholarsMate());
      await svc.finishMatch(token, `q${i}`, false);
    }
    const me = await svc.me(token);
    expect(me.quests.find((q) => q.id === 'play3')!.progress).toBe(3);
    const after = await svc.claimQuest(token, 'play3');
    expect(after.gold).toBe(me.gold + 60);
    await expect(svc.claimQuest(token, 'play3')).rejects.toThrow(/вже/);
    now += 864e5;
    expect((await svc.me(token)).quests.find((q) => q.id === 'play3')).toMatchObject({ progress: 0, claimed: false });
  });
});

describe('training games', () => {
  it('a new training game closes the old ones, so an open ranked game is always found', async () => {
    const { svc } = await setup(11);
    const { token } = await svc.register('tr@tr.com', 'secret12', 'Гравець Tr');
    const [p] = await svc.packs(token);
    await svc.openPack(token, p.id);
    const ranked = await svc.startMatch(token, { ranked: true });
    for (let i = 0; i < 25; i++) await svc.startMatch(token, { ranked: false, level: 0 });
    expect((await svc.startMatch(token, { ranked: true })).matchId).toBe(ranked.matchId);
  });
});

describe('deck input', () => {
  it('a malformed deck is a clear 400, not a crash, and extra fields are dropped', async () => {
    const { svc } = await setup(12);
    const { token } = await svc.register('dk@dk.com', 'secret12', 'Гравець Dk');
    const [p] = await svc.packs(token);
    await svc.openPack(token, p.id);
    const [deck] = await svc.decks(token);
    await expect(svc.saveDeck(token, null as never)).rejects.toMatchObject({ status: 400 });
    await expect(svc.saveDeck(token, { ...deck, pawnVersions: 'x' } as never)).rejects.toMatchObject({ status: 400 });
    await expect(svc.saveDeck(token, { ...deck, name: 'x'.repeat(40) })).rejects.toThrow(/32/);
    const saved = await svc.saveDeck(token, { ...deck, name: 'Нова', junk: 'x'.repeat(1000) } as never);
    expect(saved.find((d) => d.id === deck.id)).not.toHaveProperty('junk');
  });
});
