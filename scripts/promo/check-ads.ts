// npx vite-node scripts/promo/check-ads.ts — every battle shot plays on the engine.
import { ADS } from './ads';
import { playScene } from './scene';

let bad = 0;
for (const [name, shots] of Object.entries(ADS)) {
  shots.forEach((s, i) => {
    if (s.kind === 'versus') {
      for (const side of [s.top, s.bottom]) {
        try {
          const last = playScene(side).at(-1)!;
          console.log(`${name}#${i} ok [${last.status}]: ${last.history.slice(-side.steps.length).map((h) => h.text).join(' / ')}`);
        } catch (e) {
          bad++;
          console.log(`${name}#${i} FAIL: ${(e as Error).message}`);
        }
      }
      return;
    }
    if (s.kind !== 'board' && s.kind !== 'meme') return;
    const spec = s.kind === 'meme' ? s.board : s;
    try {
      const states = playScene(spec);
      const last = states.at(-1)!;
      // Timed steps: one time per state the steps make.
      const lands = s.kind === 'meme' ? s.board.lands : s.lands;
      if (lands && lands.length !== states.length - 1) throw new Error(`${lands.length} lands for ${states.length - 1} states`);
      console.log(`${name}#${i} ok [${last.status}]: ${last.history.slice(-spec.steps.length).map((h) => h.text).join(' / ')}`);
    } catch (e) {
      bad++;
      console.log(`${name}#${i} FAIL: ${(e as Error).message}`);
    }
  });
}
if (bad) process.exit(1);
