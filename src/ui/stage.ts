// Moves that share a clicked square are chosen on the board, not in a menu.

import type { Move, Square } from '../engine/types';

export interface Stage {
  target: Square;
  /** Landing square → the variants that end there. */
  byDest: Map<Square, Move[]>;
  /** The plain variant: where the piece is shown while choosing. */
  main: Square;
}

export function makeStage(target: Square, moves: Move[]): Stage {
  const byDest = new Map<Square, Move[]>();
  for (const m of moves) {
    const d = m.to ?? m.target;
    byDest.set(d, [...(byDest.get(d) ?? []), m]);
  }
  // Prefer landing on the clicked square with an ordinary (not once-per-game) move.
  const score = (m: Move) => (((m.to ?? m.target) === target ? 0 : 2) + (m.once || m.skip ? 1 : 0));
  const best = [...moves].sort((a, b) => score(a) - score(b))[0];
  const main = best.to ?? best.target;
  byDest.set(main, [best, ...byDest.get(main)!.filter((m) => m !== best)]);
  return { target, byDest, main };
}

