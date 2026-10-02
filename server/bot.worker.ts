// Worker thread of the bot pool (started through tsx, see botPool.ts): one search per message.
import { parentPort } from 'node:worker_threads';
import { chooseTurn } from '../src/engine/bot/search';

parentPort!.on('message', ({ state, color, opts }) => {
  try {
    parentPort!.postMessage({ turn: chooseTurn(state, color, opts) });
  } catch (err) {
    parentPort!.postMessage({ error: err instanceof Error ? err.message : String(err) });
  }
});
