import { describe, expect, it } from 'vitest';
import { applyAbility, abilityOptions } from '../abilities';
import { sq } from '../coords';
import { applyMove } from '../apply';
import { legalMoves } from '../legal';
import { hasAnyLegalTurn, inCheck } from '../status';
import { S, at, build, findMove, kingShuffle, movesFrom, play, targets } from './helpers';

describe('jumpers', () => {
  it('Стрибун and Стрибуча тура jump with a run-up only, and land right behind', () => {
    for (const [card, at0, near, far, land] of [
      ['bishop-jumper', 'c1', 'd2', 'e3', 'f4'],
      ['rook-jumper', 'd1', 'd2', 'd3', 'd4'],
    ] as const) {
      // A piece right next to it (the pawns at the start): no jump, first move or not.
      const close = build({ [at0]: `w:${card}`, [near]: 'w:pawn-classic', h1: 'w:king-classic', a8: 'b:king-classic' });
      expect(movesFrom(close, at0).some((m) => m.label.includes('Перестрибнути')), card).toBe(false);
      // One empty square before it: the jump is there, even on the first move.
      const runUp = build({ [at0]: `w:${card}`, [far]: 'w:pawn-classic', h1: 'w:king-classic', a8: 'b:king-classic' });
      const jumps = movesFrom(runUp, at0).filter((m) => m.label.includes('Перестрибнути'));
      expect(jumps.map((m) => m.target), card).toEqual([S(land)]);
    }
  });
});

describe('bishop cards', () => {
  it('Вартовий: moves like a queen, but only 1–2 squares', () => {
    const pos = build({ a1: 'w:bishop-sentinel', a2: 'b:pawn-classic', h1: 'w:king-classic', h7: 'b:king-classic' });
    expect(targets(pos, 'a1')).toEqual(['a2', 'b1', 'b2', 'c1', 'c3']);
  });

  it('Снайпер cannot capture adjacent pieces and may step past a far capture', () => {
    const near = build({ c1: 'w:bishop-sniper', d2: 'b:pawn-classic', h1: 'w:king-classic', e8: 'b:king-classic' });
    expect(targets(near, 'c1')).toEqual(['a3', 'b2']);
    const far = build({ a1: 'w:bishop-sniper', c3: 'b:knight-classic', h1: 'w:king-classic', a8: 'b:king-classic' });
    const labels = movesFrom(far, 'a1')
      .filter((m) => m.target === S('c3'))
      .map((m) => m.label);
    expect(labels).toEqual(['Взяти', 'Взяти й пройти ще 1 клітинку']);
    const after = play(far, 'a1', 'c3', 'пройти');
    expect(at(after, 'd4')).toBe('w:bishop-sniper');
    expect(at(after, 'c3')).toBeNull();
  });

  it('Десантник jumps a piece on its first move only', () => {
    const pos = build({ c1: 'w:bishop-paratrooper', d2: 'w:pawn-classic', e1: 'w:king-classic', e8: 'b:king-classic' });
    const jump = findMove(pos, 'c1', 'e3', 'Десант');
    expect(jump.skip).toBe(1);
    const moved = build({ c1: 'w:bishop-paratrooper', d2: 'w:pawn-classic', e1: 'w:king-classic', e8: 'b:king-classic' });
    moved.board[S('c1')] = { ...moved.board[S('c1')]!, moveCount: 1 };
    expect(targets(moved, 'c1')).toEqual(['b2', 'a3'].sort());
  });

  it('Стрибун needs a gap before the piece it jumps', () => {
    const pos = build({ c1: 'w:bishop-jumper', d2: 'b:pawn-classic', h1: 'w:king-classic', e8: 'b:king-classic' });
    expect(targets(pos, 'c1')).not.toContain('e3');
    expect(targets(pos, 'c1')).toContain('d2');
    const gap = build({ c1: 'w:bishop-jumper', e3: 'b:pawn-classic', h1: 'w:king-classic', e8: 'b:king-classic' });
    expect(targets(gap, 'c1')).toContain('f4');
  });

  it('Мученик freezes its killer for two turns', () => {
    let pos = build({ d4: 'b:bishop-martyr', e3: 'w:pawn-classic', a1: 'w:king-classic', h8: 'b:king-classic' });
    pos = play(pos, 'e3', 'd4');
    pos = kingShuffle(pos);
    expect(movesFrom(pos, 'd4')).toHaveLength(0);
    pos = kingShuffle(kingShuffle(pos));
    expect(movesFrom(pos, 'd4')).toHaveLength(0);
    pos = kingShuffle(kingShuffle(pos));
    expect(targets(pos, 'd4')).toEqual(['d5']);
  });

  it('Рикошетник bounces off the edge onto a new diagonal', () => {
    const pos = build({ c1: 'w:bishop-ricochet', e1: 'w:king-classic', e8: 'b:king-classic' });
    const t = targets(pos, 'c1');
    expect(t).toContain('g7');
    expect(t).toContain('b4');
  });

  it('Проколювач strikes through one piece and dies', () => {
    const pos = build({
      a1: 'w:bishop-piercer',
      c3: 'w:pawn-classic',
      e5: 'b:knight-classic',
      h1: 'w:king-classic',
      a8: 'b:king-classic',
    });
    const after = play(pos, 'a1', 'e5', 'Прокол');
    expect(at(after, 'e5')).toBeNull();
    expect(at(after, 'a1')).toBeNull();
    expect(at(after, 'c3')).toBe('w:pawn-classic');
  });

  it('Ланцюговий turns once after a short first leg', () => {
    const pos = build({ d4: 'w:bishop-chain', a1: 'w:king-classic', a8: 'b:king-classic' });
    expect(targets(pos, 'd4')).toContain('f4');
    expect(targets(pos, 'd4')).toContain('d6');
  });

  it('Хамелеон steps to an adjacent square of the other colour', () => {
    const pos = build({ c1: 'w:bishop-chameleon', e1: 'w:king-classic', e8: 'b:king-classic' });
    expect(targets(pos, 'c1')).toEqual(expect.arrayContaining(['b1', 'c2', 'd1']));
  });

  it('Фланговик jumps two squares along the edge', () => {
    const pos = build({ a3: 'w:bishop-flanker', a4: 'b:pawn-classic', e1: 'w:king-classic', e8: 'b:king-classic' });
    expect(targets(pos, 'a3')).toEqual(expect.arrayContaining(['a1', 'a5']));
  });

  it('Левітаційний слон uses a platform, can be attacked there and falls off', () => {
    const base = { a3: 'w:bishop-levitation', e1: 'w:king-classic', e8: 'b:king-classic' };
    let pos = build(base);
    const lev = legalMoves(pos).filter((m) => m.kind === 'levitate');
    expect(lev.map((m) => m.to)).toEqual(expect.arrayContaining([sq(-1, 1), sq(-1, 3)]));
    pos = applyMove(pos, lev.find((m) => m.to === sq(-1, 3))!);
    expect(pos.platforms).toHaveLength(1);
    expect(pos.cooldowns['w-a3']).toBe(5);

    // An enemy rook on the same rank can hit the platform.
    const attacked = applyMove(build({ ...base, h4: 'b:rook-classic' }), lev.find((m) => m.to === sq(-1, 3))!);
    expect(legalMoves(attacked).some((m) => m.from === S('h4') && m.captures[0] === sq(-1, 3))).toBe(true);

    // The attacker takes the platform, holds it while it lives and then steps back.
    let held = applyMove(attacked, legalMoves(attacked).find((m) => m.from === S('h4') && m.captures[0] === sq(-1, 3))!);
    expect(held.board[sq(-1, 3)]?.cardId).toBe('rook-classic');
    expect(held.platforms).toEqual([expect.objectContaining({ square: sq(-1, 3), returnTo: S('h4') })]);
    for (let i = 0; i < 6 && held.board[sq(-1, 3)]; i++) held = kingShuffle(held);
    expect(held.board[sq(-1, 3)]).toBeNull();
    expect(held.board[S('h4')]?.cardId).toBe('rook-classic');

    // It can come back...
    pos = kingShuffle(pos);
    expect(legalMoves(pos).some((m) => m.from === sq(-1, 3) && m.to === S('a5'))).toBe(true);
    // ...but if it stays for 3 opponent turns, it falls.
    pos = kingShuffle(kingShuffle(kingShuffle(kingShuffle(pos))));
    expect(pos.board[sq(-1, 3)]).toBeNull();
    expect(pos.platforms).toHaveLength(0);
  });

  it('Портальний слон leaves through the edge and reappears on the mirrored square', () => {
    // f1 → a6, out of the board, back in on h3 and on to d7 (the user's example).
    const pos = build({ f1: 'w:bishop-portal', d7: 'b:pawn-classic', e1: 'w:king-classic', h8: 'b:king-classic' });
    const t = movesFrom(pos, 'f1').filter((m) => m.label.includes('портал')).map((m) => m.target);
    expect(t).toEqual(expect.arrayContaining([S('h3'), S('g4'), S('f5'), S('e6'), S('d7')]));
    const after = play(pos, 'f1', 'd7', 'портал');
    expect(at(after, 'd7')).toBe('w:bishop-portal');
    // No limit: after the opponent's move the portal works again.
    const again = play(after, 'h8', 'g8');
    expect(movesFrom(again, 'd7').some((m) => m.label.includes('портал'))).toBe(true);
    expect(movesFrom(play(pos, 'f1', 'e2'), 'e2').length).toBe(0); // black to move now
  });

  it('Левітаційна ферзь can fly off at the end of any free line', () => {
    const pos = build({ d1: 'w:queen-levitation', e1: 'w:king-classic', a8: 'b:king-classic' });
    const lev = legalMoves(pos).filter((m) => m.kind === 'levitate').map((m) => m.to);
    expect(lev).toEqual(expect.arrayContaining([sq(8, 5), sq(-1, 4), sq(3, 8), sq(3, -1)]));
  });

  it('Затемнювач blocks the opponent from crossing a diagonal for one ply', () => {
    const pos = build({
      d4: 'w:bishop-eclipse',
      e1: 'w:king-classic',
      a8: 'b:king-classic',
      h2: 'b:rook-classic',
    });
    const options = abilityOptions(pos, 'w-d4');
    expect(options.map((o) => o.label)).toContain('Діагональ a1–h8');
    const armed = applyAbility(pos, 'w-d4', options.find((o) => o.label === 'Діагональ a1–h8')!.key).pos;
    expect(armed.turn).toBe('w'); // pressing does not spend the turn
    const afterWhite = kingShuffle(armed);
    const rook = targets(afterWhite, 'h2');
    expect(rook).toContain('c2');
    expect(rook).not.toContain('b2');
    expect(rook).not.toContain('a2');
    const later = kingShuffle(kingShuffle(afterWhite));
    expect(targets(later, 'h2')).toContain('a2');
  });
});

describe('rook cards', () => {
  const K = { e1: 'w:king-classic', e8: 'b:king-classic' };

  it('Маневрова тура moves in 8 directions up to 4 squares', () => {
    const t = targets(build({ ...K, d4: 'w:rook-maneuver' }), 'd4');
    expect(t).toEqual(expect.arrayContaining(['h8', 'd8', 'a1', 'h4']));
    expect(targets(build({ ...K, a1: 'w:rook-maneuver' }), 'a1')).not.toContain('a6');
  });

  it('Десантна тура jumps on its first move', () => {
    const pos = build({ ...K, a1: 'w:rook-paratrooper', a2: 'w:pawn-classic' });
    expect(findMove(pos, 'a1', 'a3').skip).toBe(1);
  });

  it('Рикошетна тура bounces sideways off the edge', () => {
    const pos = build({ a1: 'w:rook-ricochet', e1: 'w:king-classic', h8: 'b:king-classic' });
    expect(targets(pos, 'a1')).toContain('b8');
  });

  it('Тиха тура steps 1 diagonally onto an empty square, never capturing', () => {
    const pos = build({ ...K, d4: 'w:rook-tunnel', c5: 'b:pawn-classic', d5: 'w:pawn-classic' });
    const t = targets(pos, 'd4');
    expect(t).toEqual(expect.arrayContaining(['e5', 'c3', 'e3', 'd1', 'h4']));
    expect(t).not.toContain('c5');
    expect(t).not.toContain('f6');
    expect(t).not.toContain('d6');
    // The quiet step gives no check: a king on the diagonal is not attacked.
    const kings = build({ d4: 'w:rook-tunnel', a1: 'w:king-classic', e5: 'b:king-classic' });
    expect(inCheck({ ...kings, turn: 'b', ply: 1 })).toBe(false);
  });

  it('Кутова тура turns 90° after a short leg', () => {
    const pos = build({ ...K, a1: 'w:rook-corner', a2: 'w:pawn-classic' });
    expect(targets(pos, 'a1')).toEqual(expect.arrayContaining(['b1', 'd1']));
    const open = build({ ...K, a1: 'w:rook-corner' });
    expect(targets(open, 'a1')).toContain('c3');
  });

  it('Таранна тура passes one enemy and captures the next, never the king', () => {
    const pos = build({ ...K, a1: 'w:rook-battering', a4: 'b:pawn-classic', a7: 'b:knight-classic' });
    const after = play(pos, 'a1', 'a7', 'Таран');
    expect(at(after, 'a7')).toBe('w:rook-battering');
    expect(at(after, 'a4')).toBe('b:pawn-classic');
    const king = build({ e1: 'w:king-classic', a1: 'w:rook-battering', a4: 'b:pawn-classic', a7: 'b:king-classic' });
    expect(targets(king, 'a1')).not.toContain('a7');
    expect(inCheck({ ...king, turn: 'b', ply: 1 })).toBe(false);
  });

  it('Витіснювач pushes an own piece one square further', () => {
    const pos = build({ ...K, a1: 'w:rook-displacer', a3: 'w:knight-classic' });
    const after = play(pos, 'a1', 'a3', 'Витіснити');
    expect(at(after, 'a3')).toBe('w:rook-displacer');
    expect(at(after, 'a4')).toBe('w:knight-classic');
  });

  it('Смертник takes its killer along, so a king cannot capture it', () => {
    const pos = build({ d4: 'b:rook-kamikaze', c2: 'w:knight-classic', a1: 'w:king-classic', h8: 'b:king-classic' });
    const after = play(pos, 'c2', 'd4');
    expect(at(after, 'd4')).toBeNull();
    const kingCase = build({ e1: 'w:king-classic', e2: 'b:rook-kamikaze', h8: 'b:king-classic' });
    expect(targets(kingCase, 'e1')).not.toContain('e2');
    expect(targets(kingCase, 'e1').length).toBeGreaterThan(0);
  });

  it('Замкова тура teleports next to its king once', () => {
    const pos = build({ ...K, h5: 'w:rook-castle' });
    const after = play(pos, 'h5', 'd2', 'Телепорт');
    expect(at(after, 'd2')).toBe('w:rook-castle');
    expect(after.onceUsed['w-h5']).toBe(true);
  });

  it('Фортечна тура survives one capture and skips a turn', () => {
    let pos = build({ e4: 'w:rook-fortress', d6: 'b:knight-classic', a1: 'w:king-classic', h8: 'b:king-classic' }, 'b');
    pos = play(pos, 'd6', 'e4');
    expect(at(pos, 'e4')).toBe('b:knight-classic');
    expect(at(pos, 'e3')).toBe('w:rook-fortress');
    expect(movesFrom(pos, 'e3')).toHaveLength(0);
  });

  it('a king cannot take a defended Фортечна тура even though it would step into the line', () => {
    // The white rook on e1 defends e6; taking it would let the fortress rook
    // step back to e5 and shield the king, but a defended piece is off limits.
    const pos = build({ e6: 'w:rook-fortress', e1: 'w:rook-classic', c1: 'w:king-classic', d7: 'b:king-classic' }, 'b');
    expect(targets(pos, 'd7')).not.toContain('e6');
    // Undefended, the king may take it (and the rook steps back).
    const free = build({ e6: 'w:rook-fortress', c1: 'w:king-classic', d7: 'b:king-classic' }, 'b');
    expect(targets(free, 'd7')).toContain('e6');
  });

  it('Землетрус shifts a line cyclically and does not spend the turn', () => {
    const pos = build({ ...K, a1: 'w:rook-earthquake', h3: 'b:knight-classic', c3: 'w:pawn-classic' });
    const options = abilityOptions(pos, 'w-a1');
    expect(options.some((o) => o.label.startsWith('Вертикаль e'))).toBe(false);
    const after = applyAbility(pos, 'w-a1', 'rank:2:1').pos;
    expect(at(after, 'a3')).toBe('b:knight-classic');
    expect(at(after, 'd3')).toBe('w:pawn-classic');
    expect(after.turn).toBe('w');
    expect(after.cooldowns['w-a1']).toBe(8);
  });
});

describe('queen and king cards', () => {
  it('Амазонка: queen up to 5 squares plus knight jumps that capture', () => {
    const pos = build({ a1: 'w:queen-amazon', b3: 'b:pawn-classic', h1: 'w:king-classic', h8: 'b:king-classic' });
    const t = targets(pos, 'a1');
    expect(t).toContain('f6');
    expect(t).not.toContain('g7');
    expect(t).toContain('c2');
    expect(t).toContain('b3');
    expect(findMove(pos, 'a1', 'b3').captures).toHaveLength(1);
  });

  it('Мандрівник moves 1–2 squares straight, never diagonally', () => {
    const pos = build({ e4: 'w:king-wanderer', a8: 'b:king-classic' });
    expect(targets(pos, 'e4')).toEqual(['c4', 'd4', 'e2', 'e3', 'e5', 'e6', 'f4', 'g4']);
  });

  it('Обмінник swaps with a piece on its first rank and loses castling', () => {
    const pos = build({ e1: 'w:king-swapper', a1: 'w:rook-classic', e8: 'b:king-classic' });
    const after = play(pos, 'e1', 'a1', 'Обмін');
    expect(at(after, 'a1')).toBe('w:king-swapper');
    expect(at(after, 'e1')).toBe('w:rook-classic');
    expect(after.castlingLost['w-e1']).toBe(true);
  });

  it('Барикада blocks a line checkmate with a new pawn once', () => {
    const pos = build(
      {
        g1: 'w:king-barricade',
        f2: 'w:pawn-classic',
        g2: 'w:pawn-classic',
        h2: 'w:pawn-classic',
        a8: 'b:rook-classic',
        h8: 'b:king-classic',
      },
      'b',
    );
    const after = play(pos, 'a8', 'a1');
    expect(at(after, 'f1')).toBe('w:pawn-classic');
    expect(after.onceUsed['w-g1']).toBe(true);
    expect(hasAnyLegalTurn(after)).toBe(true);
  });
});

describe('frozen pieces', () => {
  it('a frozen piece does not give check', () => {
    const pos = build({ e1: 'w:king-classic', e8: 'b:rook-classic', a8: 'b:king-classic' });
    expect(inCheck(pos)).toBe(true);
    pos.frozenUntil['b-e8'] = 1;
    expect(inCheck(pos)).toBe(false);
  });
});
