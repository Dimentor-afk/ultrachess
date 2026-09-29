import { describe, expect, it } from 'vitest';
import { classicDeck, deckPositions, placeCard, validateDeck } from '../deck';

describe('deck builder: pawns', () => {
  it('a second pawn version makes a formation', () => {
    const d = placeCard(classicDeck(), 8 + 4, 'pawn-stormer').deck!;
    expect(d.pawnVersions).toEqual(['pawn-classic', 'pawn-stormer']);
    expect(deckPositions(d)[4]).toBe('pawn-stormer');
    expect(validateDeck(d)).toEqual([]);
  });

  it('a third version replaces the version it lands on, everywhere', () => {
    let d = placeCard(classicDeck(), 8 + 0, 'pawn-stormer', true).deck!; // all stormers
    d = placeCard(d, 8 + 3, 'pawn-retreater').deck!; // d-pawn retreater
    const res = placeCard(d, 8 + 5, 'pawn-oblique'); // on a stormer
    expect(res.deck).toBeDefined();
    const pawns = deckPositions(res.deck!).slice(0, 8);
    expect(pawns[3]).toBe('pawn-retreater');
    expect(pawns.filter((p) => p === 'pawn-oblique')).toHaveLength(7);
    expect(validateDeck(res.deck!)).toEqual([]);
  });

  it('dropping the only other version back gives one version again', () => {
    let d = placeCard(classicDeck(), 8 + 2, 'pawn-stormer').deck!;
    d = placeCard(d, 8 + 2, 'pawn-classic').deck!;
    expect(d.pawnVersions).toEqual(['pawn-classic']);
    expect(validateDeck(d)).toEqual([]);
  });
});
