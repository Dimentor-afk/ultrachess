// Reviews a finished game off the main thread (a few hundred ms per position).
import { reviewGame } from '../engine/bot/analysis';
import type { ReviewRequest, ReviewResponse } from './analysisClient';

self.onmessage = (e: MessageEvent<ReviewRequest>) => {
  const post = (r: ReviewResponse) => (self as unknown as Worker).postMessage(r);
  try {
    const review = reviewGame(e.data.decks, e.data.actions, undefined, (done) => post({ progress: done }));
    post({ review });
  } catch (err) {
    post({ error: err instanceof Error ? err.message : String(err) });
  }
};
