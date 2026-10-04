import { describe, expect, it } from 'vitest';
import { build, findMove } from '../../engine/__tests__/helpers';
import { classicDeck } from '../../engine/deck';
import { legalMoves } from '../../engine/legal';
import { type Action, type MatchState, createMatch, performAction } from '../../engine/match';
import { ACHIEVEMENTS, featsFrom, gameFeats } from '../achievements';
import { CARD_BY_ID } from '../../engine/cards';
import { MemoryStore } from '../memoryStore';
import { GameService } from '../service';
import type { Hasher } from '../store';

const hasher: Hasher = { hash: async (p) => `h:${p}`, verify: async (p, h) => h === `h:${p}` };

/** Actions of a game given as from–to pairs, each checked by the engine. */
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

const SCHOLAR: [string, string][] = [
  ['e2', 'e4'], ['e7', 'e5'], ['f1', 'c4'], ['b8', 'c6'], ['d1', 'h5'], ['g8', 'f6'], ['h5', 'f7'],
];

describe('achievements', () => {
  it('a fast mate without losses: the mate-in-N feats and the flawless one, for the winner only', () => {
    const decks = { w: classicDeck(), b: classicDeck() };
    const actions = line(createMatch(decks.w, decks.b), SCHOLAR);
    expect(gameFeats(decks, actions, 'w', true).sort()).toEqual(['flawless', 'mate-10', 'mate-15', 'mate-20', 'mate-5']);
    expect(gameFeats(decks, actions, 'b', false)).toEqual([]);
  });

  it('castling is read from the record, for the side that castled', () => {
    const decks = { w: classicDeck(), b: classicDeck() };
    const castle = line(createMatch(decks.w, decks.b), [['e2', 'e4'], ['e7', 'e5'], ['g1', 'f3'], ['b8', 'c6'], ['f1', 'c4'], ['f8', 'c5'], ['e1', 'g1']]);
    expect(gameFeats(decks, castle, 'w', false)).toContain('castle');
    expect(gameFeats(decks, castle, 'b', false)).not.toContain('castle');
  });

  it('Лють Берсерка: two pieces on two of the knight\'s own moves in a row', () => {
    const pos = build({
      a1: 'w:king-classic', h8: 'b:king-classic', a8: 'b:pawn-classic',
      d4: 'w:knight-berserk', e6: 'b:pawn-classic', g7: 'b:knight-classic', e8: 'b:rook-classic', c7: 'b:bishop-classic',
    });
    const start: MatchState = { ...pos, decks: { w: classicDeck(), b: classicDeck() }, history: [], repetition: {}, status: 'playing', result: null, lastMove: null, fx: null };
    const first: Action = { type: 'move', move: findMove(start, 'd4', 'e6', 'Берсерк') };
    let st = performAction(start, first);
    // Black waits, then white waits while the knight sits out its turn.
    const acts: Action[] = [first];
    const step = (from: string, to: string) => {
      const a: Action = { type: 'move', move: findMove(st, from, to) };
      acts.push(a);
      st = performAction(st, a);
    };
    step('a8', 'a7');
    step('a1', 'b1');
    step('a7', 'a6');
    const knight = st.board.findIndex((p) => p?.cardId === 'knight-berserk');
    const second = findMoveFrom(st, knight);
    expect(second).toBeTruthy();
    acts.push({ type: 'move', move: second! });
    expect(featsFrom(start, acts, 'w', false)).toContain('berserk-rage');
    expect(featsFrom(start, acts.slice(0, 1), 'w', false)).toEqual(['double-strike']);
  });

  it('counters unlock achievements once; a plate only from a reached one; every medal has its art', async () => {
    const svc = new GameService(new MemoryStore(), hasher, () => 1_800_000_000_000, Math.random);
    await svc.init();
    const { token } = await svc.register('a@a.com', 'secret12', 'Анна');
    const [starter] = await svc.packs(token);
    await svc.openPack(token, starter.id);
    await expect(svc.setTitle(token, 'wins-1')).rejects.toThrow(/здобудьте/);
    const svcAny = svc as unknown as { achieve: (id: string, add: object, feats?: string[]) => Promise<string[]> };
    const me = await svc.me(token);
    expect(me.achievements).not.toContain('wins-1');
    expect(await svcAny.achieve(me.id, { wins: 1, games: 1 })).toEqual(['wins-1']);
    // Already reached: not reported again.
    expect(await svcAny.achieve(me.id, { games: 1 })).toEqual([]);
    expect((await svc.me(token)).achievements).toContain('wins-1');
    expect((await svc.setTitle(token, 'wins-1')).title).toBe('wins-1');
    expect((await svc.setTitle(token, null)).title).toBeNull();
    for (const a of ACHIEVEMENTS) expect(a.art ? a.art.startsWith('pack:') || CARD_BY_ID[a.art] : a.icon, a.id).toBeTruthy();
  });
});

/** A move of the piece on `from` that takes two pieces. */
function findMoveFrom(st: MatchState, from: number) {
  return legalMoves(st).find((m) => m.from === from && m.captures.length >= 2);
}
