// Renders an ad from scripts/promo/ads.ts into a smooth 1080×1920 MP4, frame by frame:
// the page runs on a fake clock and every animation is set to the frame's exact time
// before the screenshot, so no frame is ever dropped or late.
//
//   npm i --no-save playwright ffmpeg-static && npx playwright install chromium
//   npx vite                                  # dev server, another terminal
//   node scripts/promo/render.mjs chaos       # → scripts/promo/out/chaos.mp4
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import ffmpeg from 'ffmpeg-static';
import { chromium } from 'playwright';

const [name, fpsArg] = process.argv.slice(2);
const FPS = Number(fpsArg ?? 30);
const site = process.env.PROMO_URL ?? 'http://localhost:5173';
const out = new URL('./out/', import.meta.url).pathname;
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const ctx = await browser.newContext({ viewport: { width: 1080, height: 1920 } });
if (process.env.FONTS_CSS) await ctx.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ contentType: 'text/css', body: fs.readFileSync(process.env.FONTS_CSS) }));
const page = await ctx.newPage();
page.on('pageerror', (e) => console.error('page error:', e.message));
await page.clock.install({ time: new Date('2026-10-04T12:00:00Z') });
// Paused: time moves only when we move it (otherwise it also runs on while screenshots are taken).
await page.clock.pauseAt(new Date('2026-10-04T12:00:01Z'));
// Every animation runs on our time, not the browser's.
await page.addInitScript(() => {
  const w = window;
  w.__T = 0;
  w.__born = new WeakMap();
  w.__step = (dt) => {
    w.__T += dt;
    for (const a of document.getAnimations()) {
      let b = w.__born.get(a);
      if (b === undefined) w.__born.set(a, (b = w.__T - dt));
      // Frozen by speed 0, not pause(): a paused CSS animation would outlive its class.
      if (a.playbackRate !== 0) a.playbackRate = 0;
      a.currentTime = Math.max(0, w.__T - b);
    }
  };
  // React renders through MessageChannel, which the fake clock does not hold: let it flush.
  w.__flush = () => new Promise((r) => { const c = new MessageChannel(); c.port1.onmessage = () => r(); c.port2.postMessage(0); });
});
await page.goto(`${site}/scripts/promo/ad.html?ad=${name}&zoom=2.5`);
await page.waitForSelector('body[data-ready="1"]', { timeout: 60_000 });
const total = await page.evaluate(() => window.__length);

// Warm-up: play it through once without recording, so every image is loaded and decoded.
await page.evaluate(() => window.__start());
for (let t = 0; t < total + 500; t += 100) {
  await page.clock.runFor(100);
  await page.evaluate(async () => { await window.__flush(); window.__step(100); });
}
await page.waitForTimeout(1500);

// Record.
const frames = Math.ceil((total / 1000) * FPS);
const enc = spawn(ffmpeg, ['-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-', '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', `${out}${name}.mp4`]);
await page.evaluate(() => { window.__T = 0; window.__born = new WeakMap(); window.__start(); });
let clock = 0;
for (let f = 0; f < frames; f++) {
  const target = ((f + 1) * 1000) / FPS;
  const dt = Math.round(target - clock);
  clock += dt;
  await page.clock.runFor(dt);
  await page.evaluate(async (dt) => { await window.__flush(); await window.__flush(); window.__step(dt); }, dt);
  enc.stdin.write(await page.screenshot({ type: 'jpeg', quality: 94 }));
  if (f % 150 === 0) console.log(`${name}: ${f}/${frames}`);
}
enc.stdin.end();
await new Promise((r) => enc.on('close', r));
await browser.close();
console.log(`${out}${name}.mp4 (${(total / 1000).toFixed(1)} s)`);
