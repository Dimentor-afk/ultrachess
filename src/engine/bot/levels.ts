// Bot strength presets, from a chess.com "Martin" style beginner upwards.
// The ratings are a guide for players, not measured against people: each level
// was checked to beat the one below it in bot-against-bot games (scripts/bot).

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
  // The arena: deeper searches (transposition table, pruning) instead of a fixed 3 plies.
  { level: 8, name: 'Майстер ФІДЕ', elo: 2200, opts: { depth: 4, timeMs: 1500, noise: 4 } },
  { level: 9, name: 'Міжнародний майстер', elo: 2400, opts: { depth: 5, timeMs: 2000, noise: 2 } },
  { level: 10, name: 'Гросмейстер', elo: 2600, opts: { depth: 6, timeMs: 3000, noise: 1 } },
  { level: 11, name: 'Супергросмейстер', elo: 2800, opts: { depth: 32, timeMs: 4000, noise: 0 } },
  { level: 12, name: 'Ultra', elo: 3000, opts: { depth: 32, timeMs: 6000, noise: 0 } },
];

const TOP = BOT_LEVELS.length - 1;
const clampLevel = (level: number) => Math.max(0, Math.min(TOP, Number.isFinite(level) ? level : 0));

/**
 * A level for a rating, between two presets (the bot ladder: the bot's rating is the player's trophies).
 * Below the weakest preset it is the weakest, above the strongest the strongest.
 */
export function levelForElo(elo: number): number {
  if (elo <= BOT_LEVELS[0].elo) return 0;
  for (let i = 1; i <= TOP; i++) {
    const a = BOT_LEVELS[i - 1];
    const b = BOT_LEVELS[i];
    if (elo <= b.elo) return Math.round((i - 1 + (elo - a.elo) / (b.elo - a.elo)) * 1000) / 1000;
  }
  return TOP;
}

/** The rating of a level (a fractional level lies between its two presets). */
export function eloOfLevel(level: number): number {
  const l = clampLevel(level);
  const i = Math.floor(l);
  if (i >= TOP) return BOT_LEVELS[TOP].elo;
  return Math.round(BOT_LEVELS[i].elo + (BOT_LEVELS[i + 1].elo - BOT_LEVELS[i].elo) * (l - i));
}

/**
 * Search settings of a level. A fractional one blends its two presets: noise, blunders and time
 * slide between them, the depth and the capture search switch halfway (they cannot be split).
 */
export function botOptions(level: number): BotOptions {
  const l = clampLevel(level);
  const i = Math.floor(l);
  const f = l - i;
  if (f === 0 || i >= TOP) return BOT_LEVELS[Math.min(i, TOP)].opts;
  const a = BOT_LEVELS[i].opts;
  const b = BOT_LEVELS[i + 1].opts;
  const lerp = (x: number, y: number) => x + (y - x) * f;
  const near = f < 0.5 ? a : b;
  return {
    depth: near.depth,
    timeMs: Math.round(lerp(a.timeMs, b.timeMs)),
    noise: Math.round(lerp(a.noise ?? 3, b.noise ?? 3) * 10) / 10,
    blunder: Math.round(lerp(a.blunder ?? 0, b.blunder ?? 0) * 1000) / 1000,
    quiescence: near.quiescence,
  };
}

/** A level as players see it: the nearest preset's name, and the level's own rating. */
export function botLevel(level: number): BotLevel {
  const l = clampLevel(level);
  const near = BOT_LEVELS[Math.round(l)];
  return Number.isInteger(l) ? near : { ...near, level: l, elo: eloOfLevel(l), opts: botOptions(l) };
}

/** Strong settings for "Підказка", whatever the opponent's level: as deep as 1.5 s allows. */
export const HINT_BOT: BotOptions = { depth: 32, timeMs: 1500, noise: 0 };
