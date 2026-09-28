import { describe, expect, it } from 'vitest';
import { legalMoves } from '../legal';
import { inCheck } from '../status';
import { S, at, build, findMove, kingShuffle, movesFrom, play, targets } from './helpers';

const K = { a1: 'w:king-classic', h8: 'b:king-classic' };

describe('pawn cards', () => {
  it('Штурмовик captures straight ahead only', () => {
    const pos = build({ ...K, e4: 'w:pawn-stormer', e5: 'b:pawn-classic', d5: 'b:pawn-classic' });
    expect(targets(pos, 'e4')).toEqual(['e5']);
    expect(findMove(pos, 'e4', 'e5').captures).toEqual([S('e5')]);
  });

  it('Відступник steps back and has no double step', () => {
    const pos = build({ ...K, d2: 'w:pawn-retreater' });
    expect(targets(pos, 'd2')).toEqual(['d1', 'd3']);
  });

  it('Косий пішак moves diagonally once and then skips a turn', () => {
    let pos = build({ ...K, d4: 'w:pawn-oblique' });
    expect(targets(pos, 'd4')).toEqual(['c5', 'd5', 'e5']);
    pos = play(pos, 'd4', 'c5', 'Косий');
    expect(pos.onceUsed['w-d4']).toBe(true);
    pos = kingShuffle(pos); // black
    expect(movesFrom(pos, 'c5')).toHaveLength(0); // skips this turn
    pos = kingShuffle(kingShuffle(pos));
    expect(targets(pos, 'c5')).toEqual(['c6']); // diagonal step used up
  });

  it('Таран pushes the enemy pawn back and takes its square', () => {
    const pos = build({ ...K, e4: 'w:pawn-ram', e5: 'b:pawn-classic' });
    const after = play(pos, 'e4', 'e5', 'Таран');
    expect(at(after, 'e5')).toBe('w:pawn-ram');
    expect(at(after, 'e6')).toBe('b:pawn-classic');
    const blocked = build({ ...K, e4: 'w:pawn-ram', e5: 'b:pawn-classic', e6: 'b:knight-classic' });
    expect(movesFrom(blocked, 'e4')).toHaveLength(0);
  });

  it('Діагональний moves diagonally and captures straight', () => {
    const pos = build({ ...K, d4: 'w:pawn-diagonal', d5: 'b:knight-classic', e5: 'b:pawn-classic' });
    expect(targets(pos, 'd4')).toEqual(['c5', 'd5']);
  });

  it('Спринтер: 2 squares once from anywhere, no standard double step', () => {
    const start = build({ ...K, d2: 'w:pawn-sprinter' });
    const labels = movesFrom(start, 'd2').map((m) => m.label);
    expect(targets(start, 'd2')).toEqual(['d3', 'd4']);
    expect(labels.some((l) => l.includes('Спринт'))).toBe(true);
    const later = play(build({ ...K, d4: 'w:pawn-sprinter' }), 'd4', 'd6', 'Спринт');
    expect(later.onceUsed['w-d4']).toBe(true);
  });

  it('Впертий swaps with the enemy piece ahead, never with the king', () => {
    let pos = build({ ...K, e4: 'w:pawn-stubborn', e5: 'b:knight-classic' });
    pos = play(pos, 'e4', 'e5', 'Помінятися');
    expect(at(pos, 'e5')).toBe('w:pawn-stubborn');
    expect(at(pos, 'e4')).toBe('b:knight-classic');
    expect(pos.frozenUntil['w-e4']).toBe(2);

    const kingAhead = build({ a1: 'w:king-classic', e4: 'w:pawn-stubborn', e5: 'b:king-classic' });
    expect(movesFrom(kingAhead, 'e4')).toHaveLength(0);
  });

  it('Марафонець goes up to 3 squares on its first move', () => {
    const pos = build({ ...K, d2: 'w:pawn-marathoner' });
    expect(targets(pos, 'd2')).toEqual(['d3', 'd4', 'd5']);
    const moved = play(pos, 'd2', 'd3');
    expect(targets(kingShuffle(moved), 'd3')).toEqual(['d4']);
  });

  it('Фантом jumps a piece once and never promotes afterwards', () => {
    const pos = build({ ...K, d6: 'w:pawn-phantom', d7: 'b:pawn-classic' });
    const jump = findMove(pos, 'd6', 'd8', 'Фантом');
    expect(jump.promotion).toBeUndefined();
    const after = play(pos, 'd6', 'd8', 'Фантом');
    expect(at(after, 'd8')).toBe('w:pawn-phantom');
    expect(after.noPromote['w-d6']).toBe(true);
  });

  it('Списник strikes two squares ahead, lands one ahead and gives check', () => {
    const pos = build({ ...K, d4: 'w:pawn-spearman', d6: 'b:knight-classic', c5: 'b:bishop-classic' });
    const strike = findMove(pos, 'd4', 'd6');
    expect(strike.to).toBe(S('d5'));
    expect(targets(pos, 'd4')).not.toContain('c5');
    const after = play(pos, 'd4', 'd6');
    expect(at(after, 'd5')).toBe('w:pawn-spearman');
    expect(at(after, 'd6')).toBeNull();

    const check = build({ a1: 'w:king-classic', d4: 'w:pawn-spearman', d6: 'b:king-classic' }, 'b');
    expect(inCheck(check)).toBe(true);
  });

  it('Засідник kills an enemy stepping diagonally in front of it and dies', () => {
    const pos = build({ ...K, d4: 'w:pawn-ambusher', g6: 'b:knight-classic' }, 'b');
    const after = play(pos, 'g6', 'e5');
    expect(at(after, 'e5')).toBeNull();
    expect(at(after, 'd4')).toBeNull();
  });

  it('Щитоносець survives one pawn capture by stepping back', () => {
    const pos = build({ ...K, e4: 'w:pawn-shieldbearer', d5: 'b:pawn-classic' }, 'b');
    const after = play(pos, 'd5', 'e4');
    expect(at(after, 'e4')).toBe('b:pawn-classic');
    expect(at(after, 'e3')).toBe('w:pawn-shieldbearer');
    expect(after.onceUsed['w-e4']).toBe(true);

    const byKnight = play(build({ ...K, e4: 'w:pawn-shieldbearer', f6: 'b:knight-classic' }, 'b'), 'f6', 'e4');
    expect(at(byKnight, 'e3')).toBeNull();
  });

  it('Дуеліст may return after a capture and then skips a turn', () => {
    const pos = build({ ...K, e4: 'w:pawn-duelist', d5: 'b:knight-classic' });
    const labels = movesFrom(pos, 'e4')
      .filter((m) => m.target === S('d5'))
      .map((m) => m.label);
    expect(labels).toEqual(['Взяти', 'Взяти й повернутись']);
    const after = play(pos, 'e4', 'd5', 'повернутись');
    expect(at(after, 'e4')).toBe('w:pawn-duelist');
    expect(at(after, 'd5')).toBeNull();
    expect(legalMoves(kingShuffle(after)).some((m) => m.from === S('e4'))).toBe(false);
  });
});
