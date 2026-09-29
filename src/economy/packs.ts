// Packs, drop odds, duplicates exchange and match rewards. Pure functions
// with an injectable RNG, shared by the server and the in-browser store.

import { CARDS } from '../engine/cards';
import type { Card, PieceType, Rarity } from '../engine/types';

export type PackType = 'starter' | 'common' | 'rare' | 'epic' | 'legendary' | 'mythic';
export type Rng = () => number;

export interface PackDef {
  type: PackType;
  name: string;
  cards: number;
  /** Per-card drop chance of each rarity, in percent (sums to 100). */
  odds: Record<Rarity, number>;
  /** At least one card of this rarity or higher. */
  guarantee?: Rarity;
  /**
   * Caps: at most N cards of this rarity *or higher* in one pack. A roll that
   * would break a cap drops to the next lower rarity.
   */
  limits: Partial<Record<Rarity, number>>;
  /** Time to unlock a pack won in a match, in minutes. */
  unlockMinutes: number;
  description: string;
}

export const RARITIES: Rarity[] = ['common', 'rare', 'epic', 'legendary', 'mythological'];

export const PACKS: Record<Exclude<PackType, 'starter'>, PackDef> = {
  common: {
    type: 'common',
    name: 'Звичайний пак',
    cards: 4,
    odds: { common: 64.5, rare: 25, epic: 8, legendary: 2, mythological: 0.5 },
    limits: { epic: 1 },
    unlockMinutes: 3,
    description: 'Найчастіша нагорода за перемогу.',
  },
  rare: {
    type: 'rare',
    name: 'Рідкісний пак',
    cards: 5,
    odds: { common: 45, rare: 38, epic: 12.5, legendary: 3.5, mythological: 1 },
    guarantee: 'rare',
    limits: { epic: 1 },
    unlockMinutes: 15,
    description: 'Щонайменше одна рідкісна картка.',
  },
  epic: {
    type: 'epic',
    name: 'Епічний пак',
    cards: 6,
    odds: { common: 25, rare: 40, epic: 27, legendary: 6.5, mythological: 1.5 },
    guarantee: 'epic',
    limits: { epic: 2, legendary: 1 },
    unlockMinutes: 60,
    description: 'Щонайменше одна епічна картка.',
  },
  legendary: {
    type: 'legendary',
    name: 'Легендарний пак',
    cards: 6,
    odds: { common: 15, rare: 35, epic: 33, legendary: 14, mythological: 3 },
    guarantee: 'legendary',
    limits: { epic: 3, legendary: 1 },
    unlockMinutes: 180,
    description: 'Щонайменше одна легендарна картка.',
  },
  mythic: {
    type: 'mythic',
    name: 'Міфічний пак',
    cards: 5,
    odds: { common: 0, rare: 30, epic: 40, legendary: 22, mythological: 8 },
    guarantee: 'mythological',
    limits: { epic: 3, legendary: 2, mythological: 1 },
    unlockMinutes: 480,
    description: 'Гарантована міфологічна картка.',
  },
};

export const STARTER_PACK = {
  type: 'starter' as const,
  name: 'Стартовий пак',
  description: 'По одній картці кожної фігури: 1 рідкісна, 1 епічна, решта звичайні.',
};

export function packName(type: PackType): string {
  return type === 'starter' ? STARTER_PACK.name : PACKS[type].name;
}

/** Duplicates needed to trade for a pack, per rarity. */
export const EXCHANGE: Record<Rarity, { need: number; pack: Exclude<PackType, 'starter'> }> = {
  common: { need: 10, pack: 'common' },
  rare: { need: 6, pack: 'rare' },
  epic: { need: 4, pack: 'epic' },
  legendary: { need: 2, pack: 'legendary' },
  mythological: { need: 2, pack: 'mythic' },
};

const pick = <T,>(xs: T[], rng: Rng): T => xs[Math.min(xs.length - 1, Math.floor(rng() * xs.length))];

export function cardsOf(rarity: Rarity, type?: PieceType): Card[] {
  return CARDS.filter((c) => c.rarity === rarity && (!type || c.pieceType === type));
}

export function rollRarity(odds: Record<Rarity, number>, rng: Rng, min: Rarity = 'common'): Rarity {
  const allowed = RARITIES.slice(RARITIES.indexOf(min)).filter((r) => odds[r] > 0);
  const total = allowed.reduce((s, r) => s + odds[r], 0);
  let x = rng() * total;
  for (const r of allowed) {
    x -= odds[r];
    if (x < 0) return r;
  }
  return allowed[allowed.length - 1];
}

function breaksLimit(limits: PackDef['limits'], have: Rarity[], next: Rarity): boolean {
  const n = RARITIES.indexOf(next);
  return RARITIES.some((cap, i) => {
    const max = limits[cap];
    if (max === undefined || i > n) return false;
    return have.filter((r) => RARITIES.indexOf(r) >= i).length + 1 > max;
  });
}

/** Most cards of each rarity one pack can hold, as shown to players. */
export function maxOfRarity(def: PackDef, rarity: Rarity): number {
  let max = def.cards;
  for (const [cap, n] of Object.entries(def.limits)) if (RARITIES.indexOf(cap as Rarity) <= RARITIES.indexOf(rarity)) max = Math.min(max, n!);
  return max;
}

/** Roll the card ids inside a pack. */
export function rollPack(type: PackType, rng: Rng = Math.random): string[] {
  if (type === 'starter') return rollStarter(rng);
  const def = PACKS[type];
  const rarities: Rarity[] = [];
  const add = (rolled: Rarity) => {
    let r = rolled;
    while (r !== 'common' && breaksLimit(def.limits, rarities, r)) r = RARITIES[RARITIES.indexOf(r) - 1];
    rarities.push(r);
  };
  // The guaranteed card is rolled first so the caps never squeeze it out.
  if (def.guarantee) add(rollRarity(def.odds, rng, def.guarantee));
  while (rarities.length < def.cards) add(rollRarity(def.odds, rng));
  // Best cards last, so the reveal builds up.
  rarities.sort((a, b) => RARITIES.indexOf(a) - RARITIES.indexOf(b));
  return rarities.map((r) => pick(cardsOf(r), rng).id);
}

const PIECES: PieceType[] = ['pawn', 'knight', 'bishop', 'rook', 'queen', 'king'];

/**
 * Starter pack: one card of every piece, random versions. Exactly one rare
 * and one epic (on random pieces), the rest common. Never legendary/mythic.
 */
export function rollStarter(rng: Rng = Math.random): string[] {
  const types = [...PIECES];
  const rareType = pick(types, rng);
  const epicType = pick(
    types.filter((t) => t !== rareType),
    rng,
  );
  const out = PIECES.map((t) => {
    const rarity: Rarity = t === rareType ? 'rare' : t === epicType ? 'epic' : 'common';
    return { t, id: pick(cardsOf(rarity, t), rng).id, rarity };
  });
  out.sort((a, b) => RARITIES.indexOf(a.rarity) - RARITIES.indexOf(b.rarity));
  return out.map((x) => x.id);
}

// ── Ranked play ──

export interface Arena {
  name: string;
  minTrophies: number;
  botLevel: number;
  /** Highest rarity the bot may put into its deck. */
  botMaxRarity: Rarity;
}

export const ARENAS: Arena[] = [
  { name: "Дерев'яна арена", minTrophies: 0, botLevel: 1, botMaxRarity: 'common' },
  { name: 'Кам’яна арена', minTrophies: 300, botLevel: 2, botMaxRarity: 'rare' },
  { name: 'Срібна арена', minTrophies: 700, botLevel: 2, botMaxRarity: 'epic' },
  { name: 'Золота арена', minTrophies: 1200, botLevel: 3, botMaxRarity: 'legendary' },
  { name: 'Міфічна арена', minTrophies: 2000, botLevel: 3, botMaxRarity: 'mythological' },
];

export function arenaFor(trophies: number): Arena {
  let a = ARENAS[0];
  for (const x of ARENAS) if (trophies >= x.minTrophies) a = x;
  return a;
}

export const TROPHIES = { win: 30, loss: -20, draw: 0 };

/** Pack won for the n-th ranked win (early Clash Royale style cycle). */
export const REWARD_CYCLE: Exclude<PackType, 'starter'>[] = [
  'common',
  'common',
  'rare',
  'common',
  'common',
  'rare',
  'common',
  'epic',
  'common',
  'common',
  'rare',
  'legendary',
];

export const PACK_SLOTS = 4;

export function rewardFor(winNumber: number): Exclude<PackType, 'starter'> {
  return REWARD_CYCLE[winNumber % REWARD_CYCLE.length];
}
