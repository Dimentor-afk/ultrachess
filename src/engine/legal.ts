import { applyMove } from './apply';
import { barrierBlocks, isSquareAttacked } from './attack';
import { CELLS, opposite } from './coords';
import { makeCtx } from './gen';
import { generatorFor } from './modifiers';
import { clonePosition, emptyHidden, findKing, isFrozen } from './position';
import type { Color, Move, Position, Square } from './types';

/**
 * The position as `color` believes it to be: the opponent's illusions are
 * real pieces and the opponent's hidden flags are unknown (off).
 */
export function beliefFor(pos: Position, color: Color): Position {
  const enemy = opposite(color);
  const h = pos.hiddenState[enemy];
  if (!h.illusions.length && h.immortalPly === null && !h.hint) return pos;
  const next = clonePosition(pos);
  for (const ill of h.illusions) {
    if (next.board[ill.square] !== null) continue;
    next.board[ill.square] = {
      id: ill.id,
      color: enemy,
      type: ill.type,
      cardId: ill.cardId,
      moveCount: 1,
      homeSquare: ill.square,
    };
  }
  next.hiddenState[enemy] = emptyHidden();
  return next;
}

function kingSafeAfter(pos: Position, m: Move, color: Color): boolean {
  const after = applyMove(pos, m, { lite: true });
  const k = findKing(after, color);
  if (k < 0 || isSquareAttacked(after, k, opposite(color), after.ply)) return false;
  return pos.board[m.from]?.type !== 'king' || !m.captures.length || !kingTakesDefended(pos, m, color);
}

/**
 * A king never takes a defended piece. Defensive effects (Фортечна тура
 * stepping back, Щитоносець, Безсмертна…) may move the victim into the
 * defender's line after the capture; that must not make the capture legal,
 * so the king is checked against a plain capture: victims gone, king landed.
 */
function kingTakesDefended(pos: Position, m: Move, color: Color): boolean {
  const plain = clonePosition(pos);
  const king = plain.board[m.from]!;
  for (const c of m.captures) plain.board[c] = null;
  plain.board[m.from] = null;
  const at = m.to ?? m.from;
  plain.board[at] = king;
  plain.turn = opposite(color);
  plain.ply = pos.ply + 1;
  return isSquareAttacked(plain, at, opposite(color), plain.ply);
}

/** Narrower searches, for when the full list is not needed. */
export interface LegalFilter {
  /** Only the moves of the piece on this square (checking one chosen move). */
  from?: Square;
  /** Stop after this many legal moves (is there any move at all?). */
  limit?: number;
}

/**
 * Legal moves of the side to move (empty while a choice is pending).
 * `capturesOnly` skips quiet moves before the costly king-safety check.
 */
export function legalMoves(pos: Position, capturesOnly = false, filter: LegalFilter = {}): Move[] {
  const out: Move[] = [];
  for (const m of candidateMoves(pos, capturesOnly, filter.from)) {
    if (filter.limit !== undefined && out.length >= filter.limit) return out;
    if (isLegalCandidate(pos, m)) out.push(m);
  }
  return out;
}

/**
 * The moves of the side to move before the king-safety check (the costly part):
 * a move from here is legal exactly when `isLegalCandidate` says so. The bot
 * checks only the moves it actually looks at; most are cut off before that.
 */
export function candidateMoves(pos: Position, capturesOnly = false, from?: Square): Move[] {
  const color = pos.turn;
  if (pos.pending.some((pc) => pc.color === color)) return [];
  const enemy = opposite(color);
  const ply = pos.ply;
  const ctx = makeCtx(pos, color, ply, false);
  ctx.squareAttacked = (s) => isSquareAttacked(pos, s, enemy, ply + 1);
  const out: Move[] = [];
  const first = from ?? 0;
  const last = from ?? CELLS - 1;
  for (let s = first; s <= last; s++) {
    const p = pos.board[s];
    if (!p || p.color !== color || isFrozen(pos, p.id, ply)) continue;
    for (const m of generatorFor(p.cardId)(ctx, p, s)) {
      if (capturesOnly && m.captures.length === 0 && !m.promotion) continue;
      if (m.captures.some((c) => pos.board[c]?.type === 'king')) continue;
      if (barrierBlocks(pos, color, ply, m)) continue;
      out.push(m);
    }
  }
  return out;
}

const beliefs = new WeakMap<Position, Position>();

/** Whether a move from `candidateMoves(pos)` leaves the mover's king safe. */
export function isLegalCandidate(pos: Position, m: Move): boolean {
  const color = pos.turn;
  // Taking an illusion is judged as if it were the real piece the player
  // sees, so legality never reveals which pieces are illusions.
  const touch = m.touch ?? m.captures[0];
  let base = pos;
  if (touch !== undefined && pos.board[touch] === null) {
    let b = beliefs.get(pos);
    if (!b) beliefs.set(pos, (b = beliefFor(pos, color)));
    base = b;
  }
  return kingSafeAfter(base, m, color);
}

/** Quick pseudo-legal move count (bot mobility). */
export function mobility(pos: Position, color: Color): number {
  const ctx = makeCtx(pos, color, pos.turn === color ? pos.ply : pos.ply + 1, false);
  let n = 0;
  for (let s = 0; s < CELLS; s++) {
    const p = pos.board[s];
    if (!p || p.color !== color || isFrozen(pos, p.id, ctx.ply)) continue;
    n += generatorFor(p.cardId)(ctx, p, s).length;
  }
  return n;
}
