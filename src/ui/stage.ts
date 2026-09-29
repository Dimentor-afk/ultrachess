// Moves are picked on the board, stop by stop: a move that lands somewhere
// and may go on (Стінобіг touches the wall, Берсерк takes the first piece,
// a ricochet reaches the edge) first shows the piece on that stop; the player
// then taps the piece to stay or a highlighted square to continue.

import type { Move, Square } from '../engine/types';

/** The squares a player taps to make this move, in order. */
export function stopsOf(m: Move): Square[] {
  const legs = m.legs ?? [];
  const mids = legs.filter((l, i) => l.stop && i < legs.length - 1).map((l) => l.to);
  return mids.length ? [...mids, m.to ?? m.target] : [m.target];
}

export interface Stage {
  /** Stops chosen so far; the piece is shown on the last one. */
  path: Square[];
  /** Moves that pass through these stops. */
  moves: Move[];
}

export const stageAt = (st: Stage): Square => st.path[st.path.length - 1];

/** Moves that end on the current stop. */
export function stayMoves(st: Stage): Move[] {
  return st.moves.filter((m) => stopsOf(m).length === st.path.length);
}

/** Next stops → the moves that go there. */
export function nextStops(st: Stage): Map<Square, Move[]> {
  const out = new Map<Square, Move[]>();
  for (const m of st.moves) {
    const s = stopsOf(m)[st.path.length];
    if (s === undefined) continue;
    out.set(s, [...(out.get(s) ?? []), m]);
  }
  return out;
}

/** Moves of a piece whose first tap is `s`. */
export function startStage(moves: Move[], s: Square): Stage | null {
  const hit = moves.filter((m) => stopsOf(m)[0] === s);
  return hit.length ? { path: [s], moves: hit } : null;
}

/** Continue to the next stop `s`, or null when it is not one. */
export function advanceStage(st: Stage, s: Square): Stage | null {
  const next = nextStops(st).get(s);
  return next ? { path: [...st.path, s], moves: next } : null;
}
