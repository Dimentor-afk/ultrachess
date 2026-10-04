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
    if (s.kind !== 'board') return;
    try {
      const states = playScene(s);
      const last = states.at(-1)!;
      console.log(`${name}#${i} ok [${last.status}]: ${last.history.slice(-s.steps.length).map((h) => h.text).join(' / ')}`);
    } catch (e) {
      bad++;
      console.log(`${name}#${i} FAIL: ${(e as Error).message}`);
    }
  });
}
if (bad) process.exit(1);
