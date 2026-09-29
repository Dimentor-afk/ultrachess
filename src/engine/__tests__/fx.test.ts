import { describe, expect, it } from 'vitest';
import { abilityOptions } from '../abilities';
import { classicDeck } from '../deck';
import { type MatchState, createMatch, performAction } from '../match';
import { legalMoves } from '../legal';
import { parseSquare } from '../coords';
import { playerView } from '../view';

const mv = (m: MatchState, uci: string) => {
  const move = legalMoves(m).find((x) => x.from === parseSquare(uci.slice(0, 2)) && x.target === parseSquare(uci.slice(2)))!;
  return performAction(m, { type: 'move', move });
};

describe('match fx', () => {
  it('reports the mover and captures', () => {
    let m = createMatch(classicDeck(), classicDeck());
    m = mv(m, 'e2e4');
    expect(m.fx!.moves).toEqual([{ from: parseSquare('e2'), to: parseSquare('e4'), style: 'slide' }]);
    m = mv(mv(m, 'd7d5'), 'e4d5');
    expect(m.fx!.sprites).toContainEqual({ kind: 'capture', square: parseSquare('d5'), by: 'w' });
  });

  it('castling slides the rook too', () => {
    let m = createMatch(classicDeck(), classicDeck());
    for (const u of ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'g8f6']) m = mv(m, u);
    m = mv(m, 'e1g1');
    expect(m.fx!.moves).toHaveLength(2);
  });

  it('Землетрус shakes the board and hops every piece on the line; hidden abilities stay private', () => {
    const deck = { ...classicDeck(), rook1: 'rook-earthquake', queen: 'queen-immortal' };
    let m = createMatch(deck, classicDeck());
    const rook = m.board.find((p) => p?.cardId === 'rook-earthquake')!;
    const opt = abilityOptions(m, rook.id).find((o) => o.squares.some((s) => m.board[s]))!;
    m = performAction(m, { type: 'ability', pieceId: rook.id, key: opt.key });
    expect(m.fx!.shake).toBe(true);
    expect(m.fx!.moves.length).toBeGreaterThan(0);
    expect(m.fx!.moves.every((x) => x.style === 'hop' || x.style === 'warp')).toBe(true);

    const queen = m.board.find((p) => p?.cardId === 'queen-immortal')!;
    let n = createMatch(deck, classicDeck());
    n = performAction(n, { type: 'ability', pieceId: queen.id, key: 'arm' });
    expect(playerView(n, 'w').fx!.sprites).toHaveLength(1);
    expect(playerView(n, 'b').fx!.sprites).toHaveLength(0);
  });
});
