// Runs the bot search off the main thread so the board stays responsive.
import { bestMove, chooseTurn } from '../engine/bot/search';
import type { BotRequest, BotResponse } from './botClient';

self.onmessage = (e: MessageEvent<BotRequest>) => {
  const req = e.data;
  let res: BotResponse;
  try {
    res =
      req.kind === 'turn'
        ? { id: req.id, turn: chooseTurn(req.state, req.color, req.opts) }
        : { id: req.id, move: bestMove(req.state, req.color, req.opts) };
  } catch (err) {
    res = { id: req.id, error: err instanceof Error ? err.message : String(err) };
  }
  (self as unknown as Worker).postMessage(res);
};
