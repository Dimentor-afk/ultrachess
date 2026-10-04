// Runs a game review in a worker and keeps finished reviews in this browser,
// so an opened analysis comes back at once.
import { type GameReview, reviewGame } from '../engine/bot/analysis';
import type { Action } from '../engine/match';
import type { Color, Deck } from '../engine/types';

export type ReviewRequest = { decks: Record<Color, Deck>; actions: Action[] };
export type ReviewResponse = { progress?: number; review?: GameReview; error?: string };

const PREFIX = 'ultrachess.review.v1.';
const INDEX = 'ultrachess.review.v1';
/** Reviews kept in the browser (the oldest go first). */
const KEEP = 30;

export function cachedReview(key: string): GameReview | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as GameReview) : null;
  } catch {
    return null;
  }
}

function keep(key: string, review: GameReview): void {
  try {
    const index = (JSON.parse(localStorage.getItem(INDEX) ?? '[]') as string[]).filter((k) => k !== key);
    index.push(key);
    while (index.length > KEEP) localStorage.removeItem(PREFIX + index.shift());
    localStorage.setItem(PREFIX + key, JSON.stringify(review));
    localStorage.setItem(INDEX, JSON.stringify(index));
  } catch {
    // Storage full or blocked: the review is simply computed again next time.
  }
}

/** Review a game; `onProgress` gets 0–1. Cancel with the returned function. */
export function runReview(
  key: string,
  req: ReviewRequest,
  onProgress: (done: number) => void,
): { promise: Promise<GameReview>; cancel: () => void } {
  let worker: Worker | null = null;
  let cancelled = false;
  const promise = new Promise<GameReview>((resolve, reject) => {
    const done = (review: GameReview) => {
      keep(key, review);
      resolve(review);
    };
    try {
      worker = new Worker(new URL('./analysis.worker.ts', import.meta.url), { type: 'module' });
    } catch {
      worker = null;
    }
    if (!worker) {
      // No workers here: compute on the page after it had a chance to paint.
      setTimeout(() => {
        if (cancelled) return;
        try {
          done(reviewGame(req.decks, req.actions, undefined, onProgress));
        } catch (e) {
          reject(e);
        }
      }, 50);
      return;
    }
    worker.onmessage = (e: MessageEvent<ReviewResponse>) => {
      if (e.data.progress !== undefined) onProgress(e.data.progress);
      if (e.data.review) {
        worker?.terminate();
        done(e.data.review);
      }
      if (e.data.error) {
        worker?.terminate();
        reject(new Error(e.data.error));
      }
    };
    worker.onerror = (e) => {
      worker?.terminate();
      reject(new Error(e.message || 'worker failed'));
    };
    worker.postMessage(req);
  });
  return {
    promise,
    cancel: () => {
      cancelled = true;
      worker?.terminate();
    },
  };
}
