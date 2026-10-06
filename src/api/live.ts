// The client side of /api/ws: one WebSocket per tab, watched games, requests
// with answers, and reconnection. When the connection drops (Wi-Fi off, the
// phone asleep, the server restarting) it comes back by itself, waiting a
// little longer each time, and asks again for every game it watches: the
// server answers with the current view, so the screen catches up at once.

import { ApiError, type PvpState } from '../economy/service';
import type { Action } from '../engine/match';
import { t, tr } from '../i18n';

export type LiveStatus = 'connecting' | 'online' | 'offline';

export interface LiveGame {
  game: PvpState;
  /** Spectators watching right now. */
  watchers: number;
}

type ServerMsg =
  | { t: 'game'; game: PvpState; watchers: number; req?: number }
  | { t: 'error'; id: string; req?: number; status: number; error: string }
  | { t: 'matched'; id: string }
  | { t: 'nudge' }
  | { t: 'emote'; id: string; color: 'w' | 'b'; e: string };

/** No answer to a request after this long: the caller falls back to HTTP. */
const REQUEST_TIMEOUT_MS = 10_000;

export class LiveSocket {
  private ws: WebSocket | null = null;
  private status: LiveStatus = 'connecting';
  private attempt = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private closed = false;
  private nextReq = 1;
  private pending = new Map<number, { resolve: (g: LiveGame) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private games = new Map<string, Set<(g: LiveGame) => void>>();
  private statusListeners = new Set<(s: LiveStatus) => void>();
  private matchedListeners = new Set<(id: string) => void>();
  private nudgeListeners = new Set<() => void>();
  private emoteListeners = new Set<(id: string, color: 'w' | 'b', e: string) => void>();

  constructor(private url: string) {
    this.connect();
    // Back on the network, or the phone woke up: reconnect now instead of waiting for the timer.
    const now = () => {
      if (!this.closed && !this.ws && !document.hidden) this.reconnectNow();
    };
    window.addEventListener('online', now);
    document.addEventListener('visibilitychange', now);
  }

  get state(): LiveStatus {
    return this.status;
  }

  /** Follow a game: `cb` gets every new view; returns the function that stops it. */
  watch(id: string, cb: (g: LiveGame) => void): () => void {
    let set = this.games.get(id);
    if (!set) {
      this.games.set(id, (set = new Set()));
      this.raw({ t: 'watch', id });
    }
    set.add(cb);
    return () => {
      set!.delete(cb);
      if (!set!.size) {
        this.games.delete(id);
        this.raw({ t: 'unwatch', id });
      }
    };
  }

  act(id: string, action: Action, v: string): Promise<LiveGame> {
    return this.request({ t: 'act', id, action, v });
  }
  resign(id: string): Promise<LiveGame> {
    return this.request({ t: 'resign', id });
  }
  claim(id: string): Promise<LiveGame> {
    return this.request({ t: 'claim', id });
  }

  /** Send a reaction in a game you play (dropped while offline: it is only a reaction). */
  emote(id: string, e: string): void {
    this.raw({ t: 'emote', id, e });
  }
  /** Reactions in the games this tab watches. */
  onEmote(cb: (id: string, color: 'w' | 'b', e: string) => void): () => void {
    this.emoteListeners.add(cb);
    return () => void this.emoteListeners.delete(cb);
  }

  onStatus(cb: (s: LiveStatus) => void): () => void {
    this.statusListeners.add(cb);
    return () => void this.statusListeners.delete(cb);
  }
  /** A game was found or a challenge accepted: `id` is the new game. */
  onMatched(cb: (id: string) => void): () => void {
    this.matchedListeners.add(cb);
    return () => void this.matchedListeners.delete(cb);
  }
  /** Something for the inbox changed (a challenge, a friend request, a move). */
  onNudge(cb: () => void): () => void {
    this.nudgeListeners.add(cb);
    return () => void this.nudgeListeners.delete(cb);
  }

  close(): void {
    this.closed = true;
    clearTimeout(this.timer);
    this.ws?.close();
    this.ws = null;
  }

  private request(msg: Record<string, unknown>): Promise<LiveGame> {
    const ws = this.ws;
    // Not connected: a TypeError, like fetch() offline, so callers retry or use HTTP.
    if (!ws || ws.readyState !== WebSocket.OPEN) return Promise.reject(new TypeError(t('Немає живого з’єднання')));
    const req = this.nextReq++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(req);
        reject(new TypeError(t('Сервер не відповів')));
      }, REQUEST_TIMEOUT_MS);
      this.pending.set(req, { resolve, reject, timer });
      ws.send(JSON.stringify({ ...msg, req }));
    });
  }

  private raw(msg: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  private connect(): void {
    if (this.closed) return;
    this.setStatus(this.attempt ? 'offline' : 'connecting');
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url);
    } catch {
      return this.later();
    }
    this.ws = ws;
    ws.onopen = () => {
      this.attempt = 0;
      this.setStatus('online');
      // Every watched game is asked for again: the answer is its current view.
      for (const id of this.games.keys()) this.raw({ t: 'watch', id });
    };
    ws.onmessage = (e) => {
      let msg: ServerMsg;
      try {
        msg = JSON.parse(String(e.data));
      } catch {
        return;
      }
      this.receive(msg);
    };
    ws.onclose = (e) => {
      if (this.ws === ws) this.ws = null;
      for (const [req, p] of this.pending) {
        clearTimeout(p.timer);
        p.reject(new TypeError(t('З’єднання обірвалося')));
        this.pending.delete(req);
      }
      // Too many tabs open: the server let a newer one in. This tab waits until it is
      // looked at again (no reconnect loop between tabs).
      if (e.code === 4008) return this.setStatus('offline');
      this.later();
    };
    ws.onerror = () => ws.close();
  }

  private later(): void {
    if (this.closed) return;
    this.setStatus('offline');
    clearTimeout(this.timer);
    const ms = Math.min(15_000, 500 * 2 ** this.attempt++);
    this.timer = setTimeout(() => this.connect(), ms);
  }

  private reconnectNow(): void {
    clearTimeout(this.timer);
    this.connect();
  }

  private receive(msg: ServerMsg): void {
    if (msg.t === 'game') {
      const live = { game: msg.game, watchers: msg.watchers };
      for (const cb of this.games.get(msg.game.id) ?? []) cb(live);
      if (msg.req !== undefined) this.settle(msg.req, (p) => p.resolve(live));
    } else if (msg.t === 'error') {
      if (msg.req !== undefined) this.settle(msg.req, (p) => p.reject(new ApiError(msg.status, tr(msg.error))));
    } else if (msg.t === 'matched') {
      for (const cb of this.matchedListeners) cb(msg.id);
    } else if (msg.t === 'nudge') {
      for (const cb of this.nudgeListeners) cb();
    } else if (msg.t === 'emote') {
      for (const cb of this.emoteListeners) cb(msg.id, msg.color, msg.e);
    }
  }

  private settle(req: number, fn: (p: { resolve: (g: LiveGame) => void; reject: (e: Error) => void }) => void): void {
    const p = this.pending.get(req);
    if (!p) return;
    clearTimeout(p.timer);
    this.pending.delete(req);
    fn(p);
  }

  private setStatus(s: LiveStatus): void {
    if (s === this.status) return;
    this.status = s;
    for (const cb of this.statusListeners) cb(s);
  }
}

/** ws(s)://<this site>/api/ws, next to the page (the app may live under a path). */
export function liveUrl(): string {
  const u = new URL('api/ws', document.baseURI);
  u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
  return u.toString();
}
