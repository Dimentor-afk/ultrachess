import { describe, expect, it } from 'vitest';
import { CARD_BY_ID } from '../../engine/cards';
import { deckPositions, validateDeck } from '../../engine/deck';
import { legalMoves } from '../../engine/legal';
import { createMatch } from '../../engine/match';
import { DRAFT_PICK_MS, DRAFT_ROUNDS, draftDecks, draftDone, draftView, leftover, newDraft, pickCard, settleTimeouts } from '../draft';
import { MemoryStore } from '../memoryStore';
import { GameService } from '../service';
import type { Hasher } from '../store';

const hasher: Hasher = { hash: async (p) => `h:${p}`, verify: async (p, h) => h === `h:${p}` };

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

describe('draft rules', () => {
  it('offers two random cards per side, four different cards a round, no mythological', () => {
    for (let seed = 1; seed < 30; seed++) {
      const d = newDraft('A', 'B', seeded(seed), 0);
      expect(d.offers).toHaveLength(DRAFT_ROUNDS.length);
      d.offers.forEach((o, round) => {
        const all = [...o.w, ...o.b];
        expect(new Set(all).size).toBe(4);
        for (const id of all) expect(CARD_BY_ID[id].rarity).not.toBe('mythological');
        if (round < 4) for (const id of all) expect(CARD_BY_ID[id].pieceType).toBe(DRAFT_ROUNDS[round]);
      });
      // The crown: White picks a king, Black a queen.
      expect(d.offers[4].w.map((id) => CARD_BY_ID[id].pieceType)).toEqual(['king', 'king']);
      expect(d.offers[4].b.map((id) => CARD_BY_ID[id].pieceType)).toEqual(['queen', 'queen']);
    }
    // Random pairs: rarities mix.
    const mixed = Array.from({ length: 30 }, (_, i) => newDraft('A', 'B', seeded(i + 1), 0).offers[0].w).filter(([a, b]) => CARD_BY_ID[a].rarity !== CARD_BY_ID[b].rarity);
    expect(mixed.length).toBeGreaterThan(0);
  });

  it('picks fill your left side, leftovers the opponent’s right side', () => {
    let d = newDraft('A', 'B', seeded(3), 0);
    const took = { w: [] as string[], b: [] as string[] };
    for (let round = 0; round < 5; round++) {
      expect(d.round).toBe(round);
      took.w.push(d.offers[round].w[0]);
      took.b.push(d.offers[round].b[1]);
      d = pickCard(d, 'w', d.offers[round].w[0], 1000 * round);
      // One side picked: the round waits for the other.
      expect(d.round).toBe(round);
      expect(() => pickCard(d, 'w', d.offers[round].w[1], 0)).toThrow(/вже вибрали/);
      d = pickCard(d, 'b', d.offers[round].b[1], 1000 * round);
    }
    expect(draftDone(d)).toBe(true);
    const { w, b } = draftDecks(d);
    expect(validateDeck(w)).toEqual([]);
    expect(validateDeck(b)).toEqual([]);
    const wp = deckPositions(w);
    const bp = deckPositions(b);
    // White's left is a–d: its own pawn pick there, Black's leftover on e–h.
    expect(wp.slice(0, 4)).toEqual(Array(4).fill(took.w[0]));
    expect(wp.slice(4, 8)).toEqual(Array(4).fill(leftover(d, 0, 'b')));
    // Black sits on the other side: its left is e–h.
    expect(bp.slice(4, 8)).toEqual(Array(4).fill(took.b[0]));
    expect(bp.slice(0, 4)).toEqual(Array(4).fill(leftover(d, 0, 'w')));
    expect([w.knight1, w.bishop1, w.rook1]).toEqual(took.w.slice(1, 4));
    expect([b.knight2, b.bishop2, b.rook2]).toEqual(took.b.slice(1, 4));
    expect([b.knight1, b.bishop1, b.rook1]).toEqual([1, 2, 3].map((r) => leftover(d, r, 'w')));
    expect(w.king).toBe(took.w[4]);
    expect(b.king).toBe(leftover(d, 4, 'w'));
    expect(b.queen).toBe(took.b[4]);
    expect(w.queen).toBe(leftover(d, 4, 'b'));
    // A real game starts on them.
    expect(legalMoves(createMatch(w, b)).length).toBeGreaterThan(0);
  });

  it('a pick runs out of time: taken at random, the next round gets its full time', () => {
    let d = newDraft('A', 'B', seeded(9), 0);
    d = pickCard(d, 'w', d.offers[0].w[1], 5000);
    expect(settleTimeouts(d, DRAFT_PICK_MS - 1, seeded(1))).toBe(d);
    d = settleTimeouts(d, DRAFT_PICK_MS + 500, seeded(1));
    expect(d.round).toBe(1);
    expect(d.offers[0].b).toContain(d.picks[0].b);
    expect(d.deadline).toBe(2 * DRAFT_PICK_MS);
    // Nobody comes back: the whole draft finishes by itself.
    expect(draftDone(settleTimeouts(d, 10 * DRAFT_PICK_MS, seeded(1)))).toBe(true);
  });

  it('a side never sees what the opponent took', () => {
    let d = newDraft('A', 'B', seeded(4), 0);
    d = pickCard(d, 'b', d.offers[0].b[0], 0);
    const w = draftView(d, 'x', 'w', 0, null);
    expect(w.theyPicked).toBe(true);
    expect(JSON.stringify(w)).not.toContain(d.offers[0].b[0]);
    d = pickCard(d, 'w', d.offers[0].w[0], 0);
    const after = draftView(d, 'x', 'w', 0, null);
    // Round over: White got Black's leftover, not Black's pick.
    expect(after.rounds[0]).toEqual({ kind: 'pawn', took: d.offers[0].w[0], gave: d.offers[0].w[1], got: d.offers[0].b[1] });
    expect(JSON.stringify(after)).not.toContain(d.offers[0].b[0]);
    expect(after.decks).toBeNull();
  });
});

describe('draft with a friend', () => {
  it('challenge → accept → five rounds → the game on the drafted decks', async () => {
    const store = new MemoryStore();
    const clock = { now: 1_000_000 };
    const svc = new GameService(store, hasher, () => clock.now, seeded(11));
    await svc.init();
    const a = await svc.register('a@a.com', 'secret12', 'Анна');
    const b = await svc.register('b@b.com', 'secret12', 'Богдан');
    await svc.addFriend(a.token, b.profile.id);
    await svc.addFriend(b.token, a.profile.id);

    // No deck needed: the starter packs are not even opened.
    await svc.challengeFriend(a.token, b.profile.id, undefined, 'draft');
    const { incoming } = await svc.challenges(b.token);
    expect(incoming.map((c) => c.mode)).toEqual(['draft']);
    const r = await svc.respondChallenge(b.token, incoming[0].id, true);
    expect(r.pvpId).toBeNull();
    const id = r.draftId!;
    expect((await svc.challenges(a.token)).drafts).toHaveLength(1);
    expect((await svc.inbox(a.token)).yourTurn).toBe(1);
    await expect(svc.draftState((await svc.register('c@c.com', 'secret12', 'Влад')).token, id)).rejects.toThrow(/не знайдено/);

    for (let round = 0; round < 5; round++) {
      for (const p of [a, b]) {
        const v = await svc.draftState(p.token, id);
        expect(v.round).toBe(round);
        expect(v.offers).toHaveLength(2);
        await svc.draftPick(p.token, id, v.offers[0]);
      }
      clock.now += 3000;
    }
    const done = await svc.draftState(a.token, id);
    expect(done.done).toBe(true);
    expect(done.pvpId).toBeTruthy();
    expect(done.rounds).toHaveLength(5);
    const game = await svc.pvpState(a.token, done.pvpId!);
    expect(game.ranked).toBe(false);
    expect(validateDeck(game.whiteDeck)).toEqual([]);
    expect(deckPositions(done.color === 'w' ? game.whiteDeck : game.blackDeck)).toEqual(deckPositions(done.decks![done.color]));
    expect((await svc.challenges(a.token)).drafts).toHaveLength(0);
    // Reading it again does not start a second game.
    expect((await svc.draftState(b.token, id)).pvpId).toBe(done.pvpId);
  });
});

describe('draft lineup', () => {
  it('fills a side’s own board as rounds finish and matches the final decks', async () => {
    const { draftBoard } = await import('../draft');
    let d = newDraft('A', 'B', seeded(21), 0);
    for (let round = 0; round < 5; round++) {
      d = pickCard(d, 'w', d.offers[round].w[1], 0);
      d = pickCard(d, 'b', d.offers[round].b[0], 0);
      const v = draftView(d, 'x', 'w', 0, null);
      const board = draftBoard(v);
      if (round < 4) {
        // White's own board is complete for every finished piece kind; Black's shows only White's leftovers.
        expect(board.w.slice(8).every((x) => x !== null)).toBe(true);
        expect(board.b.slice(8, 12)).toEqual(Array(4).fill(d.offers[0].w[0]));
        expect(board.b.slice(12)).toEqual([null, null, null, null]);
      }
    }
    const final = draftView(d, 'x', 'b', 0, 'g');
    const decks = draftDecks(d);
    const board = draftBoard(final);
    expect(board.w.slice(8)).toEqual(deckPositions(decks.w).slice(0, 8));
    expect(board.b.slice(0, 8)).toEqual([decks.b.rook1, decks.b.knight1, decks.b.bishop1, decks.b.queen, decks.b.king, decks.b.bishop2, decks.b.knight2, decks.b.rook2]);
    // Before the end the partial board agrees with the final decks wherever it shows a card.
    const partial = draftBoard({ ...draftView(d, 'x', 'w', 0, null), decks: null });
    const whole = draftBoard(draftView(d, 'x', 'w', 0, null));
    for (const c of ['w', 'b'] as const) partial[c].forEach((x, i) => x !== null && expect(x).toBe(whole[c][i]));
  });
});
