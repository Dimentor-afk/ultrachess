// Load test (see scripts/load/README.md). Every user holds a WebSocket (like the home page does). Bot players play ranked
// bot games over HTTP; pairs play their friend game over WS; spectators watch random games.
import WebSocket from 'ws';
import { readFileSync } from 'node:fs';
const BASE = process.env.BASE ?? 'http://localhost:8099';
const U = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const DURATION = +process.argv[3] * 1000;
const rnd = (a, b) => a + Math.random() * (b - a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lat = { bot: [], ws: [], start: [] };
let errors = 0, botMoves = 0, wsMoves = 0, games = 0;
const end = Date.now() + DURATION;
const hdr = (t) => ({ cookie: `uc_session=${t}`, 'content-type': 'application/json', origin: BASE });
async function api(t, method, path, body) {
  const r = await fetch(`${BASE}/api/${path}`, { method, headers: hdr(t), body: body ? JSON.stringify(body) : undefined });
  const d = r.status === 204 ? null : await r.json().catch(() => null);
  if (!r.ok) throw new Error(`${r.status} ${d?.error}`);
  return d;
}
function socket(t) {
  return new Promise((res) => {
    const ws = new WebSocket(`${BASE.replace(/^http/, 'ws')}/api/ws`, { headers: { cookie: `uc_session=${t}`, origin: BASE }, perMessageDeflate: true });
    ws.on('open', () => res(ws)); ws.on('error', () => { errors++; res(null); });
  });
}
async function botPlayer(t) {
  await sleep(rnd(0, 15000));
  const ws = await socket(t);
  while (Date.now() < end) {
    try {
      let t0 = performance.now();
      const st = await api(t, 'POST', 'matches', { ranked: true });
      lat.start.push(performance.now() - t0); games++;
      let view = (await api(t, 'POST', `matches/${st.matchId}/action`, { action: null, v: '' })).view;
      while (!view.state.result && Date.now() < end) {
        if (!view.legal.length) break;
        await sleep(rnd(+(process.env.THINK_MIN ?? 3000), +(process.env.THINK_MAX ?? 9000)));
        const mv = view.legal[Math.floor(Math.random() * view.legal.length)];
        t0 = performance.now();
        const r = await api(t, 'POST', `matches/${st.matchId}/action`, { action: { type: 'move', move: mv }, v: view.v });
        lat.bot.push(performance.now() - t0); botMoves++;
        view = r.view;
      }
      if (view.state.result) await api(t, 'POST', `matches/${st.matchId}/finish`, { resigned: false }).catch(() => {});
      else await api(t, 'POST', `matches/${st.matchId}/finish`, { resigned: true }).catch(() => {});
    } catch (e) { errors++; await sleep(2000); }
  }
  ws?.close();
}
async function pvpPlayer(t, id) {
  await sleep(rnd(0, 15000));
  const ws = await socket(t); if (!ws) return;
  let req = 1; const pending = new Map();
  let view = null;
  const think = async () => {
    if (!view || view.state.result || !view.legal.length) return;
    const my = view; await sleep(rnd(2000, 7000));
    if (view !== my || Date.now() > end) return;
    const mv = my.legal[Math.floor(Math.random() * my.legal.length)];
    const r = req++; pending.set(r, performance.now());
    ws.send(JSON.stringify({ t: 'act', id, req: r, action: { type: 'move', move: mv }, v: my.v }));
  };
  ws.on('message', (raw) => {
    const m = JSON.parse(String(raw));
    if (m.t === 'game' && m.game.id === id) {
      if (m.req && pending.has(m.req)) { lat.ws.push(performance.now() - pending.get(m.req)); pending.delete(m.req); wsMoves++; }
      view = m.game.view; void think();
    } else if (m.t === 'error') { if (m.status !== 409) errors++; if (m.req) pending.delete(m.req); }
  });
  ws.send(JSON.stringify({ t: 'watch', id }));
  while (Date.now() < end) await sleep(1000);
  ws.close();
}
async function spectator(t, ids) {
  await sleep(rnd(0, 15000));
  const ws = await socket(t); if (!ws) return;
  ws.send(JSON.stringify({ t: 'watch', id: ids[Math.floor(Math.random() * ids.length)] }));
  while (Date.now() < end) await sleep(1000);
  ws.close();
}
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))].toFixed(0) : '-'; };
const tick = setInterval(() => console.log(`[${new Date().toISOString().slice(11, 19)}] bot moves ${botMoves} (p50 ${pct(lat.bot, .5)} p95 ${pct(lat.bot, .95)} ms) · ws moves ${wsMoves} (p50 ${pct(lat.ws, .5)} p95 ${pct(lat.ws, .95)} ms) · games ${games} · errors ${errors}`), 15000);
await Promise.all([
  ...U.bot.map((t) => botPlayer(t)),
  ...U.pairs.flatMap((p) => [pvpPlayer(p.a, p.id), pvpPlayer(p.b, p.id)]),
  ...U.spec.map((t) => spectator(t, U.pairs.map((p) => p.id))),
]);
clearInterval(tick);
console.log(`DONE bot moves ${botMoves} p50 ${pct(lat.bot, .5)} p95 ${pct(lat.bot, .95)} p99 ${pct(lat.bot, .99)} · start p95 ${pct(lat.start, .95)} · ws moves ${wsMoves} p50 ${pct(lat.ws, .5)} p95 ${pct(lat.ws, .95)} · errors ${errors}`);
