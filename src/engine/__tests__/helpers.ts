import { getCard } from '../cards';
import { parseSquare } from '../coords';
import { applyMove } from '../apply';
import { legalMoves } from '../legal';
import { emptyPosition } from '../position';
import type { Color, Move, Position } from '../types';

/**
 * Build a position from `{ e1: 'w:king-classic', ... }`. Pieces get ids
 * `<color>-<square>`; pawns on their start rank count as unmoved.
 */
export function build(pieces: Record<string, string>, turn: Color = 'w'): Position {
  const pos = emptyPosition();
  for (const [name, spec] of Object.entries(pieces)) {
    const [color, cardId] = spec.split(':') as [Color, string];
    const s = parseSquare(name);
    pos.board[s] = {
      id: `${color}-${name}`,
      color,
      type: getCard(cardId).pieceType,
      cardId,
      moveCount: 0,
      homeSquare: s,
    };
  }
  pos.turn = turn;
  pos.ply = turn === 'w' ? 0 : 1;
  return pos;
}

export const S = parseSquare;

export function movesFrom(pos: Position, from: string): Move[] {
  return legalMoves(pos).filter((m) => m.from === S(from));
}

export function targets(pos: Position, from: string): string[] {
  const names = new Set(movesFrom(pos, from).map((m) => sqName(m.target)));
  return [...names].sort();
}

export function findMove(pos: Position, from: string, target: string, label?: string): Move {
  const m = movesFrom(pos, from).find((x) => x.target === S(target) && (!label || x.label.includes(label)));
  if (!m) {
    const avail = movesFrom(pos, from)
      .map((x) => `${sqName(x.target)}:${x.label}`)
      .join(', ');
    throw new Error(`No move ${from}->${target} ${label ?? ''}. Available: ${avail}`);
  }
  return m;
}

function sqName(s: number): string {
  const f = (s % 10) - 1;
  const r = Math.floor(s / 10) - 1;
  return `${'abcdefgh'[f] ?? '?'}${r + 1}`;
}

export function at(pos: Position, name: string): string | null {
  const p = pos.board[S(name)];
  return p ? `${p.color}:${p.cardId}` : null;
}

/** Play a legal move (throws if it is not legal). */
export function play(pos: Position, from: string, target: string, label?: string): Position {
  return applyMove(pos, findMove(pos, from, target, label));
}

/** Pass the turn with a quiet king move of the side to move. */
export function kingShuffle(pos: Position): Position {
  const m = legalMoves(pos).find((x) => pos.board[x.from]?.type === 'king' && !x.captures.length && x.kind !== 'castle');
  if (!m) throw new Error('No quiet king move');
  return applyMove(pos, m);
}
