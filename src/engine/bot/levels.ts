// Bot strength presets, from a chess.com "Martin" style beginner upwards.

import type { BotOptions } from './search';

export interface BotLevel {
  level: number;
  name: string;
  /** Rough rating, for the player's orientation. */
  elo: number;
  opts: BotOptions;
}

export const BOT_LEVELS: BotLevel[] = [
  { level: 0, name: 'Мартін', elo: 250, opts: { depth: 1, timeMs: 500, noise: 260, blunder: 0.3, quiescence: false } },
  { level: 1, name: 'Новачок', elo: 600, opts: { depth: 1, timeMs: 800, noise: 110, blunder: 0.1, quiescence: false } },
  { level: 2, name: 'Любитель', elo: 1000, opts: { depth: 2, timeMs: 1200, noise: 45, blunder: 0.03 } },
  { level: 3, name: 'Досвідчений', elo: 1400, opts: { depth: 2, timeMs: 1500, noise: 12 } },
  { level: 4, name: 'Майстер', elo: 1800, opts: { depth: 3, timeMs: 2500, noise: 3 } },
];

export function botLevel(level: number): BotLevel {
  return BOT_LEVELS[Math.max(0, Math.min(BOT_LEVELS.length - 1, Math.round(level)))];
}

/** Strong settings for "Підказка", whatever the opponent's level. */
export const HINT_BOT: BotOptions = { depth: 2, timeMs: 1500, noise: 0 };
