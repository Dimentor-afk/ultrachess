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
- Meme videos in English with sound effects only (`--native --boom --no-music`), on positions of their own full of card pieces: `illegal` (a chess friend reacts to every move) and `fine` ("gg, close one" over what really happened, seen from Black).
- `onlypiece`: a TikTok edit ("He's the only piece that can take two in one move"): danger squares
  in red, a tilted turning board, the Berserk's double capture on the drop, then a cut and a kick on
  every hit (`bumps`), hero inserts (`kind: 'hero'`). Cut to the author's own track (not in the
  repo): `ffmpeg -i out/onlypiece.mp4 -i <track> -map 0:v -map 1:a -t 15.6 -af afade=t=out:st=15:d=0.6 -c:v libx264 -crf 21 -c:a aac out.mp4`.
  Board shots also take `red` (per step), `gold` and `cam` (`push`, `tilt-l`, `tilt-r`, `punch`, `spin`).
- `chessfx`: the `game` in a "chessfx" edit: a shot per move (`pre` plays the moves before it at once),
  each with a chess-site grade badge and its squares in the grade's colour (`grade`, `paint`), the card's
  name (`label`), and `land`: when the move lands, so the lead is worked out from the move's own length
  and every move lands on a beat (136 BPM, cut to the author's track, which is not in the repo).
  `chessfx2`: round 2 on the same grid with other cards (Galloper, Phantom, Duelist, Piercer, Levitation,
  Eclipse, Displacer, Earthquake, Ricochet), mate by a queen back from beyond the board. A new round is
  a position and its moves for `shotOf(pos, moves)`.
- `portaledit`: a phonk edit of the Portal Bishop ("The board has edges. He doesn't."), cut to the grid of
  our own phonk: `python3 scripts/promo/phonk.py phonk.wav --bpm 130 --intro 3 --drop 5` (synthesised:
  cowbell riff, 808, claps, hats; prints the drop time and the beat). The game's effect sounds go on
  top: `sound.py out/portaledit.marks.json 15.6 sfx.wav --native --no-music`, mixed with ffmpeg `amix`.
  Cuts are timed from the start of the ad, so an edit never drifts off its music.
- `patchmate`: the clip in the patch notes (`public/assets/patch/mate-<lang>.mp4/.webm`, poster
  `mate.webp`): rendered in every language with `AD_LANG=uk|en|de|it|es` and the site's fonts
  (`FONTS_CSS`: the Google Fonts CSS with the font files inlined), then cropped to the board:
  `ffmpeg -i out/patchmate-uk.mp4 -vf "crop=1040:1040:20:504,scale=480:480,fade=t=in:st=0:d=0.25,fade=t=out:st=4.7:d=0.3" -an -c:v libx264 -crf 27 -movflags +faststart mate-uk.mp4`
  (and `-c:v libvpx-vp9 -b:v 0 -crf 38` for the .webm).
- `game`: one position, one 12-move game with a card trick on every move and a line with a chess-style grade for each, ending on a real mate (per-step times in `gaps`).
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
