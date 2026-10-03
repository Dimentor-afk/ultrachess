// Records the promo scene into a 1080×1920 MP4 for TikTok / Reels / Shorts.
//
//   npm i --no-save playwright ffmpeg-static && npx playwright install chromium
//   npx vite                      # the dev server, in another terminal
//   node scripts/promo/record.mjs broken "rook-earthquake:This rook causes an *earthquake*|queen-immortal:This queen *can't die*" "Chess, but *broken*"
//
// Cuts: "card-id:hook" or "card-id:hook:ms" (the card's clip cut to its first ms),
// separated by "|"; *word* is drawn in gold. The video lands in scripts/promo/out/<name>.mp4.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import ffmpeg from 'ffmpeg-static';
import { chromium } from 'playwright';

const [name, cuts, intro] = process.argv.slice(2);
if (!name || !cuts) throw new Error('usage: node scripts/promo/record.mjs <name> "<cuts>" ["<intro>"]');
const site = process.env.PROMO_URL ?? 'http://localhost:5173';
const out = new URL('./out/', import.meta.url).pathname;
const dir = `${out}raw-${Date.now()}`;

const browser = await chromium.launch();
// The page is laid out for a 432×768 phone and zoomed 2.5× to fill the frame.
const ctx = await browser.newContext({ viewport: { width: 1080, height: 1920 }, recordVideo: { dir, size: { width: 1080, height: 1920 } } });
const page = await ctx.newPage();
const t0 = Date.now();
await page.goto(`${site}/scripts/promo/?${new URLSearchParams({ cuts, zoom: '2.5', ...(intro ? { intro } : {}) })}`);
await page.waitForSelector('.promo');
const start = (Date.now() - t0) / 1000;
await page.waitForFunction(() => document.body.dataset.done === '1', null, { timeout: 120_000 });
const end = (Date.now() - t0) / 1000;
await ctx.close();
await browser.close();

// The recording starts with a blank page: cut it off, then H.264 for the apps.
const webm = fs.readdirSync(dir).find((f) => f.endsWith('.webm'));
execFileSync(ffmpeg, ['-loglevel', 'error', '-y', '-ss', String(start + 0.05), '-to', String(end), '-i', `${dir}/${webm}`,
  '-vf', 'fps=30,format=yuv420p', '-c:v', 'libx264', '-crf', '18', '-movflags', '+faststart', '-an', `${out}${name}.mp4`]);
fs.rmSync(dir, { recursive: true, force: true });
console.log(`${out}${name}.mp4 (${(end - start).toFixed(1)} s)`);
