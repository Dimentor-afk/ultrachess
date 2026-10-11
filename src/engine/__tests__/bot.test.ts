import { describe, expect, it } from 'vitest';
import { MATE, chooseTurn } from '../bot/search';
import { candidateMoves, isLegalCandidate, legalMoves } from '../legal';
import { classicDeck } from '../deck';
import { type MatchState, createMatch, performAction } from '../match';
import type { Deck, Position } from '../types';
import { S, build } from './helpers';

function asMatch(pos: Position): MatchState {
  return {
    ...pos,
    decks: { w: classicDeck(), b: classicDeck() },
    history: [],
    repetition: {},
    status: 'playing',
    result: null,
    lastMove: null,
    fx: null,
  };
}

describe('bot', () => {
  it('finds a mate in one', () => {
    const pos = build({ g1: 'w:king-classic', f2: 'w:pawn-classic', g2: 'w:pawn-classic', h2: 'w:pawn-classic', a8: 'b:rook-classic', h8: 'b:king-classic' }, 'b');
    const turn = chooseTurn(asMatch(pos), 'b', { depth: 2, timeMs: 2000 });
    const move = turn.actions.find((a) => a.type === 'move');
    expect(move && move.type === 'move' && move.move.to).toBe(S('a1'));
  });

  it('finds a mate in two that a 3-ply search cannot see', () => {
    // 1. Qh7+ Kf8 2. Qh8#: needs four plies plus the mate check.
    const pos = build({ g1: 'w:king-classic', h1: 'w:queen-classic', g6: 'w:pawn-classic', f7: 'b:pawn-classic', e7: 'b:pawn-classic', g8: 'b:king-classic', a7: 'b:pawn-classic' }, 'w');
    const turn = chooseTurn(asMatch(pos), 'w', { depth: 6, timeMs: 10_000, noise: 0 });
    const move = turn.actions.find((a) => a.type === 'move');
    expect(move && move.type === 'move' && move.move.to).toBe(S('h7'));
    expect(turn.score).toBeGreaterThan(MATE / 2);
  });

  it('checks legality lazily without changing which moves are legal', () => {
    let s = createMatch(classicDeck(), classicDeck());
    for (let i = 0; i < 40 && !s.result; i++) {
      const lazy = candidateMoves(s).filter((m) => isLegalCandidate(s, m));
      expect(lazy).toEqual(legalMoves(s));
      const moves = legalMoves(s);
      if (!moves.length) break;
      s = performAction(s, { type: 'move', move: moves[(i * 7) % moves.length] });
    }
  });

  it('takes a hanging queen', () => {
    const pos = build({ e1: 'w:king-classic', d4: 'w:queen-classic', e8: 'b:king-classic', c6: 'b:knight-classic' }, 'b');
    const turn = chooseTurn(asMatch(pos), 'b', { depth: 2, timeMs: 2000 });
    const move = turn.actions[0];
    expect(move.type === 'move' && move.move.target).toBe(S('d4'));
  });

  it('plays a full game against itself with special cards without engine errors', () => {
    const fancy: Deck = {
      ...classicDeck('fancy', 'Fancy'),
      pawnVersions: ['pawn-ambusher', 'pawn-duelist'],
      pawnFormation: '12121212',
      rook1: 'rook-kamikaze',
      rook2: 'rook-fortress',
      bishop1: 'bishop-illusionist',
      bishop2: 'bishop-levitation',
      knight1: 'knight-rider',
      knight2: 'knight-berserk',
      queen: 'queen-ricochet',
      king: 'king-barricade',
    };
    const other: Deck = {
      ...classicDeck('other', 'Other'),
      pawnVersions: ['pawn-spearman', 'pawn-shieldbearer'],
      pawnFormation: '11112222',
      rook1: 'rook-earthquake',
      rook2: 'rook-displacer',
      bishop1: 'bishop-piercer',
      bishop2: 'bishop-portal',
      knight1: 'knight-mirage'.replace('mirage', 'wallrunner'),
      knight2: 'knight-galloper',
      queen: 'queen-amazon',
      king: 'king-wanderer',
    };
    let m = createMatch(fancy, other);
    for (let i = 0; i < 60 && !m.result; i++) {
      const turn = chooseTurn(m, m.turn, { depth: 1, timeMs: 300 });
      expect(turn.actions.length).toBeGreaterThan(0);
      for (const a of turn.actions) m = performAction(m, a);
    }
    // Either 60 turns went by, or the game really ended: with these cards a hurried bot can be mated in 3 moves.
    expect(m.result !== null || m.history.length >= 60).toBe(true);
  }, 60000);
});
