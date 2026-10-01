import { describe, expect, it } from 'vitest';
import { CARDS } from '../../engine/cards';
import { runScript } from '../cardDemo';
import { CARD_SCRIPTS } from '../cardScripts';

describe('card clips', () => {
  it('every card has a script, and the engine can play every step of it', () => {
    const errors: string[] = [];
    for (const c of CARDS) {
      const script = CARD_SCRIPTS[c.id];
      if (!script) {
        errors.push(`${c.id}: no script`);
        continue;
      }
      try {
        const clip = runScript(c.id, script);
        expect(clip.scenes.length).toBeGreaterThan(1);
      } catch (e) {
        errors.push(`${c.id}: ${(e as Error).message}`);
      }
    }
    expect(errors).toEqual([]);
  });

  it('the trick really happens', () => {
    const log = (id: string) => runScript(id, CARD_SCRIPTS[id]).log.join(' | ');
    expect(log('rook-kamikaze')).toContain('kamikaze');
    expect(log('bishop-martyr')).toContain('martyr');
    expect(log('pawn-ambusher')).toContain('ambush');
    expect(log('pawn-shieldbearer')).toContain('shield');
    expect(log('rook-fortress')).toContain('fortress');
    expect(log('queen-immortal')).toContain('immortal');
    expect(log('king-barricade')).toContain('barricade');
    expect(log('knight-rider')).toContain('riderShield');
    for (const id of ['bishop-illusionist', 'rook-illusionist', 'knight-illusionist']) expect(log(id)).toContain('illusionDispelled');
  });

  it('report', () => {
    console.log(CARDS.map((c) => `${c.id.padEnd(20)} ${(() => { try { return runScript(c.id, CARD_SCRIPTS[c.id]).log.join(' | '); } catch (e) { return 'ERR ' + (e as Error).message; } })()}`).join('\n'));
  });
});
