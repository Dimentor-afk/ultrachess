import { CELLS, fileOf, rankOf } from './coords';
import { makeCtx } from './gen';
import { generatorFor } from './modifiers';
import { isFrozen } from './position';
import type { Barrier, Color, Move, Piece, Position, Square } from './types';

/** Ply on which `attacker` would move next. */
export function attackPly(pos: Position, attacker: Color): number {
  return pos.turn === attacker ? pos.ply : pos.ply + 1;
}

function side(b: Barrier, s: Square): number {
  const f = fileOf(s);
  const r = rankOf(s);
  return b.orientation === 1 ? f - r - b.c : f + r - b.c;
}

/** A move crosses a barrier when it enters the line or ends up on its other side. */
export function crossesBarrier(b: Barrier, from: Square, path: Square[]): boolean {
  let pos = false;
  let neg = false;
  const s0 = side(b, from);
  if (s0 > 0) pos = true;
  if (s0 < 0) neg = true;
  for (const s of path) {
    const v = side(b, s);
    if (v === 0) return true;
    if (v > 0) pos = true;
    else neg = true;
  }
  return pos && neg;
}

export function barrierBlocks(pos: Position, color: Color, ply: number, m: Move): boolean {
  for (const b of pos.barriers) {
    if (b.againstColor === color && b.ply === ply && crossesBarrier(b, m.from, m.path)) return true;
  }
  return false;
}

const PROBE_ID = '__probe';

/**
 * Whether `attacker` could capture on `target` on the given ply. Empty
 * squares are probed with a temporary king so that capture-only generators
 * report them too.
 */
export function isSquareAttacked(
  pos: Position,
  target: Square,
  attacker: Color,
  ply: number = attackPly(pos, attacker),
): boolean {
  const probe = pos.board[target] === null;
  if (probe) {
    pos.board[target] = {
      id: PROBE_ID,
      color: attacker === 'w' ? 'b' : 'w',
      type: 'king',
      cardId: 'king-classic',
      moveCount: 1,
      homeSquare: target,
    };
  }
  try {
    return attackingMoves(pos, target, attacker, ply, true).length > 0;
  } finally {
    if (probe) pos.board[target] = null;
  }
}

export interface Attack {
  square: Square;
  piece: Piece;
  move: Move;
}

/** All attacking moves on `target` (stops at the first one when `firstOnly`). */
export function attackingMoves(
  pos: Position,
  target: Square,
  attacker: Color,
  ply: number = attackPly(pos, attacker),
  firstOnly = false,
): Attack[] {
  const ctx = makeCtx(pos, attacker, ply, true);
  const out: Attack[] = [];
  for (let s = 0; s < CELLS; s++) {
    const p = pos.board[s];
    if (!p || p.color !== attacker || p.id === PROBE_ID) continue;
    if (isFrozen(pos, p.id, ply)) continue;
    for (const m of generatorFor(p.cardId)(ctx, p, s)) {
      if (!m.captures.includes(target)) continue;
      if (barrierBlocks(pos, attacker, ply, m)) continue;
      out.push({ square: s, piece: p, move: m });
      if (firstOnly) return out;
    }
  }
  return out;
}
