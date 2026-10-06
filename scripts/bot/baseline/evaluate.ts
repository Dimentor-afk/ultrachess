// Position evaluation for the bot (spec §7): material + mobility.
// Card bonuses are hand-tuned starting values (spec §10 leaves the exact
// numbers open).

import { getCard } from '../../../src/engine/cards';
import { CELLS, fileOf, isBoardSquare, opposite, rankOf } from '../../../src/engine/coords';
import { mobility } from '../../../src/engine/legal';
import { isFrozen } from '../../../src/engine/position';
import type { Color, PieceType, Position, Rarity } from '../../../src/engine/types';

export const BASE_VALUE: Record<PieceType, number> = {
  pawn: 100,
  knight: 310,
  bishop: 320,
  rook: 500,
  queen: 900,
  king: 0,
};

const RARITY_BONUS: Record<Rarity, number> = {
  common: 0,
  rare: 15,
  epic: 30,
  legendary: 45,
  mythological: 60,
};

/** Per-card corrections on top of the rarity bonus. */
const CARD_ADJUST: Record<string, number> = {
  'knight-camel': -20,
  'bishop-sentinel': 10,
  'rook-maneuver': 40,
  'pawn-spearman': 20,
  'queen-amazon': 20,
};

export const MOBILITY_WEIGHT = 2;

const valueCache = new Map<string, number>();

export function cardValue(cardId: string): number {
  let v = valueCache.get(cardId);
  if (v === undefined) {
    const c = getCard(cardId);
    v = BASE_VALUE[c.pieceType] + (c.pieceType === 'king' ? 0 : RARITY_BONUS[c.rarity]) + (CARD_ADJUST[cardId] ?? 0);
    valueCache.set(cardId, v);
  }
  return v;
}

/** Positional bonus: central minor pieces, advanced pawns, a sheltered king. */
function placement(type: PieceType, color: Color, s: number, endgame: boolean): number {
  if (!isBoardSquare(s)) return 0;
  const f = fileOf(s);
  const r = rankOf(s);
  const rel = color === 'w' ? r : 7 - r; // ranks advanced from own side
  const center = 7 - (Math.abs(f - 3.5) + Math.abs(r - 3.5)); // 0 (corner) .. 6 (centre)
  switch (type) {
    case 'knight':
      return center * 5 - 10 - (rel === 0 && !endgame ? 15 : 0);
    case 'bishop':
      return center * 3 - (rel === 0 && !endgame ? 15 : 0);
    case 'pawn': {
      if (endgame) return rel * 14;
      const central = f >= 2 && f <= 5;
      // Push centre pawns; keep flank pawns home until they can promote.
      return (central ? rel * 5 + (rel >= 3 ? 8 : 0) : rel >= 5 ? rel * 4 : -rel * 2) - 5;
    }
    case 'rook':
      return rel === 6 ? 15 : 0;
    case 'queen':
      return center;
    case 'king':
      if (endgame) return center * 6;
      return (rel === 0 ? 20 : -15 * rel) + (f <= 2 || f >= 6 ? 12 : 0);
  }
}

export function material(pos: Position, color: Color): number {
  let heavy = 0;
  for (let s = 0; s < CELLS; s++) {
    const p = pos.board[s];
    if (p && p.type !== 'pawn' && p.type !== 'king') heavy += BASE_VALUE[p.type];
  }
  const endgame = heavy <= 2600;
  let sum = 0;
  for (let s = 0; s < CELLS; s++) {
    const p = pos.board[s];
    if (!p || p.color !== color) continue;
    sum += cardValue(p.cardId) + placement(p.type, color, s, endgame);
    if (pos.passengers[p.id]) sum += BASE_VALUE.pawn;
    if (!isBoardSquare(s)) sum -= 40; // stuck on a platform
    if (isFrozen(pos, p.id, pos.turn === color ? pos.ply : pos.ply + 1)) sum -= 15;
  }
  for (const pc of pos.pending) if (pc.color === color) sum += cardValue(pc.piece.cardId);
  return sum;
}

/** Score from `color`'s point of view. */
export function evaluate(pos: Position, color: Color): number {
  const enemy = opposite(color);
  return (
    material(pos, color) -
    material(pos, enemy) +
    MOBILITY_WEIGHT * (mobility(pos, color) - mobility(pos, enemy))
  );
}
