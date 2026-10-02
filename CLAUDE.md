# Ultrachess — notes for Claude

Chess where every piece is a card with a modified move. UI in Ukrainian; talk to the
author in Ukrainian. Stack: Vite + React 19 + TypeScript client, Node 22 server
(`server/index.ts`, node:http + node:sqlite), rules engine in `src/engine`, economy and
game service in `src/economy` (same service runs on the server and, over localStorage,
in the browser demo). Tests: `npx vitest run`; typecheck: `npm run typecheck`.
Rule decisions that differ from `docs/spec.md` go to `docs/engine-decisions.md`.

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

Still to do:

1. **Public deploy** (Fly.io / Render): config is ready (`Dockerfile`, `fly.toml`,
   `render.yaml`); what is left is running `fly deploy` with the author's account and putting
   the URL into the README (it has a placeholder).
2. **"Who did what"** in the README: the author's name (placeholder `[Ім'я автора]`).

### Open question for the teacher

Lab 27 is written for real-time action games (20 Hz server tick, interpolation,
client-side prediction, 4–8 players per room). Chess is turn-based 1v1. Ask whether
that is accepted; arguments: many concurrent rooms + spectators, full server-side move
validation, hidden information (illusions, Безсмертна) sent only to its owner.

### Defense reminder

The labs allow AI, but the author must explain and change any line live during the
Reflection. Help them learn the key parts (engine move generation, server validation,
networking) rather than only adding features.
