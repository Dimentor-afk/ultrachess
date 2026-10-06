// Shared by the bot benchmarks: seeded random decks and game positions.
import { CARDS } from '../../src/engine/cards';
import { DECK_SLOTS, classicDeck, validateDeck } from '../../src/engine/deck';
import { createMatch, performAction, type MatchState } from '../../src/engine/match';
import { legalMoves } from '../../src/engine/legal';
import type { Deck, PieceType } from '../../src/engine/types';

/** mulberry32: a small seeded generator, so runs can be repeated. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomDeck(r: () => number): Deck {
  for (let tries = 0; tries < 50; tries++) {
    const pick = (t: PieceType) => {
      const pool = CARDS.filter((c) => c.pieceType === t && !c.trialOnly);
      return pool[Math.floor(r() * pool.length)].id;
    };
    const deck = classicDeck('bench', 'Bench');
    const a = pick('pawn');
    const b = pick('pawn');
    deck.pawnVersions = a === b ? [a] : [a, b];
    deck.pawnFormation = ['11112222', '22221111', '12121212', '21212121'][Math.floor(r() * 4)];
    for (const s of DECK_SLOTS) (deck as unknown as Record<string, string>)[s.key] = pick(s.type);
    if (!validateDeck(deck).length) return deck;
  }
  return classicDeck('bench', 'Bench');
}

/** A position after `plies` random legal moves (quiet-ish middlegames for timing). */
export function randomPosition(seed: number, plies: number): MatchState {
  const r = rng(seed);
  let s = createMatch(randomDeck(r), randomDeck(r));
  for (let i = 0; i < plies && !s.result; i++) {
    if (s.pending.some((p) => p.color === s.turn)) {
      const pc = s.pending.find((p) => p.color === s.turn)!;
      s = performAction(s, { type: 'choose', square: pc.options[0] });
      continue;
    }
    const moves = legalMoves(s);
    if (!moves.length) break;
    s = performAction(s, { type: 'move', move: moves[Math.floor(r() * moves.length)] });
  }
  return s;
}
