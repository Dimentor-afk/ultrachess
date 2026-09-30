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
import { GameService } from '../service';
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

async function setup(seed = 1) {
  const store = new MemoryStore();
  const svc = new GameService(store, plainHasher, Date.now, seeded(seed));
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
    const { token, profile } = await svc.register('KoldMiand@gmail.com', 'secret1', 'Admin');
    expect(profile.role).toBe('admin');
    await expect(svc.register('koldmiand@gmail.com', 'other12', 'x')).rejects.toThrow();
    expect((await svc.adminUsers(token)).length).toBe(1);
  });

  it('new players get a starter pack that builds a playable deck', async () => {
    const { svc } = await setup(5);
    const { token, profile } = await svc.register('a@b.com', 'secret1', 'Гравець');
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
    const { token, profile } = await svc.register('d@d.com', 'secret1', 'D');
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
    const { token, profile } = await svc.register('g@g.com', 'secret1', 'G');
    expect(profile.themes).toEqual(['classic']);
    const offer = await svc.shop(token);
    expect(offer.themes).toHaveLength(3);
    const id = offer.themes[0];
    const price = BOARD_THEMES.find((t) => t.id === id)!.price;
    const notToday = BOARD_THEMES.find((t) => t.price > 0 && !offer.themes.includes(t.id))!.id;
    await expect(svc.buyTheme(token, id)).rejects.toThrow(/золота/);
    await expect(svc.setBoardTheme(token, id)).rejects.toThrow();
    const admin = await svc.register('koldmiand@gmail.com', 'secret1', 'A');
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
    const { token, profile } = await svc.register('f@f.com', 'secret1', 'F');
    const offer = await svc.shop(token);
    const admin = await svc.register('koldmiand@gmail.com', 'secret1', 'A');
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
    const { token, profile } = await svc.register('w@w.com', 'secret1', 'W');
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
    const res = await svc.finishMatch(token, 'm1', actions, false);
    expect(res).toMatchObject({ outcome: 'win', trophiesDelta: 20, ladder: 'bot' });
    expect(res.reward?.type).toBe('common');
    expect(res.profile.ladders.bot.trophies).toBe(20);
    // The bot ladder does not touch the player ladder.
    expect(res.profile.trophies).toBe(0);
    await expect(svc.finishMatch(token, 'm1', actions, false)).rejects.toThrow();

    // A tampered record is rejected.
    await store.insertMatch({ ...(await store.getMatch('m1'))!, id: 'm2', status: 'active' });
    const bad = actions.slice(0, 3).concat(actions.slice(4));
    await expect(svc.finishMatch(token, 'm2', bad, false)).rejects.toThrow();
  });

  it('bot-ladder wins give packs right away, at most 5 a day', async () => {
    let now = Date.UTC(2026, 0, 1, 12);
    const store = new MemoryStore();
    const svc = new GameService(store, plainHasher, () => now, seeded(9));
    await svc.init();
    const { token, profile } = await svc.register('t@t.com', 'secret1', 'T');
    const mate = scholarsMate();
    const win = async (id: string) => {
      await store.insertMatch({ id, userId: profile.id, ranked: true, mode: 'bot', color: 'w', botLevel: 1, playerDeck: classicDeck(), botDeck: classicDeck(), status: 'active', result: null, createdAt: now });
      return svc.finishMatch(token, id, mate, false);
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
    const svc = new GameService(store, plainHasher, () => now, seeded(4));
    await svc.init();
    const { token, profile } = await svc.register('q@q.com', 'secret1', 'Q');
    const play3 = profile.quests.find((q) => q.id === 'play3')!;
    expect(play3).toMatchObject({ progress: 0, target: 3, claimed: false });
    await expect(svc.claimQuest(token, 'play3')).rejects.toThrow(/не виконано/);
    for (let i = 0; i < 3; i++) {
      await store.insertMatch({ id: `q${i}`, userId: profile.id, ranked: true, mode: 'bot', color: 'w', botLevel: 1, playerDeck: classicDeck(), botDeck: classicDeck(), status: 'active', result: null, createdAt: now });
      await svc.finishMatch(token, `q${i}`, scholarsMate(), false);
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
