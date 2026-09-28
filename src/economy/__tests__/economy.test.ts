import { describe, expect, it } from 'vitest';
import { CARD_BY_ID } from '../../engine/cards';
import { parseSquare } from '../../engine/coords';
import { classicDeck } from '../../engine/deck';
import { legalMoves } from '../../engine/legal';
import { type Action, createMatch, performAction } from '../../engine/match';
import { MemoryStore } from '../memoryStore';
import { PACKS, RARITIES, rollPack, rollStarter } from '../packs';
import { GameService } from '../service';
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

  it('common pack odds match the table', () => {
    const r = seeded(7);
    const counts: Record<string, number> = {};
    const N = 40000;
    for (let i = 0; i < N / 4; i++) for (const id of rollPack('common', r)) counts[CARD_BY_ID[id].rarity] = (counts[CARD_BY_ID[id].rarity] ?? 0) + 1;
    for (const rarity of RARITIES) {
      const got = ((counts[rarity] ?? 0) / N) * 100;
      expect(Math.abs(got - PACKS.common.odds[rarity])).toBeLessThan(Math.max(0.5, PACKS.common.odds[rarity] * 0.12));
    }
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
    expect(packs[0]).toMatchObject({ type: 'starter', status: 'ready' });
    const opened = await svc.openPack(token, packs[0].id);
    expect(opened.cards).toHaveLength(6);
    await expect(svc.openPack(token, packs[0].id)).rejects.toThrow();
    const decks = await svc.decks(token);
    expect(decks).toHaveLength(1);
    const start = await svc.startMatch(token, { ranked: true });
    expect(start.botLevel).toBe(1);
    // Cards outside the collection cannot be put in a deck.
    await expect(svc.saveDeck(token, classicDeck('x', 'Класика'))).rejects.toThrow(/колекції|немає/);
  });

  it('duplicates trade for a pack', async () => {
    const { svc, store } = await setup();
    const { token, profile } = await svc.register('d@d.com', 'secret1', 'D');
    await store.addCard(profile.id, 'pawn-classic');
    await store.setDupes(profile.id, 'pawn-classic', 10);
    const pack = await svc.exchange(token, 'pawn-classic');
    expect(pack).toMatchObject({ type: 'common', status: 'ready' });
    expect((await svc.collection(token)).owned['pawn-classic'].dupes).toBe(0);
    await expect(svc.exchange(token, 'pawn-classic')).rejects.toThrow();
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
    expect(res).toMatchObject({ outcome: 'win', trophiesDelta: 30 });
    expect(res.reward?.type).toBe('common');
    expect(res.profile.trophies).toBe(30);
    await expect(svc.finishMatch(token, 'm1', actions, false)).rejects.toThrow();

    // A tampered record is rejected.
    await store.insertMatch({ ...(await store.getMatch('m1'))!, id: 'm2', status: 'active' });
    const bad = actions.slice(0, 3).concat(actions.slice(4));
    await expect(svc.finishMatch(token, 'm2', bad, false)).rejects.toThrow();
  });

  it('a won pack sits in a slot and unlocks with a timer', async () => {
    let now = 1_000_000;
    const store = new MemoryStore();
    const svc = new GameService(store, plainHasher, () => now, seeded(9));
    await svc.init();
    const { token, profile } = await svc.register('t@t.com', 'secret1', 'T');
    await store.insertPack({ id: 'p1', userId: profile.id, type: 'rare', slot: true, status: 'locked', unlockAt: null, source: 'test', createdAt: now, openedAt: null, result: null });
    await expect(svc.openPack(token, 'p1')).rejects.toThrow();
    await svc.startUnlock(token, 'p1');
    now += PACKS.rare.unlockMinutes * 6e4 - 1000;
    await expect(svc.openPack(token, 'p1')).rejects.toThrow();
    now += 2000;
    const opened = await svc.openPack(token, 'p1');
    expect(opened.cards).toHaveLength(PACKS.rare.cards);
  });
});
