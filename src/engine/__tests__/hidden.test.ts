import { describe, expect, it } from 'vitest';
import { applyAbility } from '../abilities';
import { classicDeck, validateDeck } from '../deck';
import { legalMoves } from '../legal';
import { type MatchState, performAction } from '../match';
import { playerView } from '../view';
import type { Position } from '../types';
import { S, at, build, findMove, kingShuffle, play } from './helpers';

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

describe('illusions (§4.6)', () => {
  const setup = () =>
    build({ c1: 'w:bishop-illusionist', h1: 'w:king-classic', h8: 'b:king-classic', c8: 'b:rook-classic' });

  it('leave a copy that only its owner can tell apart', () => {
    const after = play(setup(), 'c1', 'e3');
    expect(after.hiddenState.w.illusions.map((i) => i.square)).toEqual([S('c1')]);
    const own = playerView(asMatch(after), 'w').cells[S('c1')]!;
    const theirs = playerView(asMatch(after), 'b').cells[S('c1')]!;
    expect(own.illusion).toBe(true);
    expect(theirs).toMatchObject({ illusion: false, id: '', type: 'bishop', cardId: 'bishop-illusionist' });
    expect(JSON.stringify(playerView(asMatch(after), 'b'))).not.toContain('ill-');
  });

  it('vanish when attacked; the attacker takes the square', () => {
    const after = play(setup(), 'c1', 'e3');
    const attempt = findMove(after, 'c8', 'c1');
    expect(attempt.captures).toEqual([S('c1')]);
    const next = play(after, 'c8', 'c1');
    expect(at(next, 'c8')).toBeNull();
    expect(at(next, 'c1')).toBe('b:rook-classic');
    expect(next.hiddenState.w.illusions).toHaveLength(0);
    expect(next.turn).toBe('w');
  });

  it('disappear after 3 opponent turns or when the real piece moves', () => {
    let pos = play(setup(), 'c1', 'e3');
    pos = kingShuffle(kingShuffle(kingShuffle(kingShuffle(pos))));
    expect(pos.hiddenState.w.illusions).toHaveLength(1);
    pos = kingShuffle(pos);
    expect(pos.hiddenState.w.illusions).toHaveLength(0);

    let moved = play(setup(), 'c1', 'e3');
    moved = kingShuffle(moved);
    moved = play(moved, 'e3', 'd4');
    expect(moved.hiddenState.w.illusions.map((i) => i.square)).toEqual([S('e3')]);
  });

  it('Міраж leaves illusions on the other free jump squares', () => {
    const pos = build({ d4: 'w:knight-mirage', a1: 'w:king-classic', h8: 'b:king-classic' });
    const mirage = legalMoves(pos).find((m) => m.kind === 'mirage' && m.to === S('e6'))!;
    const after = play(pos, 'd4', 'e6', 'Міраж');
    expect(after.hiddenState.w.illusions).toHaveLength(mirage.mirage!.length);
    expect(after.cooldowns['w-d4']).toBe(5);
    const blackView = playerView(asMatch(after), 'b');
    const knights = blackView.cells.filter((c) => c?.type === 'knight');
    expect(knights).toHaveLength(8);
    expect(knights.every((c) => !c!.illusion)).toBe(true);
    expect(blackView.cells.find((c) => c?.cardId === 'knight-mirage')?.cooldown).toBeNull();
  });
});

describe('Безсмертна', () => {
  it('survives one capture after the hidden button and returns home', () => {
    const pos = build({ d4: 'w:queen-immortal', h1: 'w:king-classic', h8: 'b:king-classic', d8: 'b:rook-classic' });
    pos.board[S('d4')] = { ...pos.board[S('d4')]!, homeSquare: S('d1') };
    let m = asMatch(pos);
    m = performAction(m, { type: 'ability', pieceId: 'w-d4', key: 'arm' });
    expect(m.turn).toBe('w');
    expect(playerView(m, 'b').history).toHaveLength(0);
    expect(playerView(m, 'w').immortalArmed).toBe(true);
    m = performAction(m, { type: 'move', move: findMove(m, 'h1', 'g1') });
    m = performAction(m, { type: 'move', move: findMove(m, 'd8', 'd4') });
    expect(at(m, 'd1')).toBe('w:queen-immortal');
    expect(at(m, 'd4')).toBe('b:rook-classic');
  });

  it('is a normal capture when the button was not pressed', () => {
    const pos = build({ d4: 'w:queen-immortal', h1: 'w:king-classic', h8: 'b:king-classic', d8: 'b:rook-classic' }, 'b');
    const after = play(pos, 'd8', 'd4');
    expect(after.board.some((p) => p?.cardId === 'queen-immortal')).toBe(false);
    expect(() => applyAbility(after, 'w-d4', 'arm')).toThrow();
  });
});

describe('deck validation (§2.2)', () => {
  it('accepts the classic deck', () => {
    expect(validateDeck(classicDeck())).toEqual([]);
  });

  it('allows at most one mythological card over all 16 positions', () => {
    expect(validateDeck({ ...classicDeck(), rook1: 'rook-earthquake', queen: 'queen-immortal' })).toHaveLength(1);
    expect(validateDeck({ ...classicDeck(), bishop1: 'bishop-eclipse', bishop2: 'bishop-eclipse' })).toHaveLength(1);
    expect(validateDeck({ ...classicDeck(), bishop1: 'bishop-eclipse' })).toEqual([]);
  });

  it('checks pawn versions and formation', () => {
    const two = { ...classicDeck(), pawnVersions: ['pawn-classic', 'pawn-stormer'] };
    expect(validateDeck({ ...two, pawnFormation: '12121212' })).toEqual([]);
    expect(validateDeck({ ...two, pawnFormation: '11111111' })).toHaveLength(1);
    expect(validateDeck({ ...two, pawnFormation: '1212' })).toHaveLength(1);
    expect(validateDeck({ ...classicDeck(), pawnVersions: [] })).toHaveLength(1);
    expect(validateDeck({ ...classicDeck(), pawnVersions: ['pawn-classic', 'pawn-stormer', 'pawn-ram'] })).toHaveLength(1);
    expect(validateDeck({ ...classicDeck(), rook1: 'bishop-classic' })).toHaveLength(1);
  });
});
