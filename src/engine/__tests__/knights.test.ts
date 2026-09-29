import { describe, expect, it } from 'vitest';
import { applyChoice } from '../apply';
import { legalMoves } from '../legal';
import { S, at, build, findMove, kingShuffle, movesFrom, play, targets } from './helpers';

const K = { a1: 'w:king-classic', h8: 'b:king-classic' };
const K2 = { e1: 'w:king-classic', e8: 'b:king-classic' };

describe('knight cards', () => {
  it('Верблюд leaps 3+1', () => {
    expect(targets(build({ ...K, d4: 'w:knight-camel' }), 'd4')).toEqual(['a3', 'a5', 'c1', 'c7', 'e1', 'e7', 'g3', 'g5']);
  });

  it('Гінець and Діагональник have a special first jump', () => {
    expect(targets(build({ ...K2, b1: 'w:knight-herald' }), 'b1')).toEqual(['a3', 'b3', 'c3', 'd2']);
    expect(targets(build({ ...K2, b1: 'w:knight-diagonal' }), 'b1')).toEqual(['a3', 'c3', 'd2', 'd3']);
  });

  it('Оруженосець also steps one square straight without capturing', () => {
    const pos = build({ ...K, d4: 'w:knight-squire', d5: 'b:pawn-classic' });
    expect(targets(pos, 'd4')).toEqual(expect.arrayContaining(['c4', 'd3', 'e4']));
    expect(targets(pos, 'd4')).not.toContain('d5');
  });

  it('Центровий кінь and Побратим gain 3+1 leaps under their conditions', () => {
    expect(targets(build({ ...K, d4: 'w:knight-central' }), 'd4')).toContain('g5');
    expect(targets(build({ ...K2, b1: 'w:knight-central' }), 'b1')).not.toContain('c4');
    expect(targets(build({ ...K, d4: 'w:knight-brother', e4: 'w:knight-classic' }), 'd4')).toContain('c7');
    expect(targets(build({ ...K, d4: 'w:knight-brother' }), 'd4')).not.toContain('c7');
  });

  it('Стінобіг runs along the edge after landing there', () => {
    const t = targets(build({ c2: 'w:knight-wallrunner', h1: 'w:king-classic', h8: 'b:king-classic' }), 'c2');
    expect(t).toEqual(expect.arrayContaining(['a2', 'b1']));
  });

  it('Скакун may double-jump on its first move, lands first and needs no rest', () => {
    const pos = build({ ...K2, b1: 'w:knight-galloper' });
    const m = findMove(pos, 'b1', 'e4');
    expect(m.skip).toBeUndefined();
    expect(m.legs).toHaveLength(2);
    expect(m.legs![0].stop).toBe(true);
    expect(m.legs!.every((l) => l.style === 'hop')).toBe(true);
  });

  it('Стінобіг jumps to the wall first, then runs along it', () => {
    const pos = build({ ...K2, c3: 'w:knight-wallrunner' });
    const run = movesFrom(pos, 'c3').find((m) => m.label.startsWith('Стрибок і біг'))!;
    expect(run.legs!.map((l) => l.style)).toEqual(['hop', 'slide']);
    expect(run.legs![0].stop).toBe(true);
  });

  it('Трамплін lets own sliders pass through it', () => {
    const pos = build({ ...K2, c1: 'w:bishop-classic', d2: 'w:knight-springboard' });
    const t = targets(pos, 'c1');
    expect(t).toEqual(expect.arrayContaining(['e3', 'f4', 'h6']));
    expect(t).not.toContain('d2');
  });

  it('Ротатор swaps with an adjacent own pawn, not twice in a row', () => {
    let pos = build({ ...K, d4: 'w:knight-rotator', e5: 'w:pawn-classic' });
    pos = play(pos, 'd4', 'e5', 'пішаком');
    expect(at(pos, 'e5')).toBe('w:knight-rotator');
    expect(at(pos, 'd4')).toBe('w:pawn-classic');
    pos = kingShuffle(pos);
    expect(movesFrom(pos, 'e5').some((m) => m.kind === 'swap')).toBe(false);
  });

  it('Берсерк chains a second capture and then skips a turn', () => {
    const pos = build({ ...K, d4: 'w:knight-berserk', e6: 'b:pawn-classic', g7: 'b:knight-classic' });
    const after = play(pos, 'd4', 'e6', 'Берсерк');
    expect(at(after, 'g7')).toBe('w:knight-berserk');
    expect(at(after, 'e6')).toBeNull();
    expect(after.frozenUntil['w-d4']).toBe(2);
  });

  it('Вершник carries a pawn that dies instead of it', () => {
    let pos = build({ ...K, d4: 'w:knight-rider', e6: 'w:pawn-classic', c8: 'b:bishop-classic' });
    pos = play(pos, 'd4', 'e6', 'Посадити');
    expect(pos.passengers['w-d4']?.id).toBe('w-e6');
    pos = play(pos, 'c8', 'e6');
    expect(at(pos, 'e6')).toBe('b:bishop-classic');
    expect(pos.pending).toHaveLength(1);
    expect(legalMoves(pos)).toHaveLength(0); // must pick a landing square first
    pos = applyChoice(pos, S('d4')).pos;
    expect(at(pos, 'd4')).toBe('w:knight-rider');
    expect(pos.passengers['w-d4']).toBeUndefined();
    expect(movesFrom(pos, 'd4')).toHaveLength(0); // skips this turn
  });
});
