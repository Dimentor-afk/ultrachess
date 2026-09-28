import { applyMove } from './apply';
import { barrierBlocks, isSquareAttacked } from './attack';
import { CELLS, opposite } from './coords';
import { makeCtx } from './gen';
import { generatorFor } from './modifiers';
import { clonePosition, emptyHidden, findKing, isFrozen } from './position';
import type { Color, Move, Position } from './types';

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
  return k >= 0 && !isSquareAttacked(after, k, opposite(color), after.ply);
}

/** Legal moves of the side to move (empty while a choice is pending). */
export function legalMoves(pos: Position): Move[] {
  const color = pos.turn;
  if (pos.pending.some((pc) => pc.color === color)) return [];
  const enemy = opposite(color);
  const ply = pos.ply;
  const ctx = makeCtx(pos, color, ply, false);
  ctx.squareAttacked = (s) => isSquareAttacked(pos, s, enemy, ply + 1);
  const out: Move[] = [];
  let belief: Position | null = null;
  for (let s = 0; s < CELLS; s++) {
    const p = pos.board[s];
    if (!p || p.color !== color || isFrozen(pos, p.id, ply)) continue;
    for (const m of generatorFor(p.cardId)(ctx, p, s)) {
      if (m.captures.some((c) => pos.board[c]?.type === 'king')) continue;
      if (barrierBlocks(pos, color, ply, m)) continue;
      // Taking an illusion is judged as if it were the real piece the player
      // sees, so legality never reveals which pieces are illusions.
      const touch = m.touch ?? m.captures[0];
      let base = pos;
      if (touch !== undefined && pos.board[touch] === null) {
        belief ??= beliefFor(pos, color);
        base = belief;
      }
      if (kingSafeAfter(base, m, color)) out.push(m);
    }
  }
  return out;
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
