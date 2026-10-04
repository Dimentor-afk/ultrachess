import { describe, expect, it } from 'vitest';
import { reviewGame, splitTurns, winChance } from '../bot/analysis';
import { parseSquare } from '../coords';
import { classicDeck } from '../deck';
import { legalMoves } from '../legal';
import { type Action, type MatchState, createMatch, performAction } from '../match';

const decks = { w: classicDeck('w', 'w'), b: classicDeck('b', 'b') };

/** Actions for moves written as "e2e4". */
function play(...uci: string[]): Action[] {
  let state: MatchState = createMatch(decks.w, decks.b);
  const out: Action[] = [];
  for (const u of uci) {
    const move = legalMoves(state).find((m) => m.from === parseSquare(u.slice(0, 2)) && m.target === parseSquare(u.slice(2, 4)));
    if (!move) throw new Error(`no move ${u}`);
    out.push({ type: 'move', move });
    state = performAction(state, out.at(-1)!);
  }
  return out;
}

describe('game review', () => {
  it('the winning chance curve is even at 0 and saturates', () => {
    expect(winChance(0)).toBe(50);
    expect(winChance(10_000)).toBeGreaterThan(99.9);
    expect(winChance(-10_000)).toBeLessThan(0.1);
  });

  it("scholar's mate: the move allowing mate is a blunder, the mate is best", () => {
    const actions = play('e2e4', 'e7e5', 'd1h5', 'b8c6', 'f1c4', 'g8f6', 'h5f7');
    expect(splitTurns(decks, actions)).toHaveLength(7);
    const review = reviewGame(decks, actions, { depth: 2, timeMs: 2000 });
    const cls = review.turns.map((t) => t.cls);
    expect(cls[5]).toBe('blunder');
    expect(review.turns[5].best).not.toBeNull();
    expect(['best', 'great', 'brilliant']).toContain(cls[6]);
    expect(review.turns[6].after).toBeGreaterThan(5000);
    expect(review.accuracy.w).toBeGreaterThan(review.accuracy.b);
  });

  it('giving a queen away for nothing is a blunder', () => {
    const actions = play('e2e4', 'd7d5', 'd1h5', 'g8f6', 'h5f7');
    const review = reviewGame(decks, actions, { depth: 2, timeMs: 2000 });
    expect(review.turns[4].cls).toBe('blunder');
  });
});
