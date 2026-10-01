import { describe, expect, it } from 'vitest';
import { CARDS } from '../../engine/cards';
import { CARD_SPECS } from '../cardSpec';

describe('card specs', () => {
  it('every card has a structured description, and no stray ones', () => {
    for (const card of CARDS) expect(CARD_SPECS[card.id]?.length, card.id).toBeGreaterThan(0);
    expect(Object.keys(CARD_SPECS).sort()).toEqual(CARDS.map((c) => c.id).sort());
  });
});
