import { movesViaAbilities } from './abilities';
import { applyChoice } from './apply';
import { isSquareAttacked } from './attack';
import { opposite } from './coords';
import { legalMoves } from './legal';
import { findKing } from './position';
import type { Color, Position } from './types';

export function inCheck(pos: Position, color: Color = pos.turn): boolean {
  const k = findKing(pos, color);
  return k >= 0 && isSquareAttacked(pos, k, opposite(color));
}

/** Whether the side to move can complete its turn (choice, ability, move). */
export function hasAnyLegalTurn(pos: Position): boolean {
  const pc = pos.pending.find((p) => p.color === pos.turn);
  if (pc) return pc.options.some((o) => hasAnyLegalTurn(applyChoice(pos, o).pos));
  if (legalMoves(pos, false, { limit: 1 }).length > 0) return true;
  return movesViaAbilities(pos);
}
