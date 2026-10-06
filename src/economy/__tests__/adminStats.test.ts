import { describe, expect, it } from 'vitest';
import { findMove } from '../../engine/__tests__/helpers';
import { classicDeck } from '../../engine/deck';
import { type Action, type MatchState, createMatch, performAction } from '../../engine/match';
import { MemoryStore } from '../memoryStore';
import { GameService } from '../service';
import type { Hasher } from '../store';

const hasher: Hasher = { hash: async (p) => `h:${p}`, verify: async (p, h) => h === `h:${p}` };

function line(start: MatchState, moves: [string, string][]): Action[] {
  const out: Action[] = [];
  let st = start;
  for (const [from, to] of moves) {
    const a: Action = { type: 'move', move: findMove(st, from, to) };
    out.push(a);
    st = performAction(st, a);
  }
  return out;
}

describe('admin statistics', () => {
  it('counts games, card results and who did the capturing', async () => {
    const store = new MemoryStore();
    const now = Date.UTC(2026, 9, 6, 12);
    const svc = new GameService(store, hasher, () => now, Math.random, undefined, ['boss@a.com']);
    await svc.init();
    const boss = await svc.register('boss@a.com', 'secret12', 'Бос');
    const a = await svc.register('a@a.com', 'secret12', 'Анна');
    const b = await svc.register('b@b.com', 'secret12', 'Богдан');
    const w = { ...classicDeck('w', 'Колода'), queen: 'queen-immortal' };
    const bl = classicDeck('b', 'Колода');
    const actions = line(createMatch(w, bl), [['e2', 'e4'], ['e7', 'e5'], ['f1', 'c4'], ['b8', 'c6'], ['d1', 'h5'], ['g8', 'f6'], ['h5', 'f7']]);
    await store.insertPvp({
      id: 'g1', whiteId: a.profile.id, blackId: b.profile.id, whiteDeck: w, blackDeck: bl, actions: JSON.stringify(actions),
      status: 'finished', result: JSON.stringify({ winner: 'w', reason: 'Мат', moves: 4 }), resignedBy: null, ranked: true, createdAt: now, updatedAt: now,
    });
    const st = await svc.adminStats(boss.token, 7);
    expect(st.games.total).toBe(1);
    expect(st.games.byKind.ranked).toBe(1);
    expect(st.games.reasons['Мат']).toBe(1);
    expect(st.games.pvpWhiteScore).toBe(1);
    const queen = st.cards.find((c) => c.id === 'queen-immortal')!;
    expect(queen).toMatchObject({ games: 1, score: 1, pvpGames: 1, moves: 2, captures: 1 });
    const classicPawn = st.cards.find((c) => c.id === 'pawn-classic')!;
    expect(classicPawn.games).toBe(2);
    expect(classicPawn.score).toBe(1);
    await expect(svc.adminStats(a.token, 7)).rejects.toThrow(/адміністратора/);
  });
});
