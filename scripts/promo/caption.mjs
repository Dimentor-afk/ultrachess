// A caption as a transparent PNG, the full width of the video, for ffmpeg to lay over a clip
// (memes whose reaction is a clip of their own, see README: freerook). Emoji in colour.
//   node scripts/promo/caption.mjs out.png "Black: oh wait… 😢" [font px]
import fs from 'node:fs';
import { chromium } from 'playwright';

const [out, text, size = '54'] = process.argv.slice(2);
const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const page = await browser.newPage({ viewport: { width: 1080, height: 400 } });
const fonts = process.env.FONTS_CSS ? `<style>${fs.readFileSync(process.env.FONTS_CSS, 'utf8')}</style>` : '';
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
// Emoji in the colour font: the text font's fallback draws some of them as grey outlines.
const html = esc(text).replace(/(\p{Extended_Pictographic}️?)/gu, '<span class="e">$1</span>');
await page.setContent(`${fonts}<style>
  html, body { margin: 0; background: transparent; }
  p { display: inline-block; margin: 0; padding: 14px 24px; font: 800 ${size}px Manrope, sans-serif; line-height: 1.15; color: #fff;
      text-shadow: 0 0 3px #000, 0 0 6px rgba(0, 0, 0, 0.9), 0 3px 10px rgba(0, 0, 0, 0.8); }
  .e { font-family: 'Noto Color Emoji', sans-serif; font-weight: 400; }
  div { width: 1080px; text-align: center; }
</style><div><p>${html}</p></div>`);
await page.evaluate(() => document.fonts.ready);
await page.locator('div').screenshot({ path: out, omitBackground: true });
await browser.close();
console.log(out);
