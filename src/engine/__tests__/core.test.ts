import { describe, expect, it } from 'vitest';
import { applyMove } from '../apply';
import { classicDeck } from '../deck';
import { legalMoves } from '../legal';
import { createMatch, performAction } from '../match';
import { setupPosition } from '../position';
import type { Position } from '../types';
import { S, build, findMove, targets } from './helpers';

function perft(pos: Position, depth: number): number {
  const moves = legalMoves(pos);
  if (depth === 1) return moves.length;
  let n = 0;
  for (const m of moves) n += perft(applyMove(pos, m), depth - 1);
  return n;
}

describe('classic chess core', () => {
  const start = () => setupPosition(classicDeck(), classicDeck());

  it('matches standard perft (no en passant in the first plies)', () => {
    const pos = start();
    expect(perft(pos, 1)).toBe(20);
    expect(perft(pos, 2)).toBe(400);
    expect(perft(pos, 3)).toBe(8902);
  });

  it('detects fool’s mate', () => {
    let m = createMatch(classicDeck(), classicDeck());
    const play = (from: string, to: string) => {
      const mv = legalMoves(m).find((x) => x.from === S(from) && x.target === S(to))!;
      m = performAction(m, { type: 'move', move: mv });
    };
    play('f2', 'f3');
    play('e7', 'e5');
    play('g2', 'g4');
    play('d8', 'h4');
    expect(m.status).toBe('checkmate');
    expect(m.result?.winner).toBe('b');
  });

  it('detects stalemate', () => {
    const pos = build({ a8: 'b:king-classic', b6: 'w:queen-classic', c1: 'w:king-classic' }, 'b');
    expect(legalMoves(pos)).toHaveLength(0);
  });

  it('castles both sides and forbids castling through check', () => {
    const pos = build({
      e1: 'w:king-classic',
      a1: 'w:rook-classic',
      h1: 'w:rook-classic',
      e8: 'b:king-classic',
    });
    const castles = legalMoves(pos).filter((m) => m.kind === 'castle');
    expect(castles.map((m) => m.to).sort()).toEqual([S('c1'), S('g1')].sort());
    const after = applyMove(pos, castles.find((m) => m.to === S('g1'))!);
    expect(after.board[S('f1')]?.type).toBe('rook');

    const blocked = build({
      e1: 'w:king-classic',
      h1: 'w:rook-classic',
      e8: 'b:king-classic',
      f8: 'b:rook-classic',
    });
    expect(legalMoves(blocked).some((m) => m.kind === 'castle')).toBe(false);
  });

  it('promotes pawns with a choice of piece', () => {
    const pos = build({ a7: 'w:pawn-classic', e1: 'w:king-classic', h8: 'b:king-classic' });
    const promos = legalMoves(pos).filter((m) => m.from === S('a7'));
    expect(promos.map((m) => m.promotion).sort()).toEqual(['bishop', 'knight', 'queen', 'rook']);
  });

  it('pins work for modified pieces too', () => {
    // The sniper bishop on e2 is pinned by the rook on e8.
    const pos = build({
      e1: 'w:king-classic',
      e2: 'w:bishop-sniper',
      e8: 'b:rook-classic',
      a8: 'b:king-classic',
    });
    expect(targets(pos, 'e2')).toEqual([]);
  });

  it('never lets a move capture a king', () => {
    const pos = build({ e1: 'w:king-classic', e2: 'b:queen-classic', h8: 'b:king-classic' });
    expect(findMove(pos, 'e1', 'e2').captures).toEqual([S('e2')]);
    expect(legalMoves(pos).every((m) => m.captures.every((c) => pos.board[c]?.type !== 'king'))).toBe(true);
  });
});
