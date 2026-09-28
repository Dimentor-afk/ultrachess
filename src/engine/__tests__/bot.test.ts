import { describe, expect, it } from 'vitest';
import { chooseTurn } from '../bot/search';
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
  };
}

describe('bot', () => {
  it('finds a mate in one', () => {
    const pos = build({ g1: 'w:king-classic', f2: 'w:pawn-classic', g2: 'w:pawn-classic', h2: 'w:pawn-classic', a8: 'b:rook-classic', h8: 'b:king-classic' }, 'b');
    const turn = chooseTurn(asMatch(pos), 'b', { depth: 2, timeMs: 2000 });
    const move = turn.actions.find((a) => a.type === 'move');
    expect(move && move.type === 'move' && move.move.to).toBe(S('a1'));
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
    expect(m.history.length).toBeGreaterThan(10);
  }, 60000);
});
