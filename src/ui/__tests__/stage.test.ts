import { describe, expect, it } from 'vitest';
import { S, build, movesFrom } from '../../engine/__tests__/helpers';
import { makeStage } from '../stage';

const K = { a1: 'w:king-classic', h8: 'b:king-classic' };

describe('on-board variant choice', () => {
  it('Дуеліст: the piece stands on the captured square, the way back is an option', () => {
    const pos = build({ ...K, e4: 'w:pawn-duelist', d5: 'b:knight-classic' });
    const ms = movesFrom(pos, 'e4').filter((m) => m.target === S('d5'));
    const st = makeStage(S('d5'), ms);
    expect(st.main).toBe(S('d5'));
    expect(st.byDest.get(S('d5'))![0].label).toBe('Взяти');
    expect(st.byDest.get(S('e4'))![0].label).toBe('Взяти й повернутись');
  });

  it('promotion variants share one square and go to a popover', () => {
    const pos = build({ ...K, e7: 'w:pawn-classic' });
    const ms = movesFrom(pos, 'e7').filter((m) => m.target === S('e8'));
    const st = makeStage(S('e8'), ms);
    expect(st.byDest.size).toBe(1);
    expect(st.byDest.get(S('e8'))!.length).toBeGreaterThan(1);
  });
});
