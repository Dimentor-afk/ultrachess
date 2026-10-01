// The short "clip" on every card: the card's piece in a small staged position,
// its moves, and the most telling one played out. The engine finds the moves,
// so every card shows its real rules; the layouts only give it room and targets.

import { CARD_BY_ID, CLASSIC_CARD } from '../engine/cards';
import { parseSquare } from '../engine/coords';
import { applyMove } from '../engine/apply';
import { legalMoves } from '../engine/legal';
import { emptyPosition } from '../engine/position';
import type { Color, Move, PieceType, Position } from '../engine/types';
import { stopsOf } from './stage';

export interface CardDemo {
  before: Position;
  after: Position;
  pieceId: string;
  /** Every move of the card's piece (shown as marks before the play). */
  moves: Move[];
  /** The move played in the clip. */
  move: Move;
}

type Layout = { at: string; pieces: Record<string, string> };

/** Plain pieces by square: `w:rook` or `b:pawn` (classic cards). */
const LAYOUTS: Record<PieceType, Layout[]> = {
  pawn: [
    { at: 'e2', pieces: { d3: 'b:pawn', f3: 'b:knight' } },
    { at: 'e2', pieces: { e3: 'b:pawn', d3: 'b:knight' } },
    { at: 'e3', pieces: { e5: 'b:knight', d4: 'b:pawn' } },
    { at: 'e2', pieces: { e3: 'w:knight', f3: 'b:pawn' } },
    { at: 'e4', pieces: { d5: 'b:pawn', f6: 'b:knight' } },
  ],
  bishop: [
    { at: 'd4', pieces: { g7: 'b:pawn', b2: 'b:knight' } },
    { at: 'd4', pieces: { e5: 'w:pawn', g7: 'b:knight', b2: 'b:pawn' } },
    { at: 'c1', pieces: { d2: 'w:pawn', f4: 'b:pawn' } },
  ],
  rook: [
    { at: 'd4', pieces: { d7: 'b:pawn', g4: 'b:knight' } },
    { at: 'd4', pieces: { d5: 'w:pawn', d7: 'b:knight', g4: 'b:pawn' } },
    { at: 'a1', pieces: { a2: 'w:pawn', b1: 'w:knight', a5: 'b:pawn' } },
  ],
  knight: [
    { at: 'd4', pieces: { e6: 'b:pawn', f3: 'b:knight' } },
    { at: 'd4', pieces: { c4: 'w:knight', e6: 'b:pawn' } },
    { at: 'c3', pieces: { e4: 'b:pawn', d5: 'b:pawn' } },
    { at: 'd4', pieces: { e7: 'b:pawn', g5: 'b:knight' } },
  ],
  queen: [
    { at: 'd4', pieces: { g7: 'b:pawn', d7: 'b:knight' } },
    { at: 'd4', pieces: { e5: 'w:pawn', f6: 'b:knight', d7: 'b:pawn' } },
  ],
  king: [
    { at: 'd4', pieces: { b6: 'b:pawn' } },
    { at: 'e1', pieces: { a1: 'w:rook', h1: 'w:rook', b1: 'w:knight', e4: 'b:pawn' } },
  ],
};

function position(cardId: string, layout: Layout): Position {
  const pos = emptyPosition();
  const card = CARD_BY_ID[cardId];
  const put = (sqName: string, color: Color, id: string) => {
    const s = parseSquare(sqName);
    const c = CARD_BY_ID[id];
    pos.board[s] = { id: `${color}-${sqName}`, color, type: c.pieceType, cardId: id, moveCount: 0, homeSquare: s };
  };
  put(layout.at, 'w', cardId);
  for (const [s, spec] of Object.entries(layout.pieces)) {
    const [color, type] = spec.split(':') as [Color, PieceType];
    put(s, color, CLASSIC_CARD[type]);
  }
  // Both kings, out of the way (unless the card is a king itself).
  if (card.pieceType !== 'king' && !pos.board[parseSquare('h1')]) put('h1', 'w', 'king-classic');
  if (!pos.board[parseSquare('a8')]) put('a8', 'b', 'king-classic');
  pos.turn = 'w';
  pos.ply = 0;
  return pos;
}

const key = (m: Move) => `${m.target}|${m.label}`;

/**
 * How well a move shows what the card does: above all, a move the classic
 * piece could not make from the same spot; then captures and longer trips.
 */
function score(m: Move, classic: Set<string>): number {
  const special = !classic.has(key(m));
  return (special ? 10 : 0) + (m.captures.length ? 3 : 0) + Math.min(stopsOf(m).length, 3) + Math.min(m.path.length, 5) * 0.2;
}

const cache = new Map<string, CardDemo | null>();

export function buildDemo(cardId: string): CardDemo | null {
  if (cache.has(cardId)) return cache.get(cardId)!;
  const card = CARD_BY_ID[cardId];
  let best: (CardDemo & { score: number }) | null = null;
  for (const layout of card ? LAYOUTS[card.pieceType] : []) {
    try {
      const pos = position(cardId, layout);
      const pieceId = `w-${layout.at}`;
      const moves = legalMoves(pos).filter((m) => m.pieceId === pieceId);
      const classicPos = position(CLASSIC_CARD[card.pieceType], layout);
      const classic = new Set(legalMoves(classicPos).filter((m) => m.pieceId === pieceId).map(key));
      for (const m of moves) {
        const sc = score(m, classic);
        if (!best || sc > best.score) best = { before: pos, after: applyMove(pos, m), pieceId, moves, move: m, score: sc };
      }
    } catch {
      // A layout this card cannot use: try the next one.
    }
  }
  const out = best && { before: best.before, after: best.after, pieceId: best.pieceId, moves: best.moves, move: best.move };
  cache.set(cardId, out);
  return out;
}
