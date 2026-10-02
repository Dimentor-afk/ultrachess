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

### Still to do for the lab

1. **WebSockets** for live games (friend games and the player ladder). Today moves go
   by HTTP and the opponent polls every 1.5 s — the lab requires WebSockets in the
   Basic level and graders check the Network tab. Keep the server as the authority.
2. **Public deploy** (Render / Fly.io): a URL that works from any device. Config is ready
   (`Dockerfile`, `fly.toml`, `render.yaml`); what is left is running `fly deploy` with the author's account.
3. **Game rooms with a shareable link** (`/game/<id>`) and **spectator mode**.
4. **Reconnection**: drop Wi-Fi, come back to the same game (and a clear state while
   reconnecting). Bot games already resume from the server's record; friend/ladder games
   still need it with WebSockets.
5. **README in the lab's format**: play link, GIF of two players, architecture
   diagram, networking write-up (what is sent, when, why the server is the source of
   truth), how to run, features, known limitations, who did what.

Known gap to fix together with WebSockets (see `docs/pre-deploy.md`): both clients of a
player game get the full action list, so hidden information (Міраж, illusions, Безсмертна)
can be read in devtools. The fix is per-player views (`playerView` + own legal moves).

### Open question for the teacher

Lab 27 is written for real-time action games (20 Hz server tick, interpolation,
client-side prediction, 4–8 players per room). Chess is turn-based 1v1. Ask whether
that is accepted; arguments: many concurrent rooms + spectators, full server-side move
validation, hidden information (illusions, Безсмертна) sent only to its owner.

### Defense reminder

The labs allow AI, but the author must explain and change any line live during the
Reflection. Help them learn the key parts (engine move generation, server validation,
networking) rather than only adding features.
