import { describe, expect, it } from 'vitest';
import { CARDS } from '../cards';
import { cardsOf } from '../../economy/packs';
import { legalMoves } from '../legal';
import { S, at, build, findMove, play } from './helpers';

const dashes = (pos: ReturnType<typeof build>) => legalMoves(pos).filter((m) => m.kind === 'dash');

describe('Комета', () => {
  it('dashes 2–5 squares in all 8 directions on an open board', () => {
    const pos = build({ d4: 'w:king-comet', h8: 'b:king-classic' });
    const names = dashes(pos).map((m) => m.to);
    // up 4 (to d8), down 3, left 3, right 4, diagonals: c3 b2 a1 / e5 f6 g7 (h8 = enemy king, not takeable) / c5 b6 a7 / e3 f2 g1
    expect(names).toContain(S('d8'));
    expect(names).toContain(S('h4'));
    expect(names).toContain(S('a1'));
    expect(names).not.toContain(S('d5')); // one square is a plain king step, not a dash
    expect(dashes(pos).every((m) => m.path.length >= 2 && m.path.length <= 5)).toBe(true);
  });

  it('is blocked by its own pieces and takes the first enemy in the way', () => {
    const pos = build({ a1: 'w:king-comet', a4: 'w:rook-classic', d4: 'b:knight-classic', e5: 'b:knight-classic', h8: 'b:king-classic' });
    const to = dashes(pos).map((m) => m.to);
    expect(to).toContain(S('a3'));
    expect(to).not.toContain(S('a4'));
    expect(to).not.toContain(S('a5'));
    expect(to).toContain(S('d4'));
    expect(to).not.toContain(S('e5'));
    const take = findMove(pos, 'a1', 'd4', 'Ривок Комети');
    expect(take.captures).toEqual([S('d4')]);
  });

  it('recharges for 6 turns after a dash', () => {
    let pos = build({ d1: 'w:king-comet', h8: 'b:king-classic' });
    pos = play(pos, 'd1', 'd5', 'Ривок');
    expect(at(pos, 'd5')).toBe('w:king-comet');
    expect(pos.cooldowns['w-d1']).toBe(6);
    pos.turn = 'w';
    expect(dashes(pos)).toHaveLength(0);
  });

  it('never lands on an attacked square', () => {
    const pos = build({ d1: 'w:king-comet', a5: 'b:rook-classic', h8: 'b:king-classic' });
    expect(dashes(pos).map((m) => m.to)).not.toContain(S('d5'));
  });

  it('is a trial reward only: never in packs', () => {
    expect(CARDS.find((c) => c.id === 'king-comet')?.trialOnly).toBe('comet');
    expect(cardsOf('mythological').some((c) => c.id === 'king-comet')).toBe(false);
  });
});
