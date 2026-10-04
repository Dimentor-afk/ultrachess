# Ultrachess — notes for Claude

Chess where every piece is a card with a modified move. UI in Ukrainian; talk to the
author in Ukrainian. Stack: Vite + React 19 + TypeScript client, Node 22 server
(`server/index.ts`, node:http + node:sqlite), rules engine in `src/engine`, economy and
game service in `src/economy` (same service runs on the server and, over localStorage,
in the browser demo). Tests: `npx vitest run`; typecheck: `npm run typecheck`.
Rule decisions that differ from `docs/spec.md` go to `docs/engine-decisions.md`.

Languages: uk (source), en, de, it, es (`src/i18n`). UI text is written in Ukrainian inside
`t('…')` (placeholders `{0}`); the Ukrainian string is the dictionary key in `src/i18n/{en,de,it,es}.ts`.
Text from the server/engine (errors, move history, card/league names) stays Ukrainian on the wire and
is translated where shown with `tr()`. Engine move labels are identifiers (the server compares them):
never translate them in the engine. Every new `t()` key needs a translation in all four dictionaries
(a test checks the four have the same keys). Letters go out in the language of the `X-Lang` header.

## Semester project: Lab 27 — Multiplayer Browser Game

The author submits Ultrachess as the semester project from
https://github.com/rmalkevy/Programming-Practice-Projects (Variant 2: one of the 42 labs).
Best fit: **Lab 27 — Multiplayer Browser Game**
(`labs/lab-27-multiplayer-browser-game.md`). Fallbacks: **Lab 23 — Real-Time
Multiplayer Web App** (rooms, reconnection, persistence; fits a turn-based game even
more naturally) or **Lab 42** (own capstone).

Already covered: TypeScript end to end, Node server, server-authoritative play (the
server checks every action with the engine and rejects illegal moves = anti-cheat; in bot
games it also plays the bot itself, in worker threads, and keeps the record, so the
client cannot play the bot's side and a bot game resumes after a reload),
matchmaking → game → results loop, names/avatars/side colours, persistent stats (auth +
SQLite: wins, trophies, history), bots, mobile-playable, plenty of "make it yours".

### Lab status

Done: **WebSockets** for games with people (`server/hub.ts`, `src/api/live.ts`; HTTP stays as
the fallback), per-viewer views so hidden information reaches only its owner
(`src/engine/secure.ts`), **rooms** `#/game/<id>` with **spectators**, **reconnection**, and the
**README in the lab's format** (plus `docs/networking.md` for the Reflection questions and
`docs/two-players.gif`).
Game archive and review (`#/review/<m|p>/<id>`, from the profile history and the post-game summary):
the server hands a finished game's decks and actions to its players (`GameService.gameRecord`); the
analysis runs in the player's browser (`src/engine/bot/analysis.ts` in a worker: the bot's search per
position, moves graded !!/!/best…/?!/?/??, lichess's win-chance and accuracy formulas). 3 free a day,
then 100 shards each (`unlockAnalysis`; an opened game stays open).

Still to do:

1. **Public deploy:** live at https://ultrachess.app (domain bought on Cloudflare, DNS-only records to
   Fly; ultrachess.fly.dev pages redirect there with 301, its /api/ still answers) (Fly app `ultrachess`, region fra,
   one machine with the `ultrachess_data` volume, auto-stops when idle). Deploy from the author's
   Mac with `fly deploy`. Left: Resend secrets (`RESEND_API_KEY`, `MAIL_FROM`, `PUBLIC_URL`) and
   `min_machines_running = 1` before the defense.
2. **"Who did what"** in the README: the author's name (placeholder `[Ім'я автора]`).
3. **Scale:** load test in `scripts/load`; 1000 online measured on 4 cores (see docs/networking.md).
   Production machine for that: ≥1 GB RAM and dedicated cores (fly.toml comment).
4. **Payments** (shards for money, `docs/payments.md`): purchase journal (credit once, refunds),
   providers behind one interface: **Paddle** (Merchant of Record, chosen by the author: sells under its
   own name, no ФОП needed, pays out by bank transfer or Payoneer — Lemon Squeezy was dropped because it
   cannot pay out to Ukraine; `PADDLE_*` secrets, `server/paddle.ts`, checkout overlay via Paddle.js) and test
   payments (`PAYMENTS=test`, and in the demo). Prices in USD cents. Pack odds in the shop, `#/terms`,
   `#/privacy`. Sandbox purchase tested end to end; live account approved and a real $0.99 purchase went through. Left for
   the author: Payoneer approval (payouts only), then `PAYMENTS_PUBLIC=1` (until then
   only admins see and buy shards for money: `GameService.paymentsAdminOnly`).
   Support email support@ultrachess.app (Cloudflare Email Routing to the author's Gmail).
   (monobank provider for a ФОП exists in git history, commit `e93d7fd`.)

### Open question for the teacher

Lab 27 is written for real-time action games (20 Hz server tick, interpolation,
client-side prediction, 4–8 players per room). Chess is turn-based 1v1. Ask whether
that is accepted; arguments: many concurrent rooms + spectators, full server-side move
validation, hidden information (illusions, Безсмертна) sent only to its owner.

### Defense reminder

The labs allow AI, but the author must explain and change any line live during the
Reflection. Help them learn the key parts (engine move generation, server validation,
networking) rather than only adding features.
