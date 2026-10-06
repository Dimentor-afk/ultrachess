// How long a full search takes on the same positions: `npx tsx scripts/bot/bench.ts [baseline|new] [depth]`.
import { randomPosition } from './common';

const which = process.argv[2] ?? 'new';
const depth = Number(process.argv[3] ?? 3);
const cap = Number(process.argv[4] ?? 12);
const mod = which === 'baseline' ? await import('./baseline/search') : await import('../../src/engine/bot/search');

let total = 0;
for (let i = 0; i < cap; i++) {
  const s = randomPosition(1000 + i, 16 + (i % 4) * 6);
  if (s.result) continue;
  const t = Date.now();
  const timeMs = Number(process.env.TIME ?? 60_000);
  const r = mod.chooseTurn(s, s.turn, { depth, timeMs, noise: 0 });
  const ms = Date.now() - t;
  total += ms;
  const info = (mod as { lastStats?: () => unknown }).lastStats?.();
  console.log(`pos ${i}: ${ms} ms, score ${r.score}`, info ? JSON.stringify(info) : '');
}
console.log(`${which} depth ${depth}: total ${total} ms`);
