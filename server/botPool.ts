// The bot thinks in worker threads, so a long search (up to a few seconds on
// the strongest levels) never blocks other players' requests.

import { availableParallelism } from 'node:os';
import { Worker } from 'node:worker_threads';
import { type BotOptions, type BotTurn, chooseTurn } from '../src/engine/bot/search';
import type { MatchState } from '../src/engine/match';
import type { Color } from '../src/engine/types';

interface Job {
  state: MatchState;
  color: Color;
  opts: BotOptions;
  resolve: (t: BotTurn) => void;
  reject: (e: Error) => void;
}

interface Slot {
  worker: Worker;
  job: Job | null;
  timer?: NodeJS.Timeout;
  /** Has answered at least once (a worker that dies before that cannot start at all). */
  worked: boolean;
}

/**
 * The worker is TypeScript: it registers tsx inside the thread first (workers
 * do not inherit the main thread's loader, and Node's own type stripping
 * cannot resolve the engine's extensionless imports).
 */
const WORKER_URL = new URL('./bot.worker.ts', import.meta.url).href;
const BOOT = `import('tsx/esm/api').then(({ register }) => { register(); return import(${JSON.stringify(WORKER_URL)}); });`;

/** Search time is multiplied by this (e.g. 0.5 on a small shared CPU). */
const TIME_SCALE = Number(process.env.BOT_TIME_SCALE ?? 1) || 1;
/** No answer after this long: the worker is replaced and the job fails (the service plays a fallback move). */
const JOB_TIMEOUT_MS = 20_000;

export class BotPool {
  private slots: Slot[] = [];
  private queue: Job[] = [];
  private closed = false;
  /** Workers could not start at all: think on the main thread instead of playing dumb moves. */
  private broken = false;
  private startFailures = 0;

  /** BOT_WORKERS sets the number of threads; by default one per spare CPU core (1–4). */
  constructor(size = Number(process.env.BOT_WORKERS) || Math.max(1, Math.min(4, availableParallelism() - 1))) {
    for (let i = 0; i < size; i++) this.slots.push(this.spawn());
  }

  /** Same shape as the service's BotRunner. */
  run = (state: MatchState, color: Color, opts: BotOptions): Promise<BotTurn> => {
    const scaled = { ...opts, timeMs: Math.round(opts.timeMs * TIME_SCALE) };
    if (this.broken) return Promise.resolve().then(() => chooseTurn(state, color, scaled));
    return new Promise((resolve, reject) => {
      this.queue.push({ state, color, opts: scaled, resolve, reject });
      this.next();
    });
  };

  async close(): Promise<void> {
    this.closed = true;
    await Promise.all(this.slots.map((s) => s.worker.terminate()));
  }

  private spawn(): Slot {
    const slot: Slot = { worker: new Worker(BOOT, { eval: true }), job: null, worked: false };
    slot.worker.on('message', (msg: { turn?: BotTurn; error?: string }) => {
      slot.worked = true;
      this.startFailures = 0;
      const job = this.release(slot);
      if (job) msg.turn ? job.resolve(msg.turn) : job.reject(new Error(msg.error ?? 'bot failed'));
      this.next();
    });
    slot.worker.on('error', (err) => this.replace(slot, err));
    slot.worker.on('exit', (code) => code !== 0 && this.replace(slot, new Error(`bot worker exited (${code})`)));
    return slot;
  }

  private release(slot: Slot): Job | null {
    clearTimeout(slot.timer);
    const job = slot.job;
    slot.job = null;
    return job;
  }

  /** A worker crashed or hung: fail its job and start a fresh one in its place. */
  private replace(slot: Slot, err: Error): void {
    const i = this.slots.indexOf(slot);
    if (i < 0 || this.closed) return;
    const job = this.release(slot);
    void slot.worker.terminate();
    console.error('Bot worker failed:', err.message);
    if (!slot.worked && ++this.startFailures >= 3) {
      // Workers cannot start in this environment: stop respawning, finish the queue here.
      this.broken = true;
      this.slots.splice(i, 1);
      const waiting = job ? [job, ...this.queue] : this.queue;
      this.queue = [];
      for (const j of waiting) {
        try {
          j.resolve(chooseTurn(j.state, j.color, j.opts));
        } catch (e) {
          j.reject(e as Error);
        }
      }
      return;
    }
    job?.reject(err);
    this.slots[i] = this.spawn();
    this.next();
  }

  private next(): void {
    for (const slot of this.slots) {
      if (slot.job || !this.queue.length) continue;
      const job = this.queue.shift()!;
      slot.job = job;
      slot.timer = setTimeout(() => this.replace(slot, new Error('bot timed out')), JOB_TIMEOUT_MS);
      slot.worker.postMessage({ state: job.state, color: job.color, opts: job.opts });
    }
  }
}
