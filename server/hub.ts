// Live games over WebSocket (/api/ws). The server stays the authority: a
// client sends its action, the service checks it with the engine, and the
// hub pushes the new view to everyone watching that game — to each viewer
// their own view (a player without the opponent's hidden information, a
// spectator without anyone's). A viewer gets a message only when their view
// actually changed, so a hidden action (Безсмертна) is not even noticed.
//
// Client → server:  watch / unwatch {id}, act {id, req, action, v},
//                   resign {id, req}, claim {id, req}, emote {id, e}
// Server → client:  game {game, watchers, req?}, error {id, req?, status, error},
//                   matched {id} (a game was found for you), nudge (refresh the inbox),
//                   emote {id, color, e} (a player's reaction)

import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { type WebSocket, WebSocketServer } from 'ws';
import { ApiError, type GameService, type PvpState, type ServiceEvent } from '../src/economy/service';
import type { Action } from '../src/engine/match';
import { EMOTE_GAP_MS, isEmote } from '../src/economy/emotes';

interface Conn {
  ws: WebSocket;
  token: string;
  userId: string;
  /** Games this connection watches → the last message sent for each (to skip repeats). */
  games: Map<string, string>;
  alive: boolean;
  /** Messages in the current rate window. */
  budget: number;
  /** When this connection last sent an emote. */
  lastEmote: number;
}

type ClientMsg =
  | { t: 'watch' | 'unwatch'; id: string }
  | { t: 'act'; id: string; req: number; action: Action; v: string }
  | { t: 'resign' | 'claim'; id: string; req: number }
  | { t: 'emote'; id: string; e: string };

const HEARTBEAT_MS = 25_000;
/** Messages a connection may send per heartbeat window (a game needs a handful). */
const MSG_BUDGET = 120;
/** Games one connection may watch at once (a player has a few tabs, not hundreds). */
const MAX_WATCHED = 20;
/** Open connections per account (tabs, devices). Each holds ~100 KB of compressor
 *  memory, so one account must not open thousands; the oldest gives way. */
const MAX_CONNS_PER_USER = 8;

export class Hub {
  private wss = new WebSocketServer({
    noServer: true,
    maxPayload: 256 * 1024,
    // A view is ~7 KB of JSON. The compressor remembers the previous message, so
    // each next view of a game costs ~150 bytes on the wire. An 8 KB window does
    // that just as well as the default 32 KB, with ~100 KB of zlib memory per
    // connection instead of ~300 KB.
    perMessageDeflate: { serverMaxWindowBits: 13, zlibDeflateOptions: { memLevel: 7 } },
  });
  private conns = new Set<Conn>();
  private byUser = new Map<string, Set<Conn>>();
  private byGame = new Map<string, Set<Conn>>();

  constructor(
    server: Server,
    private svc: GameService,
    private tokenOf: (req: IncomingMessage) => string | null,
    private sameOrigin: (req: IncomingMessage) => boolean,
  ) {
    server.on('upgrade', (req, socket, head) => void this.upgrade(req, socket, head));
    svc.onEvent = (e) => this.onEvent(e);
    setInterval(() => this.heartbeat(), HEARTBEAT_MS).unref();
  }

  private async upgrade(req: IncomingMessage, socket: Duplex, head: Buffer): Promise<void> {
    const refuse = (code: number, text: string) => {
      socket.write(`HTTP/1.1 ${code} ${text}\r\nConnection: close\r\n\r\n`);
      socket.destroy();
    };
    if ((req.url ?? '').split('?')[0] !== '/api/ws') return refuse(404, 'Not Found');
    // Browsers send cookies with a WebSocket from any site: the origin check is what stops hijacking.
    if (!this.sameOrigin(req)) return refuse(403, 'Forbidden');
    const token = this.tokenOf(req) ?? '';
    let userId: string;
    try {
      userId = await this.svc.userIdOf(token);
    } catch {
      return refuse(401, 'Unauthorized');
    }
    this.wss.handleUpgrade(req, socket, head, (ws) => this.accept(ws, token, userId));
  }

  private accept(ws: WebSocket, token: string, userId: string): void {
    const conn: Conn = { ws, token, userId, games: new Map(), alive: true, budget: MSG_BUDGET, lastEmote: 0 };
    const mine = [...(this.byUser.get(userId) ?? [])];
    for (const old of mine.slice(0, Math.max(0, mine.length - MAX_CONNS_PER_USER + 1))) {
      old.ws.close(4008, 'Забагато відкритих вкладок');
      this.drop(old);
    }
    this.conns.add(conn);
    this.index(this.byUser, userId, conn);
    ws.on('pong', () => (conn.alive = true));
    ws.on('message', (data) => {
      if (--conn.budget < 0) return this.send(conn, { t: 'error', id: '', status: 429, error: 'Забагато повідомлень.' });
      let msg: ClientMsg;
      try {
        msg = JSON.parse(String(data));
      } catch {
        return;
      }
      void this.handle(conn, msg);
    });
    ws.on('close', () => this.drop(conn));
    ws.on('error', () => this.drop(conn));
  }

  private async handle(conn: Conn, msg: ClientMsg): Promise<void> {
    if (!msg || typeof msg.id !== 'string') return;
    const { id } = msg;
    const req = 'req' in msg ? msg.req : undefined;
    try {
      if (msg.t === 'watch') {
        if (!conn.games.has(id) && conn.games.size >= MAX_WATCHED) throw new ApiError(429, 'Забагато відкритих партій.');
        // The game must exist before the connection is listed under it: made-up ids would pile up.
        const first = !conn.games.has(id);
        if (first) await this.svc.pvpState(conn.token, id);
        conn.games.set(id, conn.games.get(id) ?? '');
        this.index(this.byGame, id, conn);
        await this.push(conn, id, true);
        // A new spectator changes the count everybody sees.
        await this.broadcast(id);
      } else if (msg.t === 'unwatch') {
        conn.games.delete(id);
        this.byGame.get(id)?.delete(conn);
        await this.broadcast(id);
      } else if (msg.t === 'act') {
        this.reply(conn, req, await this.svc.pvpAction(conn.token, id, msg.action, String(msg.v ?? '')));
      } else if (msg.t === 'resign') {
        this.reply(conn, req, await this.svc.pvpResign(conn.token, id));
      } else if (msg.t === 'claim') {
        this.reply(conn, req, await this.svc.pvpClaim(conn.token, id));
      } else if (msg.t === 'emote') {
        // Players only, from the fixed set, not too often; passed on to everyone watching the game.
        if (!isEmote(msg.e) || Date.now() - conn.lastEmote < EMOTE_GAP_MS) return;
        const color = await this.svc.pvpColor(conn.token, id);
        conn.lastEmote = Date.now();
        for (const c of this.byGame.get(id) ?? []) this.send(c, { t: 'emote', id, color, e: msg.e });
      }
    } catch (e) {
      const status = e instanceof ApiError ? e.status : 500;
      if (!(e instanceof ApiError)) console.error('WebSocket handler failed:', e);
      this.send(conn, { t: 'error', id, req, status, error: e instanceof ApiError ? e.message : 'Внутрішня помилка сервера.' });
      // Whatever went wrong, the client gets the game as it really is now.
      if (conn.games.has(id)) await this.push(conn, id, true).catch(() => undefined);
    }
  }

  /** The answer to the client's own request: always sent, and remembered as the last state it has. */
  private reply(conn: Conn, req: number | undefined, game: PvpState): void {
    this.players.set(game.id, [game.white.id, game.black.id]);
    const msg = { t: 'game', game, watchers: this.watchers(game.id), req };
    if (conn.games.has(game.id)) conn.games.set(game.id, this.fingerprint(msg));
    this.send(conn, msg);
  }

  private onEvent(e: ServiceEvent): void {
    if (e.type === 'game') void this.broadcast(e.id);
    for (const u of e.users) {
      for (const c of this.byUser.get(u) ?? [])
        this.send(c, e.type === 'matched' ? { t: 'matched', id: e.id } : e.type === 'draft' ? { t: 'draft', id: e.id, start: !!e.start } : { t: 'nudge' });
    }
  }

  /** Send every watcher of the game their own view, if it changed for them. */
  private async broadcast(id: string): Promise<void> {
    for (const conn of [...(this.byGame.get(id) ?? [])]) await this.push(conn, id, false).catch(() => undefined);
  }

  private async push(conn: Conn, id: string, force: boolean): Promise<void> {
    const game = await this.svc.pvpState(conn.token, id);
    this.players.set(id, [game.white.id, game.black.id]);
    const msg = { t: 'game', game, watchers: this.watchers(id) };
    const print = this.fingerprint(msg);
    if (!force && conn.games.get(id) === print) return;
    if (conn.games.has(id)) conn.games.set(id, print);
    this.send(conn, msg);
  }

  /** The two players of each watched game (learnt from its first view). */
  private players = new Map<string, [string, string]>();

  /** Spectators of the game right now: watching users who are not its players. */
  private watchers(id: string): number {
    const players: string[] = this.players.get(id) ?? [];
    const users = new Set<string>();
    for (const c of this.byGame.get(id) ?? []) if (!players.includes(c.userId)) users.add(c.userId);
    return users.size;
  }

  private fingerprint(msg: { game: PvpState; watchers: number }): string {
    return JSON.stringify([msg.game, msg.watchers]);
  }

  private send(conn: Conn, msg: unknown): void {
    if (conn.ws.readyState === conn.ws.OPEN) conn.ws.send(JSON.stringify(msg));
  }

  private index(map: Map<string, Set<Conn>>, key: string, conn: Conn): void {
    let set = map.get(key);
    if (!set) map.set(key, (set = new Set()));
    set.add(conn);
  }

  private drop(conn: Conn): void {
    if (!this.conns.delete(conn)) return;
    this.byUser.get(conn.userId)?.delete(conn);
    if (!this.byUser.get(conn.userId)?.size) this.byUser.delete(conn.userId);
    for (const id of conn.games.keys()) {
      this.byGame.get(id)?.delete(conn);
      if (!this.byGame.get(id)?.size) {
        this.byGame.delete(id);
        this.players.delete(id);
      } else void this.broadcast(id);
    }
  }

  /** Dead connections (a phone that lost the network) are dropped; budgets refill. */
  private heartbeat(): void {
    for (const conn of this.conns) {
      if (!conn.alive) {
        conn.ws.terminate();
        this.drop(conn);
        continue;
      }
      conn.alive = false;
      conn.budget = MSG_BUDGET;
      conn.ws.ping();
    }
  }

  close(): void {
    for (const conn of this.conns) conn.ws.close(1001, 'Сервер перезапускається');
    this.wss.close();
  }
}
