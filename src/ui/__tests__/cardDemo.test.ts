import { describe, expect, it } from 'vitest';
import { CARDS } from '../../engine/cards';
import { buildDemo } from '../cardDemo';

describe('card clips', () => {
  it('every card has a clip with a real move of its piece', () => {
    for (const c of CARDS) {
      const d = buildDemo(c.id);
      expect(d, c.id).not.toBeNull();
      expect(d!.moves.length, c.id).toBeGreaterThan(0);
      expect(d!.moves).toContain(d!.move);
    }
  });

  it('report: which showcase each card plays', () => {
    const rows = CARDS.map((c) => {
      const d = buildDemo(c.id)!;
      return `${c.id.padEnd(22)} ${d.move.kind.padEnd(10)} ${d.move.label}`;
    });
    console.log(rows.join('\n'));
  });
});
