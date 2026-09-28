import { type BotOptions, type BotTurn, bestMove, chooseTurn } from '../engine/bot/search';
import type { MatchState } from '../engine/match';
import type { Color, Move } from '../engine/types';

export type BotRequest = {
  id: number;
  kind: 'turn' | 'hint';
  state: MatchState;
  color: Color;
  opts: BotOptions;
};

export type BotResponse = { id: number; turn?: BotTurn; move?: Move | null; error?: string };

let worker: Worker | null = null;
let workerFailed = false;
let nextId = 1;
const waiting = new Map<number, (r: BotResponse) => void>();

function getWorker(): Worker | null {
  if (worker || workerFailed) return worker;
  try {
    worker = new Worker(new URL('./bot.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<BotResponse>) => {
      const cb = waiting.get(e.data.id);
      waiting.delete(e.data.id);
      cb?.(e.data);
    };
    worker.onerror = () => {
      workerFailed = true;
      worker = null;
      for (const [id, cb] of waiting) cb({ id, error: 'worker failed' });
      waiting.clear();
    };
  } catch {
    workerFailed = true;
  }
  return worker;
}

function run(req: Omit<BotRequest, 'id'>): Promise<BotResponse> {
  const id = nextId++;
  const w = getWorker();
  if (!w) {
    // Fallback: compute on the main thread after the UI had a chance to paint.
    return new Promise((resolve) =>
      setTimeout(() => {
        try {
          resolve(
            req.kind === 'turn'
              ? { id, turn: chooseTurn(req.state, req.color, req.opts) }
              : { id, move: bestMove(req.state, req.color, req.opts) },
          );
        } catch (err) {
          resolve({ id, error: String(err) });
        }
      }, 30),
    );
  }
  return new Promise((resolve) => {
    waiting.set(id, resolve);
    w.postMessage({ ...req, id });
  });
}

export async function requestBotTurn(state: MatchState, color: Color, opts: BotOptions): Promise<BotTurn> {
  const res = await run({ kind: 'turn', state, color, opts });
  if (res.error || !res.turn) throw new Error(res.error ?? 'no answer');
  return res.turn;
}

export async function requestHint(state: MatchState, color: Color, opts: BotOptions): Promise<Move | null> {
  const res = await run({ kind: 'hint', state, color, opts });
  if (res.error) throw new Error(res.error);
  return res.move ?? null;
}
