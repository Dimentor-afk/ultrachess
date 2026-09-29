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
  { level: 1, name: 'Новачок', elo: 500, opts: { depth: 1, timeMs: 700, noise: 150, blunder: 0.15, quiescence: false } },
  { level: 2, name: 'Учень', elo: 750, opts: { depth: 1, timeMs: 900, noise: 80, blunder: 0.07, quiescence: false } },
  { level: 3, name: 'Любитель', elo: 1000, opts: { depth: 2, timeMs: 1200, noise: 45, blunder: 0.03 } },
  { level: 4, name: 'Клубний гравець', elo: 1250, opts: { depth: 2, timeMs: 1300, noise: 25, blunder: 0.01 } },
  { level: 5, name: 'Досвідчений', elo: 1500, opts: { depth: 2, timeMs: 1500, noise: 12 } },
  { level: 6, name: 'Кандидат у майстри', elo: 1750, opts: { depth: 3, timeMs: 2000, noise: 6 } },
  { level: 7, name: 'Майстер', elo: 2000, opts: { depth: 3, timeMs: 2500, noise: 2 } },
];

export function botLevel(level: number): BotLevel {
  return BOT_LEVELS[Math.max(0, Math.min(BOT_LEVELS.length - 1, Math.round(level)))];
}

/** Strong settings for "Підказка", whatever the opponent's level. */
export const HINT_BOT: BotOptions = { depth: 2, timeMs: 1500, noise: 0 };
