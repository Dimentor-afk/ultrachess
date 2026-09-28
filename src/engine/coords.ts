import type { Color, Square } from './types';

export const GRID = 10;
export const CELLS = GRID * GRID;
export const NO_SQUARE = -1;

export const sq = (file: number, rank: number): Square => (rank + 1) * GRID + (file + 1);
export const fileOf = (s: Square): number => (s % GRID) - 1;
export const rankOf = (s: Square): number => Math.floor(s / GRID) - 1;

export const onBoard = (file: number, rank: number): boolean =>
  file >= 0 && file < 8 && rank >= 0 && rank < 8;
export const inGrid = (file: number, rank: number): boolean =>
  file >= -1 && file <= 8 && rank >= -1 && rank <= 8;

export const isBoardSquare = (s: Square): boolean => s >= 0 && onBoard(fileOf(s), rankOf(s));
export const isRingSquare = (s: Square): boolean =>
  s >= 0 && s < CELLS && !isBoardSquare(s) && inGrid(fileOf(s), rankOf(s));

/** Square shifted by (df, dr), or NO_SQUARE when it leaves the 10×10 grid. */
export function offset(s: Square, df: number, dr: number): Square {
  const f = fileOf(s) + df;
  const r = rankOf(s) + dr;
  return inGrid(f, r) ? sq(f, r) : NO_SQUARE;
}

export const BOARD_SQUARES: Square[] = [];
for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) BOARD_SQUARES.push(sq(f, r));

export const RING_SQUARES: Square[] = [];
for (let r = -1; r <= 8; r++)
  for (let f = -1; f <= 8; f++) if (!onBoard(f, r)) RING_SQUARES.push(sq(f, r));

export const opposite = (c: Color): Color => (c === 'w' ? 'b' : 'w');
export const forward = (c: Color): number => (c === 'w' ? 1 : -1);
export const homeRank = (c: Color): number => (c === 'w' ? 0 : 7);
export const lastRank = (c: Color): number => (c === 'w' ? 7 : 0);
export const pawnStartRank = (c: Color): number => (c === 'w' ? 1 : 6);
/** Colour that moves on the given ply (white moves on even plies). */
export const colorAtPly = (ply: number): Color => (ply % 2 === 0 ? 'w' : 'b');

export const ORTHO: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
export const DIAG: [number, number][] = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];
export const ALL_DIRS: [number, number][] = [...ORTHO, ...DIAG];
export const KNIGHT_LEAPS: [number, number][] = [
  [1, 2],
  [2, 1],
  [2, -1],
  [1, -2],
  [-1, -2],
  [-2, -1],
  [-2, 1],
  [-1, 2],
];
export const CAMEL_LEAPS: [number, number][] = [
  [1, 3],
  [3, 1],
  [3, -1],
  [1, -3],
  [-1, -3],
  [-3, -1],
  [-3, 1],
  [-1, 3],
];

const FILES = 'abcdefgh';

/** Algebraic name; ring squares get a "поза дошкою" marker. */
export function squareName(s: Square): string {
  const f = fileOf(s);
  const r = rankOf(s);
  if (onBoard(f, r)) return `${FILES[f]}${r + 1}`;
  const fc = f < 0 ? '←' : f > 7 ? '→' : FILES[f];
  const rc = r < 0 ? '↓' : r > 7 ? '↑' : String(r + 1);
  return `${fc}${rc}`;
}

export function parseSquare(name: string): Square {
  const f = FILES.indexOf(name[0]);
  const r = Number(name.slice(1)) - 1;
  if (f < 0 || !(r >= 0 && r < 8)) throw new Error(`Bad square ${name}`);
  return sq(f, r);
}

/** True for board squares on the outer edge (files a/h, ranks 1/8). */
export function isEdgeSquare(s: Square): boolean {
  const f = fileOf(s);
  const r = rankOf(s);
  return onBoard(f, r) && (f === 0 || f === 7 || r === 0 || r === 7);
}
