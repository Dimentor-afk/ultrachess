// Daily shop: three board themes and three capture effects a day, the same for
// every player. The offer is worked out from the date alone (no database), and
// two days in a row never share an item.

import { CAPTURE_FX } from './captureFx';
import { BOARD_THEMES } from './themes';

export const DAILY_SLOTS = 3;
const DAY_MS = 864e5;

export interface ShopOffer {
  /** UTC day number (days since 1970-01-01). */
  day: number;
  themes: string[];
  fx: string[];
  /** When this offer is replaced: the next UTC midnight. */
  refreshAt: number;
}

export const dayOf = (now: number): number => Math.floor(now / DAY_MS);

export function shopOffer(now: number): ShopOffer {
  const day = dayOf(now);
  return {
    day,
    themes: dailyPicks(
      BOARD_THEMES.filter((t) => t.price > 0).map((t) => t.id),
      day,
      'themes',
    ),
    fx: dailyPicks(
      CAPTURE_FX.filter((f) => f.price > 0).map((f) => f.id),
      day,
      'fx',
    ),
    refreshAt: (day + 1) * DAY_MS,
  };
}

/**
 * `size` items of `pool` for one day.
 *
 * Days are grouped into cycles of floor(n / size) days. Each cycle shuffles
 * the pool with its own seed and deals it out: the first day, the middle days,
 * the last day — so inside a cycle no item repeats. The first day of a cycle
 * also skips whatever the previous cycle showed on its last day, so the
 * boundary is covered too (this needs n >= 3 * size).
 */
export function dailyPicks(pool: string[], day: number, salt: string, size = DAILY_SLOTS): string[] {
  if (pool.length <= size) return [...pool];
  const days = Math.floor(pool.length / size);
  const cycle = Math.floor(day / days);
  const slot = day - cycle * days;
  const order = shuffled(pool, `${salt}:${cycle}`);
  const last = order.slice(-size);
  if (slot === days - 1) return last;
  const yesterday = new Set(shuffled(pool, `${salt}:${cycle - 1}`).slice(-size));
  const rest = order.slice(0, -size);
  const first = [...rest.filter((id) => !yesterday.has(id)), ...rest.filter((id) => yesterday.has(id))].slice(0, size);
  if (slot === 0) return first;
  const middle = rest.filter((id) => !first.includes(id));
  return middle.slice((slot - 1) * size, slot * size);
}

/** Fisher–Yates with a PRNG seeded from a string: same seed, same order. */
function shuffled(pool: string[], seed: string): string[] {
  const rng = mulberry32(fnv1a(seed));
  const a = [...pool];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function fnv1a(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
