import { describe, expect, it } from 'vitest';
import { abilityOptions, abilityPieces, abilityReady } from '../abilities';
import { CARDS } from '../cards';
import { CELLS } from '../coords';
import { DECK_SLOTS, classicDeck, validateDeck } from '../deck';
import { legalMoves } from '../legal';
import { type Action, type MatchState, createMatch, performAction } from '../match';
import { setupPosition } from '../position';
import { inCheck } from '../status';
import type { Deck, PieceType } from '../types';
import { playerView } from '../view';

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const byType = (t: PieceType) => CARDS.filter((c) => c.pieceType === t).map((c) => c.id);

function randomDeck(r: () => number, id: string): Deck {
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  for (;;) {
    const pawns = byType('pawn');
    const v1 = pick(pawns);
    let v2 = pick(pawns);
    const two = r() < 0.6 && v2 !== v1;
    if (!two) v2 = v1;
    const deck: Deck = {
      ...classicDeck(id, id),
      pawnVersions: two ? [v1, v2] : [v1],
      pawnFormation: pick(['11112222', '22221111', '12121212', '21212121']),
    };
    for (const slot of DECK_SLOTS) (deck as unknown as Record<string, string>)[slot.key] = pick(byType(slot.type));
    if (validateDeck(deck).length === 0) return deck;
  }
}

function checkInvariants(m: MatchState): void {
  for (const c of ['w', 'b'] as const) {
    const kings = m.board.filter((p) => p?.type === 'king' && p.color === c);
    expect(kings).toHaveLength(1);
    for (const ill of m.hiddenState[c].illusions) expect(m.board[ill.square]).toBeNull();
  }
  const ids = m.board.filter(Boolean).map((p) => p!.id);
  expect(new Set(ids).size).toBe(ids.length);
  for (const pl of m.platforms) expect(m.board[pl.square]?.id).toBe(pl.pieceId);
  // The opponent's view never exposes hidden illusions or ids.
  const other = m.turn === 'w' ? 'b' : 'w';
  const view = playerView(m, other);
  for (let s = 0; s < CELLS; s++) {
    const c = view.cells[s];
    if (c && c.color !== other) expect(c.illusion || c.id !== '').toBe(false);
  }
}

describe('fuzz', () => {
  it('no starting position is in check for any single card', () => {
    for (const slot of [...DECK_SLOTS.map((s) => s.key), 'pawn'] as string[]) {
      const type: PieceType = slot === 'pawn' ? 'pawn' : DECK_SLOTS.find((s) => s.key === slot)!.type;
      for (const id of byType(type)) {
        const deck = { ...classicDeck() } as Deck;
        if (slot === 'pawn') deck.pawnVersions = [id];
        else (deck as unknown as Record<string, string>)[slot] = id;
        const pos = setupPosition(deck, deck);
        expect(inCheck(pos, 'w'), `${id} as ${slot}`).toBe(false);
        expect(inCheck(pos, 'b'), `${id} as ${slot}`).toBe(false);
        expect(legalMoves(pos).length, `${id} as ${slot}`).toBeGreaterThan(0);
      }
    }
  });

  it('random decks and random actions never break the engine', () => {
    for (let game = 0; game < 24; game++) {
      const r = rng(1000 + game);
      let m = createMatch(randomDeck(r, 'a'), randomDeck(r, 'b'));
      for (let step = 0; step < 90 && !m.result; step++) {
        let action: Action | null = null;
        const pc = m.pending.find((p) => p.color === m.turn);
        if (pc) {
          action = { type: 'choose', square: pc.options[Math.floor(r() * pc.options.length)] };
        } else {
          const abilities = abilityPieces(m, m.turn).filter((a) => abilityReady(m, a.piece.id));
          if (abilities.length && r() < 0.25) {
            const a = abilities[0];
            const opts = abilityOptions(m, a.piece.id);
            if (opts.length) action = { type: 'ability', pieceId: a.piece.id, key: opts[Math.floor(r() * opts.length)].key };
          }
          if (!action) {
            const moves = legalMoves(m);
            const captures = moves.filter((x) => x.captures.length);
            const pool = captures.length && r() < 0.5 ? captures : moves;
            action = { type: 'move', move: pool[Math.floor(r() * pool.length)] };
          }
        }
        m = performAction(m, action);
        checkInvariants(m);
      }
    }
  }, 120000);
});
