# Promo videos (TikTok / Reels / Shorts)

Vertical 1080×1920 videos made from the game's own UI: the real board, cards, effects and
pack opening, directed shot by shot. Nothing here ships with the game.

## Files

| File | What it does |
| --- | --- |
| `ads.ts` | The scripts: every video is a list of shots (`hook`, `board`, `pack`, `card`, `tier`, `versus`, `text`, `end`). `ADS` maps a name to its shots. |
| `ad.tsx`, `ad.css`, `ad.html` | The page that plays a script: `ad.html#<name>`. Transitions, captions, countdown, tier list, versus, native TikTok style. |
| `scene.ts` | Builds board positions and moves for `board` shots. |
| `check-ads.ts` | Checks every move in every script is legal for the engine (`npx vite-node scripts/promo/check-ads.ts`). |
| `render.mjs` | Renders a script frame by frame on a fake clock into `out/<name>.mp4`, and writes `out/<name>.marks.json` (when each effect, cut, caption and pack stage happened). |
| `sound.py` | Synthesises the sound track from the marks: music per shot (full / tense / build / end), drops on reveals, whooshes on cuts, effect sounds on effects. |
| `smooth.py` | Checks a rendered video for frozen or jumping frames. |
| `promo.tsx`, `promo.css`, `index.html`, `record.mjs` | The first, real-time recorder (real-time recording, kept for reference; `render.mjs` replaced it). |

## Videos

- Ads: `promo`, `tierlist`, `puzzle`, `versus`, `plot`, `packs`, `chaos`.
- Native (look like ordinary TikToks: white-box captions, plain cuts, still camera, watermark
  ultrachess.app; listed in `NATIVE`): `satisfying`, `memes`, and the "Card of the day" series
  `cardofday` (#1 Mirage), `cardofday2`…`cardofday7` (Immortal, Portal, Earthquake, Berserk,
  Kamikaze, Levitation). A new episode is one `cardOfDay(n, cardId, clip, lines)` entry in `SERIES`.

## Making one

```sh
npm i --no-save playwright ffmpeg-static && npx playwright install chromium
pip install numpy scipy
npx vite                                         # dev server, keep it running; do not edit files while rendering (HMR reload breaks the render)
PROMO_URL=http://localhost:5173 node scripts/promo/render.mjs promo
python3 scripts/promo/sound.py scripts/promo/out/promo.marks.json <seconds> out.wav --bpm 128 --key minor
#   native videos: --native --style lofi ; meme drops: --boom ; effects only: --no-music
ffmpeg -i scripts/promo/out/promo.mp4 -i out.wav -c:v copy -c:a aac -b:a 192k -shortest promo-sound.mp4
python3 scripts/promo/smooth.py ffmpeg promo-sound.mp4
```

`render.mjs` encodes at x264 crf 17. For sending (chat, uploads with a size limit) re-encode at
crf 21: `ffmpeg -i in.mp4 -c:v libx264 -crf 21 -preset slow -c:a copy out.mp4` (about 3 MB for 15 s).

## How the renderer stays smooth

The page runs on Playwright's paused fake clock. Before each screenshot every CSS/Web animation
is frozen (`playbackRate = 0`) and its `currentTime` set to the frame's exact time since it
started, so no frame is dropped or late however slow the screenshot is. Animations are tracked in
a set of their own, because a frozen animation still in its delay phase leaves
`document.getAnimations()` (that once made portal and other effects vanish from the videos).
