import { describe, expect, it } from 'vitest';
import { S, build, movesFrom } from '../../engine/__tests__/helpers';
import { advanceStage, nextStops, stageAt, startStage, stayMoves } from '../stage';

const K = { a1: 'w:king-classic', h8: 'b:king-classic' };

describe('on-board choice, stop by stop', () => {
  it('Дуеліст: the piece stands on the captured square, the way back is the next stop', () => {
    const pos = build({ ...K, e4: 'w:pawn-duelist', d5: 'b:knight-classic' });
    const st = startStage(movesFrom(pos, 'e4'), S('d5'))!;
    expect(stageAt(st)).toBe(S('d5'));
    expect(stayMoves(st).map((m) => m.label)).toEqual(['Взяти']);
    expect([...nextStops(st).keys()]).toEqual([S('e4')]);
    expect(stayMoves(advanceStage(st, S('e4'))!)[0].label).toBe('Взяти й повернутись');
  });

  it('Стінобіг: first the wall, then the run', () => {
    const pos = build({ c3: 'w:knight-wallrunner', h1: 'w:king-classic', h8: 'b:king-classic' });
    const st = startStage(movesFrom(pos, 'c3'), S('a4'))!;
    expect(stayMoves(st)).toHaveLength(1);
    expect([...nextStops(st).keys()].sort()).toEqual([S('a2'), S('a3'), S('a5'), S('a6')].sort());
    // The run's end square is not a first tap.
    expect(startStage(movesFrom(pos, 'c3'), S('a6'))).toBeNull();
  });

  it('Берсерк: the second capture is offered after the first', () => {
    const pos = build({ ...K, d4: 'w:knight-berserk', e6: 'b:pawn-classic', g7: 'b:knight-classic' });
    const st = startStage(movesFrom(pos, 'd4'), S('e6'))!;
    expect([...nextStops(st).keys()]).toEqual([S('g7')]);
  });

  it('promotion variants share one stop and go to a popover', () => {
    const pos = build({ ...K, e7: 'w:pawn-classic' });
    const st = startStage(movesFrom(pos, 'e7'), S('e8'))!;
    expect(nextStops(st).size).toBe(0);
    expect(stayMoves(st).length).toBeGreaterThan(1);
  });
});
