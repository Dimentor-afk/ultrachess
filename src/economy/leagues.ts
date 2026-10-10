// Two ladders, each split into leagues. The bot ladder is practice against
// the engine: the bot's rating is the player's trophies (460 trophies, a bot of
// about 460 Elo), so every league starts where its bots get that strong; modest
// rewards and at most 5 packs a day. The player ladder is played against people
// and pays the full rewards. Reaching a league for the first time pays a bonus.

import type { Rarity } from '../engine/types';
import { PACK_SHARD_PRICE, type PackType } from './packs';

export type Ladder = 'bot' | 'pvp';

export interface LeagueReward {
  gold: number;
  pack: Exclude<PackType, 'starter'> | null;
}

export interface League {
  name: string;
  minTrophies: number;
  /** Bot ladder: the strongest card rarity in the bot's deck (its strength is the trophies, see botEloFor). */
  botMaxRarity?: Rarity;
  /** One-time bonus for reaching this league. */
  reward: LeagueReward;
  /** Pack art shown for the league. */
  art: Exclude<PackType, 'starter'>;
}

export const BOT_LEAGUES: League[] = [
  { name: 'Ліга новачків', minTrophies: 0, botMaxRarity: 'common', reward: { gold: 0, pack: null }, art: 'common' },
  { name: "Дерев'яна ліга", minTrophies: 200, botMaxRarity: 'common', reward: { gold: 50, pack: null }, art: 'common' },
  { name: "Кам'яна ліга", minTrophies: 400, botMaxRarity: 'rare', reward: { gold: 60, pack: 'common' }, art: 'common' },
  { name: 'Бронзова ліга', minTrophies: 600, botMaxRarity: 'rare', reward: { gold: 80, pack: 'common' }, art: 'rare' },
  { name: 'Срібна ліга', minTrophies: 800, botMaxRarity: 'epic', reward: { gold: 100, pack: 'rare' }, art: 'rare' },
  { name: 'Золота ліга', minTrophies: 1000, botMaxRarity: 'epic', reward: { gold: 150, pack: 'rare' }, art: 'epic' },
  { name: 'Платинова ліга', minTrophies: 1250, botMaxRarity: 'legendary', reward: { gold: 200, pack: 'epic' }, art: 'legendary' },
  { name: 'Міфічна ліга ботів', minTrophies: 1500, botMaxRarity: 'mythological', reward: { gold: 300, pack: 'legendary' }, art: 'mythic' },
  // The arenas of strong bots: from a FIDE master up to the strongest the engine plays (3000).
  { name: 'Арена майстрів', minTrophies: 1800, botMaxRarity: 'mythological', reward: { gold: 350, pack: 'epic' }, art: 'mythic' },
  { name: 'Міжнародна арена', minTrophies: 2100, botMaxRarity: 'mythological', reward: { gold: 400, pack: 'legendary' }, art: 'mythic' },
  { name: 'Гросмейстерська арена', minTrophies: 2400, botMaxRarity: 'mythological', reward: { gold: 450, pack: 'legendary' }, art: 'mythic' },
  { name: 'Арена чемпіонів', minTrophies: 2700, botMaxRarity: 'mythological', reward: { gold: 500, pack: 'legendary' }, art: 'mythic' },
  { name: 'Ultra арена', minTrophies: 3000, botMaxRarity: 'mythological', reward: { gold: 600, pack: 'mythic' }, art: 'mythic' },
];

/** The bot-ladder bot's rating for these trophies (the weakest bot below 250, the strongest above 3000). */
export function botEloFor(trophies: number): number {
  return Math.max(0, Math.round(trophies));
}

/**
 * Bot-ladder win streak: the 3rd win in a row pays 10 trophies more, the 4th and later 20 more
 * (30 and 40 instead of 20). A loss or a draw ends the streak.
 */
export const STREAK_BONUS = [0, 0, 10, 20];
export function streakBonus(winsInRow: number): number {
  return winsInRow < 1 ? 0 : STREAK_BONUS[Math.min(STREAK_BONUS.length, winsInRow) - 1];
}

export const PVP_LEAGUES: League[] = [
  { name: "Дерев'яна арена", minTrophies: 0, reward: { gold: 0, pack: null }, art: 'common' },
  { name: "Кам'яна арена", minTrophies: 300, reward: { gold: 100, pack: 'rare' }, art: 'rare' },
  { name: 'Срібна арена', minTrophies: 700, reward: { gold: 200, pack: 'epic' }, art: 'epic' },
  { name: 'Золота арена', minTrophies: 1200, reward: { gold: 400, pack: 'legendary' }, art: 'legendary' },
  { name: 'Міфічна арена', minTrophies: 2000, reward: { gold: 800, pack: 'mythic' }, art: 'mythic' },
];

export const LEAGUES: Record<Ladder, League[]> = { bot: BOT_LEAGUES, pvp: PVP_LEAGUES };

export const LADDER_NAMES: Record<Ladder, string> = { bot: 'Ліга ботів', pvp: 'Ліга гравців' };

export function leagueIndex(ladder: Ladder, trophies: number): number {
  let i = 0;
  LEAGUES[ladder].forEach((l, k) => {
    if (trophies >= l.minTrophies) i = k;
  });
  return i;
}

export const LADDER_TROPHIES: Record<Ladder, { win: number; loss: number; draw: number }> = {
  bot: { win: 20, loss: -15, draw: 0 },
  pvp: { win: 30, loss: -20, draw: 0 },
};

export const LADDER_WIN_GOLD: Record<Ladder, number> = { bot: 10, pvp: 20 };
export const LADDER_PACK_LIMIT: Record<Ladder, number> = { bot: 5, pvp: 10 };

/** Pack for the n-th win in a ladder. The bot ladder never gives more than a rare pack. */
const CYCLES: Record<Ladder, Exclude<PackType, 'starter'>[]> = {
  bot: ['common', 'common', 'common', 'rare', 'common', 'common', 'common', 'common', 'rare'],
  pvp: ['common', 'common', 'rare', 'common', 'common', 'rare', 'common', 'epic', 'common', 'common', 'rare', 'legendary'],
};

export function ladderReward(ladder: Ladder, winNumber: number): Exclude<PackType, 'starter'> {
  const c = CYCLES[ladder];
  return c[winNumber % c.length];
}

// ── Trials ──

export interface Trial {
  id: string;
  name: string;
  description: string;
  /** bot: a series against bots; pvp: wins in the player ladder count, in a row. */
  kind: 'bot' | 'pvp';
  /** Bot level of each match in order (for pvp only the count matters); all must be won in a row. */
  opponents: number[];
  /** Both sides play the classic deck. Otherwise your deck against a random bot deck up to `botMaxRarity`. */
  classic: boolean;
  botMaxRarity?: Rarity;
  /** Pack for winning (also given instead of `rewardCard` when the player already owns it). */
  reward: Exclude<PackType, 'starter'>;
  /** A card that exists only as this trial's prize. */
  rewardCard?: string;
  /** Entry fee in shards. */
  cost: number;
  difficulty: 1 | 2 | 3;
}

export const TRIALS: Trial[] = [
  {
    id: 'arsenal',
    name: 'Випробування арсеналу',
    description: 'Ваша колода проти трьох ботів із випадковими колодами аж до легендарних карток. Три перемоги поспіль.',
    kind: 'bot',
    opponents: [2, 3, 4],
    classic: false,
    botMaxRarity: 'legendary',
    reward: 'epic',
    cost: 200,
    difficulty: 1,
  },
  {
    id: 'classic',
    name: 'Випробування класики',
    description: 'Звичайні шахи без карток: у вас і в суперника класичні колоди. Виграйте три партії поспіль — жодної поразки чи нічиї.',
    kind: 'bot',
    opponents: [1, 2, 3],
    classic: true,
    reward: 'legendary',
    cost: PACK_SHARD_PRICE.legendary / 2,
    difficulty: 2,
  },
  {
    id: 'arena',
    name: 'Арена гравців',
    description: 'Три перемоги поспіль у лізі гравців — над живими суперниками. Поразка чи нічия завершує спробу. Кубки й паки ліги нараховуються як завжди.',
    kind: 'pvp',
    opponents: [0, 0, 0],
    classic: false,
    reward: 'legendary',
    cost: 400,
    difficulty: 2,
  },
  {
    id: 'comet',
    name: 'Шлях Комети',
    description: 'Найважче випробування: ваша колода проти чотирьох найсильніших ботів, у яких можуть бути навіть міфологічні картки. Нагорода — Комета, король, якого немає в жодному паку.',
    kind: 'bot',
    opponents: [4, 5, 6, 7],
    classic: false,
    botMaxRarity: 'mythological',
    reward: 'mythic',
    rewardCard: 'king-comet',
    cost: 1200,
    difficulty: 3,
  },
];

export function trialById(id: string): Trial | undefined {
  return TRIALS.find((t) => t.id === id);
}

/** A player's run in a trial: wins so far, or the result of the last run. */
export interface TrialRun {
  id: string;
  wins: number;
  status: 'active' | 'won' | 'lost';
  /** The trial game being played (an abandoned one counts as a defeat). */
  matchId?: string;
}
