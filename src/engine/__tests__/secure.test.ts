import { describe, expect, it } from 'vitest';
import { classicDeck } from '../deck';
import { parseSquare, squareName } from '../coords';
import { legalMoves } from '../legal';
import { type Action, type MatchState, createMatch, performAction } from '../match';
import { noIllusionIds, secureState } from '../secure';
import type { Color, Deck } from '../types';

const opaque = (id: string) => `x-${[...id].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7).toString(36)}`;

function deck(patch: Partial<Deck>): Deck {
  return { ...classicDeck(), ...patch };
}

function move(m: MatchState, from: string, to: string, label?: RegExp): MatchState {
  const mv = legalMoves(m).find((x) => squareName(x.from) === from && squareName(x.target) === to && (!label || label.test(x.label)));
  if (!mv) throw new Error(`no move ${from}-${to}`);
  return performAction(m, { type: 'move', move: mv });
}

const idOf = (m: MatchState, cardId: string, color: Color) => m.board.find((p) => p?.cardId === cardId && p.color === color)!.id;

describe('secure views', () => {
  it("an illusion is an ordinary piece for the opponent and the spectator, and the owner's own", () => {
    let m = createMatch(deck({ bishop1: 'bishop-illusionist' }), classicDeck());
    m = move(m, 'd2', 'd3');
    m = move(m, 'a7', 'a6');
    m = move(m, 'c1', 'f4');
    expect(m.hiddenState.w.illusions.map((i) => squareName(i.square))).toEqual(['c1']);
    for (const viewer of ['b', null] as const) {
      const v = secureState(m, viewer, opaque);
      expect(v.board[parseSquare('c1')]).toMatchObject({ color: 'w', cardId: 'bishop-illusionist' });
      expect(v.hiddenState.w.illusions).toEqual([]);
      expect(noIllusionIds(v)).toBe(true);
      expect(JSON.stringify(v)).not.toContain('ill-');
      // The real bishop and the copy cannot be told apart by id pattern.
      expect(v.board[parseSquare('f4')]!.id).toMatch(/^x-/);
      expect(v.board[parseSquare('c1')]!.id).toMatch(/^x-/);
    }
    const own = secureState(m, 'w', opaque);
    expect(own.hiddenState.w.illusions).toHaveLength(1);
    expect(own.board[parseSquare('c1')]).toBeNull();
  });

  it('a hidden action (Безсмертна) leaves the opponent’s and the spectator’s view unchanged', () => {
    let m = createMatch(deck({ queen: 'queen-immortal' }), classicDeck());
    m = move(m, 'e2', 'e4');
    m = move(m, 'e7', 'e5');
    const before = m;
    const arm: Action = { type: 'ability', pieceId: idOf(m, 'queen-immortal', 'w'), key: 'arm' };
    const after = performAction(m, arm);
    expect(after.hiddenState.w.immortalPly).not.toBeNull();
    for (const viewer of ['b', null] as const) {
      expect(secureState(after, viewer, opaque)).toEqual(secureState(before, viewer, opaque));
    }
    // The owner sees the shield, the cooldown and the history line.
    const own = secureState(after, 'w', opaque);
    expect(own.hiddenState.w.immortalPly).not.toBeNull();
    expect(own.cooldowns[arm.pieceId]).toBeGreaterThan(0);
    expect(own.history.at(-1)!.text).toMatch(/Безсмертна/);
    expect(JSON.stringify(secureState(after, 'b', opaque))).not.toMatch(/Безсмертна:|immortalPly":\d/);
  });

  it('Міраж: the opponent sees knights everywhere and no cooldown', () => {
    let m = createMatch(deck({ knight1: 'knight-mirage' }), classicDeck());
    const mirage = legalMoves(m).find((x) => x.kind === 'mirage')!;
    m = performAction(m, { type: 'move', move: mirage });
    const v = secureState(m, 'b', opaque);
    const knights = v.board.filter((p) => p?.cardId === 'knight-mirage');
    expect(knights.length).toBe(1 + m.hiddenState.w.illusions.length);
    expect(knights.length).toBeGreaterThanOrEqual(2);
    expect(Object.keys(v.cooldowns).some((id) => knights.some((k) => k!.id === id))).toBe(false);
    expect(v.fx!.sprites.some((s) => s.kind === 'mirage')).toBe(false);
    expect(secureState(m, 'w', opaque).fx!.sprites.some((s) => s.kind === 'mirage')).toBe(true);
  });

  it('Міраж: the opponent and a spectator cannot tell where the real knight went', () => {
    let m = createMatch(deck({ knight1: 'knight-mirage' }), classicDeck());
    const mirage = legalMoves(m).find((x) => x.kind === 'mirage' && (x.mirage?.length ?? 0) > 0)!;
    m = performAction(m, { type: 'move', move: mirage });
    const real = mirage.to!;
    const spread = [real, ...m.hiddenState.w.illusions.map((i) => i.square)].sort((a, b) => a - b);
    for (const viewer of ['b', null] as const) {
      const v = secureState(m, viewer, opaque);
      const text = JSON.stringify([v.history, v.lastMove, v.fx]);
      // Every landing square is shown the same way; the real one is not singled out.
      expect(v.lastMove).toMatchObject({ from: mirage.from, to: null, target: mirage.from, spread });
      expect(v.history.at(-1)!.text).toBe(`Кінь ${squareName(mirage.from)} — Міраж`);
      expect(v.fx!.moves.map((x) => x.to)).toEqual(spread);
      expect(v.fx!.moves.every((x) => x.from === mirage.from && x.legs.length === 1 && x.legs[0].style === 'hop')).toBe(true);
      expect(text).not.toContain(squareName(real) + '"');
      for (const s of spread) expect(v.board[s]).toMatchObject({ color: 'w', cardId: 'knight-mirage' });
    }
    // The owner still sees their real move.
    const own = secureState(m, 'w', opaque);
    expect(own.history.at(-1)!.text).toBe(`Кінь ${squareName(mirage.from)}–${squareName(real)} (Міраж)`);
    expect(own.fx!.moves[0]).toMatchObject({ from: mirage.from, to: real });
    // After black answers, nothing about the Міраж is left to read either.
    const b = performAction(m, { type: 'move', move: legalMoves(m).find((x) => squareName(x.from) === 'a7')! });
    expect(secureState(b, 'b', opaque).history.at(-2)!.text).toBe(`Кінь ${squareName(mirage.from)} — Міраж`);
  });

  it('the view is still a playable state for its owner', () => {
    let m = createMatch(deck({ bishop1: 'bishop-illusionist' }), classicDeck());
    m = move(m, 'd2', 'd3');
    m = move(m, 'a7', 'a6');
    m = move(m, 'c1', 'f4');
    const own = secureState(m, 'b', opaque);
    // Black's moves in its own view are the same as in the real game here.
    const names = (s: MatchState) => legalMoves(s).map((x) => `${squareName(x.from)}${squareName(x.target)}`).sort();
    expect(names(own)).toEqual(names(m));
    expect(() => move(own, 'b8', 'c6')).not.toThrow();
  });
});
