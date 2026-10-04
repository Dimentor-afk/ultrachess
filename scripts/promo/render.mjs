// Renders an ad from scripts/promo/ads.ts into a smooth 1080×1920 MP4, frame by frame:
// the page runs on a fake clock and every animation is set to the frame's exact time
// before the screenshot, so no frame is ever dropped or late.
//
//   npm i --no-save playwright ffmpeg-static && npx playwright install chromium
//   npx vite                                  # dev server, another terminal
//   node scripts/promo/render.mjs promo       # → scripts/promo/out/promo.mp4 and promo.marks.json
//   (the marks say when each effect, cut and pack stage happened: sound.py puts the sound on them)
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
  // Every animation ever seen, stepped until its element leaves the page. The browser's own list
  // drops a frozen animation that still waits out its delay, and it would then never start.
  w.__anims = new Set();
  w.__step = (dt) => {
    w.__T += dt;
    for (const a of document.getAnimations()) w.__anims.add(a);
    for (const a of w.__anims) {
      const el = a.effect && a.effect.target;
      if (a.playState === 'idle' || (el && !el.isConnected)) {
        w.__anims.delete(a);
        continue;
      }
      let b = w.__born.get(a);
      if (b === undefined) w.__born.set(a, (b = w.__T - dt));
      // Frozen by speed 0, not pause(): a paused CSS animation would outlive its class.
      if (a.playbackRate !== 0) a.playbackRate = 0;
      a.currentTime = Math.max(0, w.__T - b);
    }
  };

  // What happened on screen, for the sound track: effects (at their delay), moves, cuts, captions, pack stages.
  w.__marks = [];
  w.__seen = { n: null, cap: '', pack: '', flip: '' };
  w.__events = () => {
    const t = w.__T;
    const add = (k, at = t, extra = {}) => w.__marks.push({ k, t: Math.round(at), ...extra });
    for (const e of document.querySelectorAll('.fx:not([data-h]), .firework:not([data-h])')) {
      e.dataset.h = '1';
      const delay = parseFloat(e.style.animationDelay || (e.firstElementChild && e.firstElementChild.style.animationDelay) || '0') || 0;
      const k = e.classList.contains('firework') ? 'firework' : (/fx\/(\w+)\.png/.exec(e.style.backgroundImage) || [])[1] || 'fx';
      add(k, t + delay);
    }
    for (const e of document.querySelectorAll('.glide:not([data-h])')) { e.dataset.h = '1'; add('move'); }
    // Countdown numbers, a card landing in the tier list, the S tier drop, the puzzle answer.
    for (const [sel, k] of [['.ad-count', 'count'], ['.ad-slam', 'slam'], ['.ad-drop', 'drop'], ['.ad-reveal', 'reveal']]) {
      for (const e of document.querySelectorAll(`${sel}:not([data-h])`)) { e.dataset.h = '1'; add(k); }
    }
    const shot = document.querySelector('.ad-shot');
    if (shot && shot.dataset.n !== w.__seen.n) { w.__seen.n = shot.dataset.n; add('cut', t, { n: Number(shot.dataset.n), m: shot.dataset.music || 'full' }); }
    const cap = document.querySelector('.ad-cap span');
    const ct = cap ? cap.textContent : '';
    if (ct && ct !== w.__seen.cap) add('cap');
    w.__seen.cap = ct;
    const pack = document.querySelector('.opening-pack');
    const pk = pack ? pack.className : '';
    if (pk !== w.__seen.pack && pack) add('pack', t, { c: pk });
    w.__seen.pack = pk;
    const flip = document.querySelector('.flip');
    const fk = flip ? flip.className : '';
    if (fk !== w.__seen.flip && flip) add('flip', t, { c: fk });
    w.__seen.flip = fk;
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
await page.evaluate(() => { window.__T = 0; window.__born = new WeakMap(); window.__anims = new Set(); window.__marks = []; window.__start(); });
let clock = 0;
for (let f = 0; f < frames; f++) {
  const target = ((f + 1) * 1000) / FPS;
  const dt = Math.round(target - clock);
  clock += dt;
  await page.clock.runFor(dt);
  await page.evaluate(async (dt) => { await window.__flush(); await window.__flush(); window.__step(dt); window.__events(); }, dt);
  enc.stdin.write(await page.screenshot({ type: 'jpeg', quality: 94 }));
  if (f % 150 === 0) console.log(`${name}: ${f}/${frames}`);
}
enc.stdin.end();
fs.writeFileSync(`${out}${name}.marks.json`, JSON.stringify(await page.evaluate(() => window.__marks)));
await new Promise((r) => enc.on('close', r));
await browser.close();
console.log(`${out}${name}.mp4 (${(total / 1000).toFixed(1)} s)`);
