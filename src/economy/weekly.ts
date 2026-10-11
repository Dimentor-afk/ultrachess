// "Тиждень слави": a weekly league, like a weekend league but on weekdays. It opens on Monday at
// 10:00 and closes on Friday at 22:00, Kyiv time (players elsewhere see the same moment in their
// own time). It comes in two modes on one schedule: against bots (now) and against players (to come).
// From 500 trophies of that mode's ladder the player enters the division of their trophies (fixed
// for the week) and has 15 games. Against bots, every game draws a new bot: a hidden rating from the
// player's own up to the division's ceiling (never weaker than the player) and a random deck with
// any cards, mythological ones too. The rewards go by the number of wins (3, 6, 9, 12, 15), each tier
// its own set, not added up; they are given once all 15 games are played, once no higher tier can
// be reached any more, or when the week closes. Seasons give the top tiers their own prizes: in the
// Berserker season, skins and a plate.

import type { PackType } from './packs';

export const WEEKLY_GAMES = 15;
export const WEEKLY_MIN_TROPHIES = 500;
export const WEEKLY_TIERS = [3, 6, 9, 12, 15] as const;
export const WEEKLY_TZ = 'Europe/Kyiv';

export type DivisionN = 1 | 2 | 3 | 4 | 5;

/** Against bots, or (to come) against players: the same week, divisions and season, own runs and rewards. */
export type WeeklyMode = 'bot' | 'pvp';
export const WEEKLY_MODES: WeeklyMode[] = ['bot', 'pvp'];
/** Modes that can be played now; the others are shown as coming. */
export const WEEKLY_LIVE: Record<WeeklyMode, boolean> = { bot: true, pvp: false };

export interface Division {
  /** 5 the lowest … 1 the highest, shown in Roman numerals. */
  n: DivisionN;
  roman: string;
  name: string;
  /** Bot-ladder trophies from `min`, up to `max` (exclusive; null: no ceiling). */
  min: number;
  max: number | null;
}

export const DIVISIONS: Division[] = [
  { n: 5, roman: 'V', name: 'Рекрут', min: 500, max: 1000 },
  { n: 4, roman: 'IV', name: 'Воїн', min: 1000, max: 1500 },
  { n: 3, roman: 'III', name: 'Гладіатор', min: 1500, max: 2000 },
  { n: 2, roman: 'II', name: 'Полководець', min: 2000, max: 2500 },
  { n: 1, roman: 'I', name: 'Легенда', min: 2500, max: null },
];

export function divisionFor(trophies: number): Division | null {
  return DIVISIONS.find((d) => trophies >= d.min && (d.max === null || trophies < d.max)) ?? null;
}

export function divisionByN(n: number): Division {
  return DIVISIONS.find((d) => d.n === n) ?? DIVISIONS[0];
}

/** The strongest bot of the season: the engine's top rating. */
export const WEEKLY_TOP_ELO = 3000;

/** A bot's rating for a game: from the player's rating up to the division's ceiling, never below. */
export function weeklyBotElo(division: Division, rating: number, rnd: number): number {
  const ceiling = division.max === null ? Math.max(rating, WEEKLY_TOP_ELO) : division.max - 1;
  if (ceiling <= rating) return rating;
  return Math.round(rating + (ceiling - rating) * Math.min(1, Math.max(0, rnd)));
}

// ── Season ──

export interface Season {
  id: string;
  name: string;
  /** The card whose skins are the season's prizes. */
  card: string;
  /** Its skins, plainest first: division V gets the first, division I all five. */
  skins: string[];
  /** The plate for 15 wins; its division follows the name ("Лють Берсерка · III"). */
  plate: string;
  /** The Monday of its first week (Kyiv), YYYY-MM-DD. */
  start: string;
  /** The Monday after its last week; null: no end set yet. */
  end: string | null;
}

export const SEASON: Season = {
  id: 'berserk',
  name: 'Сезон Берсерка',
  card: 'knight-berserk',
  skins: ['berserk-1', 'berserk-2', 'berserk-3', 'berserk-4', 'berserk-5'],
  plate: 'Лють Берсерка',
  start: '2026-10-12',
  end: null,
};

/** The plate a season gives for 15 wins in a division. */
export function seasonPlateId(season: Season, n: DivisionN): string {
  return `weekly:${season.id}:${n}`;
}

/** "weekly:berserk:3" → its season and division (null: not a weekly plate). */
export function parseWeeklyPlate(id: string): { season: Season; division: Division } | null {
  const m = /^weekly:([a-z0-9-]+):([1-5])$/.exec(id);
  if (!m || m[1] !== SEASON.id) return null;
  return { season: SEASON, division: divisionByN(Number(m[2])) };
}

// ── Rewards ──

export type RewardPack = Exclude<PackType, 'starter'>;

export interface WeeklyReward {
  gold: number;
  shards: number;
  packs: RewardPack[];
  skins: string[];
  plate: string | null;
}

const r = (gold: number, packs: RewardPack[] = [], shards = 0): WeeklyReward => ({ gold, shards, packs, skins: [], plate: null });

/**
 * Per mode, per division (5 … 1), per tier (3, 6, 9, 12, 15 wins). Against bots it is kept modest;
 * against players, of the same division, it pays a little more. The season's skins and plate (the
 * same in both modes) are added by `weeklyReward`.
 */
const BOT: Record<DivisionN, WeeklyReward[]> = {
  5: [r(120), r(180, ['common']), r(250, ['common', 'common']), r(300, ['rare'], 40), r(400, ['rare', 'common', 'common'], 60)],
  4: [r(150, [], 20), r(220, ['common']), r(300, ['rare']), r(380, ['rare', 'common']), r(500, ['epic'], 80)],
  3: [r(180, ['common']), r(260, ['rare']), r(350, ['rare'], 50), r(450, ['epic']), r(600, ['epic', 'rare'], 100)],
  2: [r(220, ['rare']), r(320, ['rare'], 40), r(420, ['epic']), r(550, ['epic', 'rare']), r(750, ['legendary'], 150)],
  1: [r(260, ['rare'], 30), r(380, ['epic']), r(500, ['epic', 'rare']), r(650, ['legendary']), r(900, ['legendary', 'epic'], 200)],
};

const PVP: Record<DivisionN, WeeklyReward[]> = {
  5: [r(150, ['common']), r(220, ['common'], 20), r(300, ['rare']), r(380, ['rare', 'common'], 50), r(500, ['epic', 'common'], 80)],
  4: [r(190, ['common'], 20), r(280, ['rare']), r(380, ['rare', 'common']), r(480, ['epic']), r(650, ['epic', 'rare'], 100)],
  3: [r(230, ['rare']), r(330, ['rare'], 40), r(450, ['epic']), r(580, ['epic', 'rare']), r(780, ['legendary'], 130)],
  2: [r(280, ['rare'], 30), r(400, ['epic']), r(540, ['epic', 'rare']), r(700, ['legendary']), r(950, ['legendary', 'epic'], 200)],
  1: [r(330, ['epic']), r(480, ['epic'], 40), r(640, ['legendary']), r(820, ['legendary', 'epic']), r(1150, ['legendary', 'legendary'], 260)],
};

const TABLES: Record<WeeklyMode, Record<DivisionN, WeeklyReward[]>> = { bot: BOT, pvp: PVP };

/** The reward of a tier (0: 3 wins … 4: 15 wins) in a division, with the season's prizes. */
export function weeklyReward(n: DivisionN, tier: number, mode: WeeklyMode = 'bot', season: Season = SEASON): WeeklyReward {
  const base = TABLES[mode][n][tier];
  // 12 wins: the division's skins (V the plainest, I all five); 15 wins: the same and the plate.
  const skins = tier >= 3 ? season.skins.slice(0, 6 - n) : [];
  return { ...base, packs: [...base.packs], skins, plate: tier === 4 ? seasonPlateId(season, n) : null };
}

/** Index of the tier reached with these wins (-1: below 3). */
export function tierIndex(wins: number): number {
  let i = -1;
  WEEKLY_TIERS.forEach((t, k) => {
    if (wins >= t) i = k;
  });
  return i;
}

// ── A player's week ──

export type WeeklyResult = 'w' | 'l' | 'd';

export interface WeeklyRun {
  /** The week: its Monday in Kyiv, YYYY-MM-DD. */
  week: string;
  season: string;
  division: DivisionN;
  /** Bot-ladder trophies when the player entered: no bot this week is weaker. */
  rating: number;
  results: WeeklyResult[];
  /** The game being played (an abandoned one is resumed). */
  matchId?: string;
  /** When the reward was taken (absent: not yet). */
  claimedAt?: number;
}

export const winsOf = (run: WeeklyRun) => run.results.filter((x) => x === 'w').length;

/** All games played, or no higher tier left in reach: the reward is settled. */
export function runSettled(run: WeeklyRun): boolean {
  const left = WEEKLY_GAMES - run.results.length;
  if (left <= 0) return true;
  const wins = winsOf(run);
  const next = WEEKLY_TIERS.find((t) => t > wins);
  return next === undefined || wins + left < next;
}

export function parseRun(json: string): WeeklyRun | null {
  if (!json) return null;
  try {
    const run = JSON.parse(json) as WeeklyRun;
    return run && typeof run.week === 'string' && Array.isArray(run.results) ? run : null;
  } catch {
    return null;
  }
}

// ── Kyiv time ──

interface Parts {
  y: number;
  m: number;
  d: number;
  h: number;
  mi: number;
  s: number;
  /** 1 Monday … 7 Sunday. */
  wd: number;
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
let fmt: Intl.DateTimeFormat | null = null;

function kyivParts(t: number): Parts {
  fmt ??= new Intl.DateTimeFormat('en-US', {
    timeZone: WEEKLY_TZ,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    weekday: 'short',
    hourCycle: 'h23',
  });
  const p: Record<string, string> = {};
  for (const x of fmt.formatToParts(new Date(t))) p[x.type] = x.value;
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour % 24, mi: +p.minute, s: +p.second, wd: WEEKDAYS.indexOf(p.weekday) + 1 };
}

/** How far Kyiv's clock is ahead of UTC at `t`, in ms. */
function offsetAt(t: number): number {
  const p = kyivParts(t);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(t / 1000) * 1000;
}

/** The moment it is `h`:00 on that day in Kyiv (summer and winter time alike). */
export function kyivMoment(y: number, m: number, d: number, h: number): number {
  const local = Date.UTC(y, m - 1, d, h);
  const first = local - offsetAt(local);
  return local - offsetAt(first);
}

export interface WeekWindow {
  /** The week's Monday (Kyiv), YYYY-MM-DD. */
  key: string;
  opensAt: number;
  closesAt: number;
  open: boolean;
  /** When the league opens next (this week's opening while it has not come yet). */
  nextOpensAt: number;
}

const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

/** The week `now` falls in: Monday 10:00 to Friday 22:00 in Kyiv. */
export function weekWindow(now: number): WeekWindow {
  const p = kyivParts(now);
  // The Monday of this week, as a calendar date (UTC arithmetic on dates only).
  const monday = Date.UTC(p.y, p.m - 1, p.d - (p.wd - 1));
  const day = (k: number) => new Date(monday + k * 86_400_000);
  const at = (k: number, h: number) => {
    const x = day(k);
    return kyivMoment(x.getUTCFullYear(), x.getUTCMonth() + 1, x.getUTCDate(), h);
  };
  const opensAt = at(0, 10);
  const closesAt = at(4, 22);
  return {
    key: iso(monday),
    opensAt,
    closesAt,
    open: now >= opensAt && now < closesAt,
    nextOpensAt: now < opensAt ? opensAt : at(7, 10),
  };
}

/** When the week with this key (its Monday) closes. */
export function weekClosesAt(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  const fri = new Date(Date.UTC(y, m - 1, d + 4));
  return kyivMoment(fri.getUTCFullYear(), fri.getUTCMonth() + 1, fri.getUTCDate(), 22);
}
