// Position evaluation for the bot (spec §7): material + mobility.
// Card bonuses are hand-tuned starting values (spec §10 leaves the exact
// numbers open).

import { getCard } from '../cards';
import { CELLS, isBoardSquare, opposite } from '../coords';
import { mobility } from '../legal';
import { isFrozen } from '../position';
import type { Color, PieceType, Position, Rarity } from '../types';

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
  'queen-amazon': -40,
};

export const MOBILITY_WEIGHT = 3;

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

export function material(pos: Position, color: Color): number {
  let sum = 0;
  for (let s = 0; s < CELLS; s++) {
    const p = pos.board[s];
    if (!p || p.color !== color) continue;
    sum += cardValue(p.cardId);
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
