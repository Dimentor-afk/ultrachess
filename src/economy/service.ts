// Game service: accounts, collection, packs, decks and ranked matches.
// The same code runs on the Node server (SQLite) and in the browser demo.

import { CARDS, CARD_BY_ID } from '../engine/cards';
import { DECK_SLOTS, classicDeck, deckPositions, validateDeck } from '../engine/deck';
import { type Action, type MatchState, createMatch, performAction, resign } from '../engine/match';
import type { Color, Deck, PieceType, Rarity } from '../engine/types';
import { PACK_SHARD_PRICE, type PackType, RARITIES, type Rng, SHARDS_PER_DUPE, packGold, packName, rollPack } from './packs';
import {
  BOT_LEAGUES,
  LADDER_PACK_LIMIT,
  LADDER_TROPHIES,
  LADDER_WIN_GOLD,
  LEAGUES,
  type Ladder,
  type LeagueReward,
  PVP_LEAGUES,
  TRIALS,
  type Trial,
  type TrialRun,
  ladderReward,
  leagueIndex,
  trialById,
} from './leagues';
import { BOARD_THEMES, DEFAULT_THEME, themeById } from './themes';
import { CAPTURE_FX, DEFAULT_CAPTURE_FX, captureFxById } from './captureFx';
import { type ShopOffer, shopOffer } from './dailyShop';
import { BOT_LEVELS, botLevel } from '../engine/bot/levels';
import { type BotOptions, type BotTurn, chooseTurn } from '../engine/bot/search';
import { legalMoves } from '../engine/legal';
import { type QuestEvent, type QuestView, addProgress, parseQuests, questViews } from './quests';
import { type Hasher, type MatchRow, type PackRow, type PvpRow, type Role, type Store, type UserRow, randomId } from './store';

/** Short public code for finding a player (first 6 hex digits of the id). */
const tagOf = (u: UserRow) => u.id.slice(0, 6).toUpperCase();

export const ADMIN_EMAILS = ['koldmiand@gmail.com'];
const SESSION_DAYS = 30;

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface Profile {
  id: string;
  email: string;
  name: string;
  role: Role;
  trophies: number;
  wins: number;
  losses: number;
  draws: number;
  /** Player-ladder league name (trophies above are the player ladder's). */
  arena: string;
  ladders: Record<Ladder, LadderView>;
  /** Trial runs by trial id. */
  trials: Record<string, TrialRun>;
  activeDeckId: string | null;
  tag: string;
  avatar: string;
  bestTrophies: number;
  createdAt: number;
  gold: number;
  shards: number;
  /** Board themes owned (the free one included) and the one in use. */
  themes: string[];
  boardTheme: string;
  quests: QuestView[];
  /** Level of the ranked bot the player will meet. */
  rankedBot: number;
  /** Admin testing override (null = by arena). */
  botOverride: number | null;
  /** Capture effect in use and the ones owned (the free one included). */
  captureFx: string;
  ownedFx: string[];
}

export interface LadderView {
  trophies: number;
  best: number;
  league: number;
  leagueName: string;
  next: { index: number; name: string; minTrophies: number; reward: LeagueReward } | null;
  /** Packs won in this ladder today and its daily cap. */
  packsToday: number;
  packsLimit: number;
  /** Pack for the next win (while under the cap). */
  nextPack: Exclude<PackType, 'starter'>;
  winGold: number;
  win: number;
  loss: number;
}

/** A league reached for the first time and what it paid. */
export interface LeagueUp {
  ladder: Ladder;
  name: string;
  gold: number;
  pack: PackView | null;
}

/** What a ladder game changed for one player. */
export interface LadderResult {
  ladder: Ladder;
  trophiesDelta: number;
  goldDelta: number;
  reward: PackView | null;
  rewardSkipped: boolean;
  leagueUps: LeagueUp[];
}

export interface PackView {
  id: string;
  type: PackType;
  name: string;
  source: string;
}

export interface Collection {
  owned: Record<string, { dupes: number }>;
}

export interface OpenResult {
  pack: PackView;
  /** `shards` > 0 for a duplicate: it was turned into that many shards. */
  cards: { cardId: string; isNew: boolean; shards: number }[];
  gold: number;
  shards: number;
}

/**
 * Plays the bot's turn. The server runs it in a worker thread, the browser
 * demo in a web worker; tests pass a scripted bot.
 */
export type BotRunner = (state: MatchState, color: Color, opts: BotOptions) => Promise<BotTurn>;

export interface MatchStart {
  matchId: string;
  ranked: boolean;
  /** Actions already played: a game that was left unfinished goes on from here. */
  actions: Action[];
  /** Set for a trial match. */
  trial?: { id: string; name: string; round: number; rounds: number };
  color: Color;
  botLevel: number;
  playerDeck: Deck;
  botDeck: Deck;
}

export interface MatchFinish {
  outcome: 'win' | 'loss' | 'draw';
  reason: string;
  trophiesDelta: number;
  goldDelta: number;
  reward: PackView | null;
  /** A win past today's pack limit gives no pack. */
  rewardSkipped: boolean;
  leagueUps: LeagueUp[];
  ladder: Ladder | null;
  trial: TrialResult | null;
  profile: Profile;
}

/** Where a trial run stands after a game, and its prize once won. */
export interface TrialResult {
  name: string;
  wins: number;
  rounds: number;
  status: TrialRun['status'];
  reward: PackView | null;
  /** A trial-only card, when that was the prize. */
  card: string | null;
}

export interface LeaderRow {
  id: string;
  name: string;
  tag: string;
  avatar: string;
  trophies: number;
  wins: number;
  arena: string;
  botTrophies: number;
  botLeague: string;
}

/** A player as others see them (friends list, search, leaderboard). */
export interface PlayerCard {
  id: string;
  name: string;
  tag: string;
  avatar: string;
  trophies: number;
  arena: string;
  online: boolean;
  lastSeen: number;
}

export interface FriendsView {
  friends: (PlayerCard & { linkId: string })[];
  incoming: (PlayerCard & { linkId: string })[];
  outgoing: (PlayerCard & { linkId: string })[];
}

export interface PublicProfile extends PlayerCard {
  wins: number;
  losses: number;
  draws: number;
  bestTrophies: number;
  cards: number;
  createdAt: number;
  relation: 'self' | 'friend' | 'incoming' | 'outgoing' | 'none';
}

export interface HistoryRow {
  id: string;
  kind: 'ranked' | 'bot' | 'training' | 'friend' | 'trial';
  opponent: string;
  outcome: 'win' | 'loss' | 'draw';
  reason: string;
  moves: number;
  trophiesDelta: number;
  at: number;
}

export interface ChallengeView {
  id: string;
  from: PlayerCard;
  to: PlayerCard;
  incoming: boolean;
  createdAt: number;
}

export interface PvpSummary {
  id: string;
  opponent: PlayerCard;
  color: Color;
  yourTurn: boolean;
  status: 'active' | 'finished';
  outcome: 'win' | 'loss' | 'draw' | null;
  moves: number;
  updatedAt: number;
  /** A player-ladder game (listed on the home page, not with friends). */
  ranked: boolean;
}

export interface PvpState {
  id: string;
  color: Color;
  /** Each side's capture effect. */
  captureFx: Record<Color, string>;
  you: PlayerCard;
  opponent: PlayerCard;
  whiteDeck: Deck;
  blackDeck: Deck;
  actions: Action[];
  status: 'active' | 'finished';
  resignedBy: Color | null;
  /** A player-ladder game; `ladder` is what it changed for you once finished. */
  ranked: boolean;
  ladder: LadderResult | null;
  /** The player-ladder trial this game counted for, if any. */
  trial: TrialResult | null;
  /** When the game last moved (a stalled opponent can be timed out). */
  updatedAt: number;
}

export interface Inbox {
  friendRequests: number;
  challenges: number;
  yourTurn: number;
  /** An unfinished player-ladder game to return to. */
  rankedGame: string | null;
}

const ONLINE_MS = 2 * 60_000;
/** A search that was not refreshed for this long is dropped. */
const SEEK_TTL = 12_000;
/** A player-ladder opponent who does not move for this long can be timed out. */
export const CLAIM_MS = 90_000;

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  trophies: number;
  botTrophies: number;
  wins: number;
  losses: number;
  cards: number;
  gold: number;
  shards: number;
  claimed: boolean;
}

const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

export class GameService {
  constructor(
    private store: Store,
    private hasher: Hasher,
    private now: () => number = Date.now,
    private rng: Rng = Math.random,
    private bot: BotRunner = async (state, color, opts) => chooseTurn(state, color, opts),
  ) {}

  /** Seed the admin accounts (no password until their owner registers). */
  async init(): Promise<void> {
    for (const email of ADMIN_EMAILS) {
      const u = await this.store.getUserByEmail(email);
      if (!u) {
        await this.store.insertUser(this.newUser(email, email.split('@')[0], 'admin', null));
      } else if (u.role !== 'admin') {
        await this.store.updateUser(u.id, { role: 'admin' });
      }
    }
  }

  private newUser(email: string, name: string, role: Role, passHash: string | null): UserRow {
    return {
      id: randomId(8),
      email,
      name,
      role,
      passHash,
      trophies: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      cycle: 0,
      starterGiven: false,
      activeDeckId: null,
      createdAt: this.now(),
      gold: 0,
      shards: 0,
      themes: '[]',
      boardTheme: DEFAULT_THEME,
      packsToday: 0,
      packsDay: '',
      avatar: 'knight-classic',
      bestTrophies: 0,
      lastSeen: 0,
      quests: '{}',
      botOverride: -1,
      captureFx: DEFAULT_CAPTURE_FX,
      ownedFx: '[]',
      botTrophies: 0,
      botBest: 0,
      botCycle: 0,
      botPacksToday: 0,
      botPacksDay: '',
      leagueRewards: '{}',
      trials: '{}',
    };
  }

  // ── Accounts ──

  async register(emailRaw: string, password: string, nameRaw: string): Promise<{ token: string; profile: Profile }> {
    const email = emailRaw.trim().toLowerCase();
    const name = nameRaw.trim() || email.split('@')[0];
    if (!emailOk(email)) throw new ApiError(400, 'Вкажіть коректну пошту.');
    if (password.length < 6) throw new ApiError(400, 'Пароль має містити щонайменше 6 символів.');
    if (name.length > 24) throw new ApiError(400, 'Нікнейм — до 24 символів.');
    let user = await this.store.getUserByEmail(email);
    const hash = await this.hasher.hash(password);
    if (user && user.passHash) throw new ApiError(409, 'Акаунт з цією поштою вже існує. Увійдіть.');
    if (user) {
      // A seeded account (admin) is claimed by its first registration.
      await this.store.updateUser(user.id, { passHash: hash, name });
      user = (await this.store.getUser(user.id))!;
    } else {
      user = this.newUser(email, name, ADMIN_EMAILS.includes(email) ? 'admin' : 'player', hash);
      await this.store.insertUser(user);
    }
    await this.giveStarter(user);
    return { token: await this.newSession(user.id), profile: await this.profileOf(user.id) };
  }

  async login(emailRaw: string, password: string): Promise<{ token: string; profile: Profile }> {
    const email = emailRaw.trim().toLowerCase();
    const user = await this.store.getUserByEmail(email);
    if (!user || !user.passHash || !(await this.hasher.verify(password, user.passHash))) {
      throw new ApiError(401, 'Неправильна пошта або пароль.');
    }
    return { token: await this.newSession(user.id), profile: await this.profileOf(user.id) };
  }

  async logout(token: string): Promise<void> {
    await this.store.deleteSession(token);
  }

  private async newSession(userId: string): Promise<string> {
    const token = randomId(24);
    await this.store.insertSession({ token, userId, expiresAt: this.now() + SESSION_DAYS * 864e5 });
    return token;
  }

  private async auth(token: string | null | undefined): Promise<UserRow> {
    if (!token) throw new ApiError(401, 'Потрібно увійти.');
    const s = await this.store.getSession(token);
    if (!s || s.expiresAt < this.now()) throw new ApiError(401, 'Сесія завершилась. Увійдіть знову.');
    const u = await this.store.getUser(s.userId);
    if (!u) throw new ApiError(401, 'Акаунт не знайдено.');
    // Presence for friends: refresh at most every 30 seconds.
    if (this.now() - u.lastSeen > 30_000) {
      u.lastSeen = this.now();
      await this.store.updateUser(u.id, { lastSeen: u.lastSeen });
    }
    return u;
  }

  private async admin(token: string | null | undefined): Promise<UserRow> {
    const u = await this.auth(token);
    if (u.role !== 'admin') throw new ApiError(403, 'Лише для адміністратора.');
    return u;
  }

  private async profileOf(userId: string): Promise<Profile> {
    const u = (await this.store.getUser(userId))!;
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      trophies: u.trophies,
      wins: u.wins,
      losses: u.losses,
      draws: u.draws,
      arena: PVP_LEAGUES[leagueIndex('pvp', u.trophies)].name,
      ladders: { bot: this.ladderView(u, 'bot'), pvp: this.ladderView(u, 'pvp') },
      trials: this.trialRuns(u),
      activeDeckId: u.activeDeckId,
      tag: tagOf(u),
      avatar: u.avatar,
      bestTrophies: Math.max(u.bestTrophies, u.trophies),
      createdAt: u.createdAt,
      gold: u.gold,
      shards: u.shards,
      themes: this.themesOf(u),
      boardTheme: themeById(u.boardTheme).id,
      quests: questViews(parseQuests(u.quests, this.today())),
      rankedBot: this.rankedBot(u),
      botOverride: u.role === 'admin' && u.botOverride >= 0 ? u.botOverride : null,
      captureFx: captureFxById(u.captureFx).id,
      ownedFx: this.fxOf(u),
    };
  }

  private fxOf(u: UserRow): string[] {
    let bought: string[] = [];
    try {
      bought = JSON.parse(u.ownedFx || '[]');
    } catch {
      bought = [];
    }
    return CAPTURE_FX.filter((f) => f.price === 0 || bought.includes(f.id)).map((f) => f.id);
  }

  /** Buy a capture effect for gold and switch to it. */
  async buyCaptureFx(token: string, id: string): Promise<Profile> {
    const u = await this.auth(token);
    const fx = CAPTURE_FX.find((f) => f.id === id);
    if (!fx) throw new ApiError(404, 'Такого ефекту немає.');
    const owned = this.fxOf(u);
    if (owned.includes(id)) throw new ApiError(409, 'Цей ефект уже ваш.');
    if (!shopOffer(this.now()).fx.includes(id)) throw new ApiError(400, 'Цього ефекту сьогодні немає в магазині — він повернеться в інший день.');
    if (u.gold < fx.price) throw new ApiError(400, `Потрібно ${fx.price} золота, у вас ${u.gold}.`);
    const bought = owned.filter((f) => captureFxById(f).price > 0).concat(id);
    await this.store.updateUser(u.id, { gold: u.gold - fx.price, ownedFx: JSON.stringify(bought), captureFx: id });
    return this.profileOf(u.id);
  }

  async setCaptureFx(token: string, id: string): Promise<Profile> {
    const u = await this.auth(token);
    if (!this.fxOf(u).includes(id)) throw new ApiError(400, 'Спочатку купіть цей ефект.');
    await this.store.updateUser(u.id, { captureFx: id });
    return this.profileOf(u.id);
  }

  private rankedBot(u: UserRow): number {
    return u.role === 'admin' && u.botOverride >= 0 ? u.botOverride : BOT_LEAGUES[leagueIndex('bot', u.botTrophies)].botLevel!;
  }

  // ── Ladders ──

  private ladderState(u: UserRow, ladder: Ladder) {
    const today = this.today();
    return ladder === 'bot'
      ? { trophies: u.botTrophies, best: Math.max(u.botBest, u.botTrophies), cycle: u.botCycle, packs: u.botPacksDay === today ? u.botPacksToday : 0 }
      : { trophies: u.trophies, best: Math.max(u.bestTrophies, u.trophies), cycle: u.cycle, packs: u.packsDay === today ? u.packsToday : 0 };
  }

  private ladderView(u: UserRow, ladder: Ladder): LadderView {
    const st = this.ladderState(u, ladder);
    const i = leagueIndex(ladder, st.trophies);
    const next = LEAGUES[ladder][i + 1];
    return {
      trophies: st.trophies,
      best: st.best,
      league: i,
      leagueName: LEAGUES[ladder][i].name,
      next: next ? { index: i + 1, name: next.name, minTrophies: next.minTrophies, reward: next.reward } : null,
      packsToday: st.packs,
      packsLimit: LADDER_PACK_LIMIT[ladder],
      nextPack: ladderReward(ladder, st.cycle),
      winGold: LADDER_WIN_GOLD[ladder],
      win: LADDER_TROPHIES[ladder].win,
      loss: LADDER_TROPHIES[ladder].loss,
    };
  }

  /** Highest league already paid for; before this feature, the best one reached so far. */
  private rewardedLeague(u: UserRow, ladder: Ladder): number {
    try {
      const r = JSON.parse(u.leagueRewards || '{}') as Partial<Record<Ladder, number>>;
      if (typeof r[ladder] === 'number') return r[ladder]!;
    } catch {
      // fall through
    }
    return leagueIndex(ladder, this.ladderState(u, ladder).best);
  }

  /** Apply one ladder game's outcome: trophies, gold, the win pack and league bonuses. */
  private async settleLadder(userId: string, ladder: Ladder, outcome: 'win' | 'loss' | 'draw', source: string): Promise<LadderResult> {
    const u = (await this.store.getUser(userId))!;
    const st = this.ladderState(u, ladder);
    const t = LADDER_TROPHIES[ladder];
    const trophiesDelta = Math.max(-st.trophies, outcome === 'win' ? t.win : outcome === 'loss' ? t.loss : t.draw);
    const trophies = st.trophies + trophiesDelta;
    const patch: Partial<UserRow> = {
      wins: u.wins + (outcome === 'win' ? 1 : 0),
      losses: u.losses + (outcome === 'loss' ? 1 : 0),
      draws: u.draws + (outcome === 'draw' ? 1 : 0),
    };
    if (ladder === 'bot') Object.assign(patch, { botTrophies: trophies, botBest: Math.max(st.best, trophies) });
    else Object.assign(patch, { trophies, bestTrophies: Math.max(st.best, trophies) });

    let gold = u.gold;
    let goldDelta = 0;
    let reward: PackView | null = null;
    let rewardSkipped = false;
    if (outcome === 'win') {
      goldDelta = LADDER_WIN_GOLD[ladder];
      gold += goldDelta;
      if (st.packs < LADDER_PACK_LIMIT[ladder]) {
        reward = this.view(await this.createPack(u.id, ladderReward(ladder, st.cycle), source));
        const today = this.today();
        if (ladder === 'bot') Object.assign(patch, { botCycle: st.cycle + 1, botPacksToday: st.packs + 1, botPacksDay: today });
        else Object.assign(patch, { cycle: st.cycle + 1, packsToday: st.packs + 1, packsDay: today });
      } else {
        rewardSkipped = true;
      }
    }

    // A league reached for the first time pays its bonus once.
    const leagueUps: LeagueUp[] = [];
    const reached = leagueIndex(ladder, trophies);
    const paid = this.rewardedLeague(u, ladder);
    for (let i = paid + 1; i <= reached; i++) {
      const l = LEAGUES[ladder][i];
      gold += l.reward.gold;
      const pack = l.reward.pack ? this.view(await this.createPack(u.id, l.reward.pack, `Нова ліга: ${l.name}`)) : null;
      leagueUps.push({ ladder, name: l.name, gold: l.reward.gold, pack });
    }
    if (reached > paid) {
      let r: Record<string, number> = {};
      try {
        r = JSON.parse(u.leagueRewards || '{}');
      } catch {
        r = {};
      }
      patch.leagueRewards = JSON.stringify({ ...r, [ladder]: reached });
    }
    patch.gold = gold;
    await this.store.updateUser(u.id, patch);
    return { ladder, trophiesDelta, goldDelta, reward, rewardSkipped, leagueUps };
  }

  // ── Trials ──

  private trialRuns(u: UserRow): Record<string, TrialRun> {
    try {
      return JSON.parse(u.trials || '{}');
    } catch {
      return {};
    }
  }

  private async saveRun(u: UserRow, run: TrialRun): Promise<void> {
    const fresh = (await this.store.getUser(u.id))!;
    await this.store.updateUser(u.id, { trials: JSON.stringify({ ...this.trialRuns(fresh), [run.id]: run }) });
  }

  /** Count one game of a trial run; a win of the last round pays the prize. */
  private async trialStep(userId: string, t: Trial, outcome: 'win' | 'loss' | 'draw'): Promise<TrialResult> {
    const u = (await this.store.getUser(userId))!;
    const run = this.trialRuns(u)[t.id];
    const wins = outcome === 'win' ? run.wins + 1 : run.wins;
    const status: TrialRun['status'] = outcome !== 'win' ? 'lost' : wins >= t.opponents.length ? 'won' : 'active';
    let reward: PackView | null = null;
    let card: string | null = null;
    if (status === 'won') {
      if (t.rewardCard && !(await this.ownedSet(userId)).has(t.rewardCard)) {
        await this.store.addCard(userId, t.rewardCard);
        card = t.rewardCard;
      } else {
        reward = this.view(await this.createPack(userId, t.reward, `Нагорода: ${t.name}`));
      }
    }
    await this.saveRun(u, { id: t.id, wins, status });
    return { name: t.name, wins, rounds: t.opponents.length, status, reward, card };
  }

  /** Pay the entry fee and start a fresh run. */
  async enterTrial(token: string, id: string): Promise<Profile> {
    const u = await this.auth(token);
    const t = trialById(id);
    if (!t) throw new ApiError(404, 'Такого випробування немає.');
    if (this.trialRuns(u)[id]?.status === 'active') throw new ApiError(409, 'Ви вже проходите це випробування.');
    if (u.shards < t.cost) throw new ApiError(400, `Вхід коштує ${t.cost} осколків, у вас ${u.shards}.`);
    await this.store.updateUser(u.id, { shards: u.shards - t.cost });
    await this.saveRun(u, { id, wins: 0, status: 'active' });
    return this.profileOf(u.id);
  }

  /** Admin testing: pick the ranked bot's level (null = by arena). */
  async setBotOverride(token: string, level: number | null): Promise<Profile> {
    const u = await this.admin(token);
    await this.store.updateUser(u.id, { botOverride: level === null ? -1 : Math.max(0, Math.min(BOT_LEVELS.length - 1, Math.round(level))) });
    return this.profileOf(u.id);
  }

  private today(): string {
    return new Date(this.now()).toISOString().slice(0, 10);
  }

  private themesOf(u: UserRow): string[] {
    let bought: string[] = [];
    try {
      bought = JSON.parse(u.themes || '[]');
    } catch {
      bought = [];
    }
    return BOARD_THEMES.filter((t) => t.price === 0 || bought.includes(t.id)).map((t) => t.id);
  }

  async me(token: string): Promise<Profile> {
    return this.profileOf((await this.auth(token)).id);
  }

  // ── Collection & packs ──

  async collection(token: string): Promise<Collection> {
    const u = await this.auth(token);
    await this.settleDupes(u.id);
    const owned: Collection['owned'] = {};
    for (const c of await this.store.listCards(u.id)) owned[c.cardId] = { dupes: c.dupes };
    return { owned };
  }

  /** Turn every stored duplicate into shards. Returns the shards added. */
  private async settleDupes(userId: string): Promise<number> {
    let gained = 0;
    for (const c of await this.store.listCards(userId)) {
      if (c.dupes <= 0) continue;
      gained += c.dupes * SHARDS_PER_DUPE[CARD_BY_ID[c.cardId]?.rarity ?? 'common'];
      await this.store.setDupes(userId, c.cardId, 0);
    }
    if (gained) {
      const u = (await this.store.getUser(userId))!;
      await this.store.updateUser(userId, { shards: u.shards + gained });
    }
    return gained;
  }

  private async giveStarter(user: UserRow): Promise<void> {
    if (user.starterGiven) return;
    await this.store.updateUser(user.id, { starterGiven: true });
    await this.createPack(user.id, 'starter', 'Реєстрація');
  }

  private async createPack(userId: string, type: PackType, source: string): Promise<PackRow> {
    const p: PackRow = {
      id: randomId(8),
      userId,
      type,
      slot: false,
      status: 'ready',
      unlockAt: null,
      source,
      createdAt: this.now(),
      openedAt: null,
      result: null,
    };
    await this.store.insertPack(p);
    return p;
  }

  private view(p: PackRow): PackView {
    return { id: p.id, type: p.type, name: packName(p.type), source: p.source };
  }

  async packs(token: string): Promise<PackView[]> {
    const u = await this.auth(token);
    const list = (await this.store.listPacks(u.id)).filter((p) => p.status !== 'opened');
    // Packs from the old timer system are simply ready now.
    for (const p of list) {
      if (p.status !== 'ready') {
        await this.store.updatePack(p.id, { status: 'ready', slot: false });
        p.status = 'ready';
      }
    }
    return list.sort((a, b) => a.createdAt - b.createdAt).map((p) => this.view(p));
  }

  async openPack(token: string, packId: string): Promise<OpenResult> {
    const u = await this.auth(token);
    await this.packs(token); // settle legacy packs
    const p = await this.store.getPack(packId);
    if (!p || p.userId !== u.id) throw new ApiError(404, 'Пак не знайдено.');
    if (!(await this.store.claimPack(p.id, u.id, this.now()))) throw new ApiError(409, 'Цей пак уже відкрито.');
    const ids = rollPack(p.type, this.rng);
    const cards: OpenResult['cards'] = [];
    for (const id of ids) {
      const isNew = await this.store.addCard(u.id, id);
      cards.push({ cardId: id, isNew, shards: isNew ? 0 : SHARDS_PER_DUPE[CARD_BY_ID[id].rarity] });
    }
    await this.store.updatePack(p.id, { result: JSON.stringify(ids) });
    const shards = await this.settleDupes(u.id);
    const gold = packGold(p.type);
    const fresh = (await this.store.getUser(u.id))!;
    await this.store.updateUser(u.id, { gold: fresh.gold + gold });
    if (p.type === 'starter') await this.ensureStarterDeck(u.id);
    else await this.questEvent(u.id, ['openPack']);
    return { pack: this.view(p), cards, gold, shards };
  }

  // ── Shop ──

  /** Today's boards and capture effects (the same for everyone, new every UTC day). */
  async shop(token: string): Promise<ShopOffer> {
    await this.auth(token);
    return shopOffer(this.now());
  }

  /** Buy a pack for shards; it lands with the other ready packs. */
  async buyPack(token: string, type: PackType): Promise<{ pack: PackView; profile: Profile }> {
    const u = await this.auth(token);
    if (type === 'starter' || !(type in PACK_SHARD_PRICE)) throw new ApiError(400, 'Такого паку в магазині немає.');
    const price = PACK_SHARD_PRICE[type];
    if (u.shards < price) throw new ApiError(400, `Потрібно ${price} осколків, у вас ${u.shards}.`);
    await this.store.updateUser(u.id, { shards: u.shards - price });
    const pack = this.view(await this.createPack(u.id, type, 'Магазин'));
    return { pack, profile: await this.profileOf(u.id) };
  }

  /** Buy a board theme for gold and put it on. */
  async buyTheme(token: string, id: string): Promise<Profile> {
    const u = await this.auth(token);
    const theme = BOARD_THEMES.find((t) => t.id === id);
    if (!theme) throw new ApiError(404, 'Такої дошки немає.');
    const owned = this.themesOf(u);
    if (owned.includes(id)) throw new ApiError(409, 'Ця дошка вже ваша.');
    if (!shopOffer(this.now()).themes.includes(id)) throw new ApiError(400, 'Цієї дошки сьогодні немає в магазині — вона повернеться в інший день.');
    if (u.gold < theme.price) throw new ApiError(400, `Потрібно ${theme.price} золота, у вас ${u.gold}.`);
    const bought = owned.filter((t) => themeById(t).price > 0).concat(id);
    await this.store.updateUser(u.id, { gold: u.gold - theme.price, themes: JSON.stringify(bought), boardTheme: id });
    return this.profileOf(u.id);
  }

  async setBoardTheme(token: string, id: string): Promise<Profile> {
    const u = await this.auth(token);
    if (!this.themesOf(u).includes(id)) throw new ApiError(400, 'Спочатку купіть цю дошку.');
    await this.store.updateUser(u.id, { boardTheme: id });
    return this.profileOf(u.id);
  }

  // ── Decks ──

  private async ownedSet(userId: string): Promise<Set<string>> {
    return new Set((await this.store.listCards(userId)).map((c) => c.cardId));
  }

  private async ensureStarterDeck(userId: string): Promise<void> {
    if ((await this.store.listDecks(userId)).length) return;
    const owned = await this.ownedSet(userId);
    const of = (t: PieceType) => CARDS.find((c) => c.pieceType === t && owned.has(c.id))?.id;
    const deck = classicDeck(randomId(8), 'Стартова колода');
    deck.pawnVersions = [of('pawn')!];
    for (const s of DECK_SLOTS) (deck as unknown as Record<string, string>)[s.key] = of(s.type)!;
    await this.store.upsertDeck({ id: deck.id, userId, deck, updatedAt: this.now() });
    await this.store.updateUser(userId, { activeDeckId: deck.id });
  }

  async decks(token: string): Promise<Deck[]> {
    const u = await this.auth(token);
    return (await this.store.listDecks(u.id)).sort((a, b) => a.updatedAt - b.updatedAt).map((d) => d.deck);
  }

  async saveDeck(token: string, deck: Deck): Promise<Deck[]> {
    const u = await this.auth(token);
    const errors = validateDeck(deck);
    if (errors.length) throw new ApiError(400, errors[0]);
    const owned = await this.ownedSet(u.id);
    const missing = deckPositions(deck).find((id) => !owned.has(id));
    if (missing) throw new ApiError(400, `Картки «${CARD_BY_ID[missing].name}» ще немає у вашій колекції.`);
    const existing = await this.store.listDecks(u.id);
    if (!existing.some((d) => d.id === deck.id) && existing.length >= 10) throw new ApiError(400, 'Можна мати до 10 колод.');
    await this.store.upsertDeck({ id: deck.id, userId: u.id, deck, updatedAt: this.now() });
    if (!u.activeDeckId) await this.store.updateUser(u.id, { activeDeckId: deck.id });
    return this.decks(token);
  }

  async deleteDeck(token: string, id: string): Promise<Deck[]> {
    const u = await this.auth(token);
    const list = await this.store.listDecks(u.id);
    if (list.length <= 1) throw new ApiError(400, 'Остання колода потрібна для гри.');
    await this.store.deleteDeck(u.id, id);
    if (u.activeDeckId === id) {
      const rest = list.filter((d) => d.id !== id);
      await this.store.updateUser(u.id, { activeDeckId: rest[0]?.id ?? null });
    }
    return this.decks(token);
  }

  async setActiveDeck(token: string, id: string): Promise<Profile> {
    const u = await this.auth(token);
    if (!(await this.store.listDecks(u.id)).some((d) => d.id === id)) throw new ApiError(404, 'Колоду не знайдено.');
    await this.store.updateUser(u.id, { activeDeckId: id });
    return this.profileOf(u.id);
  }

  // ── Matches ──

  private botDeck(maxRarity: Rarity): Deck {
    const cap = RARITIES.indexOf(maxRarity);
    for (let tries = 0; tries < 50; tries++) {
      const pickFor = (t: PieceType) => {
        const pool = CARDS.filter((c) => c.pieceType === t && !c.trialOnly && RARITIES.indexOf(c.rarity) <= cap);
        return pool[Math.floor(this.rng() * pool.length)].id;
      };
      const deck = classicDeck('bot', 'Колода бота');
      const a = pickFor('pawn');
      const b = pickFor('pawn');
      deck.pawnVersions = a === b ? [a] : [a, b];
      deck.pawnFormation = ['11112222', '22221111', '12121212', '21212121'][Math.floor(this.rng() * 4)];
      for (const s of DECK_SLOTS) (deck as unknown as Record<string, string>)[s.key] = pickFor(s.type);
      if (!validateDeck(deck).length) return deck;
    }
    return classicDeck('bot', 'Колода бота');
  }

  async startMatch(token: string, opts: { deckId?: string; ranked: boolean; level?: number; trial?: string }): Promise<MatchStart> {
    const u = await this.auth(token);
    let playerDeck: Deck;
    let botDeck: Deck;
    let botLevel: number;
    let mode: string;
    let trialInfo: MatchStart['trial'];
    if (opts.trial) {
      const t = trialById(opts.trial);
      if (!t) throw new ApiError(404, 'Такого випробування немає.');
      if (t.kind === 'pvp') throw new ApiError(400, 'Це випробування проходиться в лізі гравців: шукайте суперника на головній.');
      const run = this.trialRuns(u)[t.id];
      if (!run || run.status !== 'active') throw new ApiError(400, 'Спершу оплатіть вхід у випробування.');
      if (run.matchId) {
        // An unfinished trial game goes on where it stopped: no restarting a bad game.
        const old = await this.store.getMatch(run.matchId);
        if (old && old.status === 'active') return this.matchStart(old);
      }
      playerDeck = t.classic ? classicDeck('trial', 'Класична колода') : await this.playableDeck(u.id, opts.deckId);
      botDeck = t.classic ? classicDeck('bot', 'Класична колода') : this.botDeck(t.botMaxRarity ?? 'legendary');
      botLevel = t.opponents[run.wins];
      mode = `trial:${t.id}`;
      trialInfo = { id: t.id, name: t.name, round: run.wins + 1, rounds: t.opponents.length };
    } else {
      if (opts.ranked) {
        // An unfinished bot-ladder game goes on: leaving a lost game must not save the trophies.
        const open = (await this.store.listMatches(u.id, 20)).find((x) => x.status === 'active' && this.modeOf(x) === 'bot');
        if (open) return this.matchStart(open);
      }
      const decks = await this.store.listDecks(u.id);
      const d = decks.find((x) => x.id === (opts.deckId ?? u.activeDeckId)) ?? decks[0];
      if (!d) throw new ApiError(400, 'Спочатку зберіть колоду.');
      const owned = await this.ownedSet(u.id);
      if (deckPositions(d.deck).some((id) => !owned.has(id))) throw new ApiError(400, 'У колоді є картки, яких немає в колекції.');
      playerDeck = d.deck;
      const league = BOT_LEAGUES[leagueIndex('bot', u.botTrophies)];
      botLevel = opts.ranked ? this.rankedBot(u) : Math.max(0, Math.min(BOT_LEVELS.length - 1, opts.level ?? 2));
      botDeck = opts.ranked ? this.botDeck(league.botMaxRarity!) : classicDeck('bot', 'Класична колода');
      mode = opts.ranked ? 'bot' : 'training';
    }
    const m: MatchRow = {
      id: randomId(8),
      userId: u.id,
      ranked: mode === 'bot',
      mode,
      color: (this.rng() < 0.5 ? 'w' : 'b') as Color,
      botLevel,
      playerDeck,
      botDeck,
      status: 'active',
      result: null,
      createdAt: this.now(),
      actions: [],
    };
    await this.store.insertMatch(m);
    if (opts.trial) await this.saveRun(u, { ...this.trialRuns(u)[opts.trial], matchId: m.id });
    return { ...(await this.matchStart(m)), trial: trialInfo };
  }

  private async matchStart(m: MatchRow): Promise<MatchStart> {
    const mode = this.modeOf(m);
    let trial: MatchStart['trial'];
    if (mode.startsWith('trial:')) {
      const t = trialById(mode.slice(6));
      const u = await this.store.getUser(m.userId);
      const run = u && t ? this.trialRuns(u)[t.id] : undefined;
      if (t && run) trial = { id: t.id, name: t.name, round: run.wins + 1, rounds: t.opponents.length };
    }
    return {
      matchId: m.id,
      ranked: m.ranked,
      actions: m.actions,
      color: m.color,
      botLevel: m.botLevel,
      playerDeck: m.playerDeck,
      botDeck: m.botDeck,
      ...(trial ? { trial } : {}),
    };
  }

  private modeOf(m: MatchRow): string {
    return m.mode || (m.ranked ? 'bot' : 'training');
  }

  private replayMatch(m: MatchRow): MatchState {
    let state = m.color === 'w' ? createMatch(m.playerDeck, m.botDeck) : createMatch(m.botDeck, m.playerDeck);
    for (const a of m.actions) state = performAction(state, a);
    return state;
  }

  /** One bot turn, checked like any other move; a broken answer falls back to a plain legal move. */
  private async botTurn(state: MatchState, color: Color, level: number): Promise<{ state: MatchState; actions: Action[] }> {
    let next = state;
    const played: Action[] = [];
    try {
      const turn = await this.bot(state, color, botLevel(level).opts);
      for (const a of turn.actions) {
        next = performAction(next, a);
        played.push(a);
      }
      if (next.turn === color && !next.result && !next.pending.some((p) => p.color !== color)) throw new Error('Bot did not finish its turn');
    } catch (err) {
      // Visible in the server log: a silent fallback would hide a broken bot.
      console.warn('Bot turn failed, playing a fallback move:', err instanceof Error ? err.message : err);
      next = state;
      played.length = 0;
      const pc = next.pending.find((p) => p.color === color);
      if (pc) {
        const a: Action = { type: 'choose', square: pc.options[0] };
        next = performAction(next, a);
        played.push(a);
      }
      const move = legalMoves(next)[0];
      if (move && !next.result) {
        const a: Action = { type: 'move', move };
        next = performAction(next, a);
        played.push(a);
      }
    }
    return { state: next, actions: played };
  }

  /**
   * Play one of the player's actions in a bot game and answer with the bot's.
   * The server keeps the record and plays the bot itself, so the player
   * cannot make the bot lose. `action: null` only lets the bot move (it starts
   * as white, or the game was resumed). If `expected` (the number of actions
   * the client has) is out of date, nothing is played and the client gets the
   * record to catch up with.
   */
  async matchAction(token: string, matchId: string, action: Action | null, expected: number): Promise<{ actions: Action[] }> {
    const u = await this.auth(token);
    const m = await this.store.getMatch(matchId);
    if (!m || m.userId !== u.id) throw new ApiError(404, 'Матч не знайдено.');
    if (expected !== m.actions.length || m.status !== 'active') return { actions: m.actions };
    if (m.actions.length > 3000) throw new ApiError(400, 'Забагато ходів.');
    let state = this.replayMatch(m);
    const actions = [...m.actions];
    const botColor: Color = m.color === 'w' ? 'b' : 'w';
    if (action) {
      if (state.result) throw new ApiError(409, 'Партію завершено.');
      if (state.turn !== m.color) throw new ApiError(409, 'Зараз хід бота.');
      try {
        state = performAction(state, action);
      } catch {
        throw new ApiError(400, 'Такий хід неможливий.');
      }
      actions.push(action);
    }
    // The bot answers until it is the player's turn again (or the game is over).
    for (let guard = 0; guard < 4 && !state.result && state.turn === botColor; guard++) {
      const r = await this.botTurn(state, botColor, m.botLevel);
      if (!r.actions.length) break;
      state = r.state;
      actions.push(...r.actions);
    }
    if (actions.length !== m.actions.length) {
      // Another request on this game got there first: send the stored record instead.
      if (!(await this.store.updateMatch(m.id, { actions }, m.actions.length))) {
        return { actions: (await this.store.getMatch(m.id))!.actions };
      }
    }
    return { actions };
  }

  /**
   * Finish a match. The result comes from the server's own record of the game
   * (the player's moves it checked and the bot's moves it played).
   */
  async finishMatch(token: string, matchId: string, resigned: boolean): Promise<MatchFinish> {
    const u = await this.auth(token);
    const m = await this.store.getMatch(matchId);
    if (!m || m.userId !== u.id) throw new ApiError(404, 'Матч не знайдено.');
    if (m.status !== 'active') throw new ApiError(409, 'Матч уже завершено.');
    let state: MatchState;
    try {
      state = this.replayMatch(m);
    } catch {
      throw new ApiError(400, 'Запис партії не пройшов перевірку правил.');
    }
    if (!state.result) {
      if (!resigned) throw new ApiError(400, 'Партія ще не завершена.');
      state = resign(state, m.color);
    }
    const winner = state.result!.winner;
    const outcome: MatchFinish['outcome'] = winner === null ? 'draw' : winner === m.color ? 'win' : 'loss';
    const mode = this.modeOf(m);

    let ladder: LadderResult | null = null;
    let trial: MatchFinish['trial'] = null;
    if (mode === 'bot') {
      ladder = await this.settleLadder(u.id, 'bot', outcome, 'Перемога в лізі ботів');
    } else if (mode.startsWith('trial:')) {
      const t = trialById(mode.slice(6));
      const run = this.trialRuns(u)[mode.slice(6)];
      if (t && run && run.status === 'active' && run.matchId === m.id) trial = await this.trialStep(u.id, t, outcome);
    }
    const events: QuestEvent[] = ['play'];
    if (outcome === 'win') events.push('win');
    if (outcome === 'win' && mode === 'bot') events.push('winRanked');
    await this.questEvent(u.id, events);
    await this.store.updateMatch(m.id, {
      status: 'finished',
      result: JSON.stringify({ outcome, reason: state.result!.reason, moves: state.result!.moves, trophiesDelta: ladder?.trophiesDelta ?? 0 }),
    });
    return {
      outcome,
      reason: state.result!.reason,
      trophiesDelta: ladder?.trophiesDelta ?? 0,
      goldDelta: ladder?.goldDelta ?? 0,
      reward: ladder?.reward ?? null,
      rewardSkipped: ladder?.rewardSkipped ?? false,
      leagueUps: ladder?.leagueUps ?? [],
      ladder: ladder ? 'bot' : null,
      trial,
      profile: await this.profileOf(u.id),
    };
  }

  async leaderboard(): Promise<LeaderRow[]> {
    // Top 50 of each ladder (the page sorts by the one it shows).
    const all = (await this.store.listUsers(1000)).filter((u) => u.passHash);
    const top = (key: (u: UserRow) => number) => [...all].sort((a, b) => key(b) - key(a) || b.wins - a.wins).slice(0, 50);
    const picked = new Map([...top((u) => u.trophies), ...top((u) => u.botTrophies)].map((u) => [u.id, u]));
    return [...picked.values()]
      .map((u) => ({
        id: u.id,
        name: u.name,
        tag: tagOf(u),
        avatar: u.avatar,
        trophies: u.trophies,
        wins: u.wins,
        arena: PVP_LEAGUES[leagueIndex('pvp', u.trophies)].name,
        botTrophies: u.botTrophies,
        botLeague: BOT_LEAGUES[leagueIndex('bot', u.botTrophies)].name,
      }));
  }

  // ── Profile ──

  async updateProfile(token: string, patch: { name?: string; avatar?: string }): Promise<Profile> {
    const u = await this.auth(token);
    const next: Partial<UserRow> = {};
    if (patch.name !== undefined) {
      const name = patch.name.trim();
      if (!name || name.length > 24) throw new ApiError(400, 'Нікнейм — від 1 до 24 символів.');
      next.name = name;
    }
    if (patch.avatar !== undefined) {
      if (!(await this.ownedSet(u.id)).has(patch.avatar)) throw new ApiError(400, 'Аватаром може бути лише ваша картка.');
      next.avatar = patch.avatar;
    }
    await this.store.updateUser(u.id, next);
    return this.profileOf(u.id);
  }

  private card(u: UserRow): PlayerCard {
    return {
      id: u.id,
      name: u.name,
      tag: tagOf(u),
      avatar: u.avatar,
      trophies: u.trophies,
      arena: PVP_LEAGUES[leagueIndex('pvp', u.trophies)].name,
      online: this.now() - u.lastSeen < ONLINE_MS,
      lastSeen: u.lastSeen,
    };
  }

  private async cardOf(id: string): Promise<PlayerCard> {
    const u = await this.store.getUser(id);
    if (!u) return { id, name: 'Гравець', tag: '', avatar: 'pawn-classic', trophies: 0, arena: '', online: false, lastSeen: 0 };
    return this.card(u);
  }

  async playerProfile(token: string, userId: string): Promise<PublicProfile> {
    const me = await this.auth(token);
    const u = await this.store.getUser(userId);
    if (!u || !u.passHash) throw new ApiError(404, 'Гравця не знайдено.');
    const link = (await this.store.listFriends(me.id)).find((f) => f.fromId === userId || f.toId === userId);
    const relation: PublicProfile['relation'] =
      me.id === userId ? 'self' : !link ? 'none' : link.status === 'accepted' ? 'friend' : link.fromId === me.id ? 'outgoing' : 'incoming';
    return {
      ...this.card(u),
      wins: u.wins,
      losses: u.losses,
      draws: u.draws,
      bestTrophies: Math.max(u.bestTrophies, u.trophies),
      cards: (await this.store.listCards(u.id)).length,
      createdAt: u.createdAt,
      relation,
    };
  }

  async history(token: string): Promise<HistoryRow[]> {
    const u = await this.auth(token);
    const out: HistoryRow[] = [];
    for (const m of await this.store.listMatches(u.id, 60)) {
      if (m.status !== 'finished' || !m.result) continue;
      const r = JSON.parse(m.result);
      out.push({
        id: m.id,
        kind: this.modeOf(m) === 'bot' ? 'bot' : this.modeOf(m).startsWith('trial:') ? 'trial' : 'training',
        opponent: `Бот · ${botLevel(m.botLevel).name}`,
        outcome: r.outcome,
        reason: r.reason,
        moves: r.moves,
        trophiesDelta: r.trophiesDelta ?? 0,
        at: m.createdAt,
      });
    }
    for (const p of await this.store.listPvp(u.id, 60)) {
      if (p.status !== 'finished' || !p.result) continue;
      const r = JSON.parse(p.result) as { winner: Color | null; reason: string; moves: number };
      const color: Color = p.whiteId === u.id ? 'w' : 'b';
      const opp = await this.store.getUser(color === 'w' ? p.blackId : p.whiteId);
      out.push({
        id: p.id,
        kind: p.ranked ? 'ranked' : 'friend',
        opponent: opp?.name ?? 'Гравець',
        outcome: r.winner === null ? 'draw' : r.winner === color ? 'win' : 'loss',
        reason: r.reason,
        moves: r.moves,
        trophiesDelta: 0,
        at: p.updatedAt,
      });
    }
    return out.sort((a, b) => b.at - a.at).slice(0, 50);
  }

  // ── Friends ──

  async searchPlayers(token: string, query: string): Promise<PlayerCard[]> {
    const me = await this.auth(token);
    const q = query.trim().replace(/^#/, '').toLowerCase();
    if (q.length < 2) return [];
    return (await this.store.listUsers(2000))
      .filter((u) => u.passHash && u.id !== me.id && (u.name.toLowerCase().includes(q) || tagOf(u).toLowerCase() === q))
      .slice(0, 20)
      .map((u) => this.card(u));
  }

  async friends(token: string): Promise<FriendsView> {
    const me = await this.auth(token);
    const view: FriendsView = { friends: [], incoming: [], outgoing: [] };
    for (const f of await this.store.listFriends(me.id)) {
      const other = f.fromId === me.id ? f.toId : f.fromId;
      const entry = { ...(await this.cardOf(other)), linkId: f.id };
      if (f.status === 'accepted') view.friends.push(entry);
      else if (f.toId === me.id) view.incoming.push(entry);
      else view.outgoing.push(entry);
    }
    view.friends.sort((a, b) => Number(b.online) - Number(a.online) || b.trophies - a.trophies);
    return view;
  }

  async addFriend(token: string, userId: string): Promise<FriendsView> {
    const me = await this.auth(token);
    if (userId === me.id) throw new ApiError(400, 'Це ви.');
    const other = await this.store.getUser(userId);
    if (!other || !other.passHash) throw new ApiError(404, 'Гравця не знайдено.');
    const link = (await this.store.listFriends(me.id)).find((f) => f.fromId === userId || f.toId === userId);
    if (link?.status === 'accepted') throw new ApiError(409, 'Ви вже друзі.');
    if (link && link.fromId === me.id) throw new ApiError(409, 'Заявку вже надіслано.');
    // They asked first: adding them back accepts the request.
    if (link) await this.store.updateFriend(link.id, { status: 'accepted' });
    else await this.store.insertFriend({ id: randomId(8), fromId: me.id, toId: userId, status: 'pending', createdAt: this.now() });
    return this.friends(token);
  }

  async respondFriend(token: string, linkId: string, accept: boolean): Promise<FriendsView> {
    const me = await this.auth(token);
    const link = (await this.store.listFriends(me.id)).find((f) => f.id === linkId);
    if (!link || link.toId !== me.id || link.status !== 'pending') throw new ApiError(404, 'Заявку не знайдено.');
    if (accept) await this.store.updateFriend(link.id, { status: 'accepted' });
    else await this.store.deleteFriend(link.id);
    return this.friends(token);
  }

  /** Remove a friend, or withdraw a request you sent. */
  async removeFriend(token: string, linkId: string): Promise<FriendsView> {
    const me = await this.auth(token);
    const link = (await this.store.listFriends(me.id)).find((f) => f.id === linkId);
    if (!link) throw new ApiError(404, 'Не знайдено.');
    await this.store.deleteFriend(link.id);
    return this.friends(token);
  }

  // ── Friend matches ──

  private async playableDeck(userId: string, deckId?: string | null): Promise<Deck> {
    const u = (await this.store.getUser(userId))!;
    const decks = await this.store.listDecks(userId);
    const d = decks.find((x) => x.id === (deckId ?? u.activeDeckId)) ?? decks[0];
    if (!d) throw new ApiError(400, 'Спочатку зберіть колоду.');
    if (validateDeck(d.deck).length) throw new ApiError(400, 'Колода не відповідає правилам.');
    const owned = await this.ownedSet(userId);
    if (deckPositions(d.deck).some((id) => !owned.has(id))) throw new ApiError(400, 'У колоді є картки, яких немає в колекції.');
    return d.deck;
  }

  private async areFriends(a: string, b: string): Promise<boolean> {
    return (await this.store.listFriends(a)).some((f) => f.status === 'accepted' && (f.fromId === b || f.toId === b));
  }

  async challenges(token: string): Promise<{ incoming: ChallengeView[]; outgoing: ChallengeView[]; games: PvpSummary[] }> {
    const me = await this.auth(token);
    const incoming: ChallengeView[] = [];
    const outgoing: ChallengeView[] = [];
    for (const c of await this.store.listChallenges(me.id)) {
      if (c.status !== 'pending') continue;
      const v = { id: c.id, from: await this.cardOf(c.fromId), to: await this.cardOf(c.toId), incoming: c.toId === me.id, createdAt: c.createdAt };
      (v.incoming ? incoming : outgoing).push(v);
    }
    const games: PvpSummary[] = [];
    for (const p of await this.store.listPvp(me.id, 30)) {
      const color: Color = p.whiteId === me.id ? 'w' : 'b';
      const state = this.replayPvp(p);
      const r = p.result ? (JSON.parse(p.result) as { winner: Color | null }) : null;
      games.push({
        id: p.id,
        opponent: await this.cardOf(color === 'w' ? p.blackId : p.whiteId),
        color,
        yourTurn: p.status === 'active' && state.turn === color,
        status: p.status,
        outcome: !r ? null : r.winner === null ? 'draw' : r.winner === color ? 'win' : 'loss',
        moves: state.history.length,
        updatedAt: p.updatedAt,
        ranked: !!p.ranked,
      });
    }
    return { incoming, outgoing, games };
  }

  async challengeFriend(token: string, friendId: string, deckId?: string): Promise<void> {
    const me = await this.auth(token);
    if (!(await this.areFriends(me.id, friendId))) throw new ApiError(403, 'Викликати можна лише друзів.');
    const pending = (await this.store.listChallenges(me.id)).find(
      (c) => c.status === 'pending' && ((c.fromId === me.id && c.toId === friendId) || (c.fromId === friendId && c.toId === me.id)),
    );
    if (pending) throw new ApiError(409, pending.fromId === me.id ? 'Виклик уже надіслано.' : 'Цей друг уже викликав вас — прийміть виклик.');
    const deck = await this.playableDeck(me.id, deckId);
    await this.store.insertChallenge({ id: randomId(8), fromId: me.id, toId: friendId, fromDeck: deck, status: 'pending', pvpId: null, createdAt: this.now() });
  }

  async respondChallenge(token: string, id: string, accept: boolean, deckId?: string): Promise<{ pvpId: string | null }> {
    const me = await this.auth(token);
    const c = await this.store.getChallenge(id);
    if (!c || c.status !== 'pending' || (c.toId !== me.id && c.fromId !== me.id)) throw new ApiError(404, 'Виклик не знайдено.');
    if (!accept || c.fromId === me.id) {
      await this.store.updateChallenge(c.id, { status: c.fromId === me.id ? 'cancelled' : 'declined' });
      return { pvpId: null };
    }
    const deck = await this.playableDeck(me.id, deckId);
    const iAmWhite = this.rng() < 0.5;
    const row: PvpRow = {
      id: randomId(8),
      whiteId: iAmWhite ? me.id : c.fromId,
      blackId: iAmWhite ? c.fromId : me.id,
      whiteDeck: iAmWhite ? deck : c.fromDeck,
      blackDeck: iAmWhite ? c.fromDeck : deck,
      actions: '[]',
      status: 'active',
      result: null,
      resignedBy: null,
      ranked: false,
      createdAt: this.now(),
      updatedAt: this.now(),
    };
    await this.store.insertPvp(row);
    await this.store.updateChallenge(c.id, { status: 'accepted', pvpId: row.id });
    return { pvpId: row.id };
  }

  private replayPvp(p: PvpRow): MatchState {
    let state = createMatch(p.whiteDeck, p.blackDeck);
    for (const a of JSON.parse(p.actions) as Action[]) state = performAction(state, a);
    if (p.resignedBy && !state.result) state = resign(state, p.resignedBy);
    return state;
  }

  private async pvpFor(userId: string, id: string): Promise<{ row: PvpRow; color: Color }> {
    const row = await this.store.getPvp(id);
    if (!row || (row.whiteId !== userId && row.blackId !== userId)) throw new ApiError(404, 'Матч не знайдено.');
    return { row, color: row.whiteId === userId ? 'w' : 'b' };
  }

  private async pvpView(row: PvpRow, color: Color): Promise<PvpState> {
    const w = await this.store.getUser(row.whiteId);
    const b = await this.store.getUser(row.blackId);
    return {
      id: row.id,
      color,
      captureFx: { w: captureFxById(w?.captureFx).id, b: captureFxById(b?.captureFx).id },
      you: await this.cardOf(color === 'w' ? row.whiteId : row.blackId),
      opponent: await this.cardOf(color === 'w' ? row.blackId : row.whiteId),
      whiteDeck: row.whiteDeck,
      blackDeck: row.blackDeck,
      actions: JSON.parse(row.actions),
      status: row.status,
      resignedBy: row.resignedBy,
      ranked: !!row.ranked,
      ladder: row.result ? ((JSON.parse(row.result) as { ladder?: Record<Color, LadderResult> }).ladder?.[color] ?? null) : null,
      trial: row.result ? ((JSON.parse(row.result) as { trial?: Record<Color, TrialResult> }).trial?.[color] ?? null) : null,
      updatedAt: row.updatedAt,
    };
  }

  /** A finished game's result; player-ladder games also settle trophies and rewards for both. */
  private async pvpResult(row: PvpRow, state: MatchState): Promise<string> {
    const winner = state.result!.winner;
    const out: Record<string, unknown> = { winner, reason: state.result!.reason, moves: state.result!.moves };
    if (row.ranked) {
      const ladder: Partial<Record<Color, LadderResult>> = {};
      const trial: Partial<Record<Color, TrialResult>> = {};
      for (const [id, c] of [[row.whiteId, 'w'], [row.blackId, 'b']] as [string, Color][]) {
        const outcome = winner === null ? 'draw' : winner === c ? 'win' : 'loss';
        ladder[c] = await this.settleLadder(id, 'pvp', outcome, 'Перемога в лізі гравців');
        // A player-ladder trial in progress counts this game too.
        for (const t of TRIALS.filter((x) => x.kind === 'pvp')) {
          const u = await this.store.getUser(id);
          if (u && this.trialRuns(u)[t.id]?.status === 'active') trial[c] = await this.trialStep(id, t, outcome);
        }
      }
      out.ladder = ladder;
      out.trial = trial;
    }
    return JSON.stringify(out);
  }

  // ── Player ladder matchmaking ──

  /**
   * Look for a player-ladder opponent. Call it again every couple of seconds
   * while searching: it returns the game as soon as someone is matched.
   */
  async seek(token: string, deckId?: string): Promise<{ pvpId: string | null; searching: number }> {
    const me = await this.auth(token);
    const active = (await this.store.listPvp(me.id, 20)).find((p) => p.ranked && p.status === 'active');
    if (active) {
      await this.store.deleteSeek(me.id);
      return { pvpId: active.id, searching: 0 };
    }
    const deck = await this.playableDeck(me.id, deckId);
    const fresh = (await this.store.listSeeks()).filter((x) => x.userId !== me.id && this.now() - x.updatedAt < SEEK_TTL);
    for (const other of fresh) {
      // Taking the seek is the lock: only one player can remove it.
      if (!(await this.store.deleteSeek(other.userId))) continue;
      await this.store.deleteSeek(me.id);
      const iAmWhite = this.rng() < 0.5;
      const row: PvpRow = {
        id: randomId(8),
        whiteId: iAmWhite ? me.id : other.userId,
        blackId: iAmWhite ? other.userId : me.id,
        whiteDeck: iAmWhite ? deck : other.deck,
        blackDeck: iAmWhite ? other.deck : deck,
        actions: '[]',
        status: 'active',
        result: null,
        resignedBy: null,
        ranked: true,
        createdAt: this.now(),
        updatedAt: this.now(),
      };
      await this.store.insertPvp(row);
      return { pvpId: row.id, searching: 0 };
    }
    await this.store.putSeek({ userId: me.id, deck, updatedAt: this.now() });
    return { pvpId: null, searching: fresh.length };
  }

  async cancelSeek(token: string): Promise<void> {
    const me = await this.auth(token);
    await this.store.deleteSeek(me.id);
  }

  /** The opponent has not moved for too long: take the win. */
  async pvpClaim(token: string, id: string): Promise<PvpState> {
    const me = await this.auth(token);
    const { row, color } = await this.pvpFor(me.id, id);
    if (row.status !== 'active') throw new ApiError(409, 'Партію завершено.');
    if (!row.ranked) throw new ApiError(400, 'У дружніх партіях час не обмежено.');
    const state = this.replayPvp(row);
    if (state.turn === color) throw new ApiError(409, 'Зараз ваш хід.');
    if (this.now() - row.updatedAt < CLAIM_MS) throw new ApiError(409, 'Суперник ще має час на хід.');
    const other: Color = color === 'w' ? 'b' : 'w';
    const done = resign(state, other);
    const patch: Partial<PvpRow> = { status: 'finished', resignedBy: other, updatedAt: this.now(), result: await this.pvpResult(row, done) };
    await this.store.updatePvp(row.id, patch);
    await this.pvpQuests(row, done.result!.winner);
    return this.pvpView({ ...row, ...patch }, color);
  }

  async pvpState(token: string, id: string): Promise<PvpState> {
    const me = await this.auth(token);
    const { row, color } = await this.pvpFor(me.id, id);
    return this.pvpView(row, color);
  }

  /**
   * Play one action in a friend match. The server replays the game and checks
   * that it is this player's turn and the action is legal.
   */
  async pvpAction(token: string, id: string, action: Action, expected: number): Promise<PvpState> {
    const me = await this.auth(token);
    const { row, color } = await this.pvpFor(me.id, id);
    if (row.status !== 'active') throw new ApiError(409, 'Партію завершено.');
    const actions = JSON.parse(row.actions) as Action[];
    if (actions.length !== expected) throw new ApiError(409, 'Позиція змінилась — оновіть партію.');
    const state = this.replayPvp(row);
    if (state.turn !== color) throw new ApiError(409, 'Зараз хід суперника.');
    let next: MatchState;
    try {
      next = performAction(state, action);
    } catch {
      throw new ApiError(400, 'Такий хід неможливий.');
    }
    actions.push(action);
    const patch: Partial<PvpRow> = { actions: JSON.stringify(actions), updatedAt: this.now() };
    if (!(await this.store.updatePvp(row.id, patch, expected))) throw new ApiError(409, 'Позиція змінилась — оновіть партію.');
    if (next.result) {
      // Settle only after the move is written, so a race cannot pay twice.
      const fin: Partial<PvpRow> = { status: 'finished', result: await this.pvpResult(row, next) };
      await this.store.updatePvp(row.id, fin);
      Object.assign(patch, fin);
    }
    if (next.result) await this.pvpQuests(row, next.result.winner);
    return this.pvpView({ ...row, ...patch }, color);
  }

  async pvpResign(token: string, id: string): Promise<PvpState> {
    const me = await this.auth(token);
    const { row, color } = await this.pvpFor(me.id, id);
    if (row.status !== 'active') throw new ApiError(409, 'Партію завершено.');
    const state = resign(this.replayPvp(row), color);
    const patch: Partial<PvpRow> = {
      status: 'finished',
      resignedBy: color,
      updatedAt: this.now(),
      result: await this.pvpResult(row, state),
    };
    await this.store.updatePvp(row.id, patch);
    await this.pvpQuests(row, state.result!.winner);
    return this.pvpView({ ...row, ...patch }, color);
  }

  private async pvpQuests(row: PvpRow, winner: Color | null): Promise<void> {
    for (const [id, c] of [[row.whiteId, 'w'], [row.blackId, 'b']] as [string, Color][]) {
      const kind: QuestEvent[] = row.ranked ? (winner === c ? ['winRanked'] : []) : ['friendGame'];
      await this.questEvent(id, winner === c ? ['play', 'win', ...kind] : ['play', ...kind]);
    }
  }

  // ── Daily quests ──

  private async questEvent(userId: string, events: QuestEvent[]): Promise<void> {
    const u = await this.store.getUser(userId);
    if (!u) return;
    const next = addProgress(parseQuests(u.quests, this.today()), events);
    await this.store.updateUser(userId, { quests: JSON.stringify(next) });
  }

  async claimQuest(token: string, questId: string): Promise<Profile> {
    const u = await this.auth(token);
    const state = parseQuests(u.quests, this.today());
    const q = questViews(state).find((x) => x.id === questId);
    if (!q) throw new ApiError(404, 'Такого завдання сьогодні немає.');
    if (q.claimed) throw new ApiError(409, 'Нагороду вже отримано.');
    if (q.progress < q.target) throw new ApiError(400, 'Завдання ще не виконано.');
    await this.store.updateUser(u.id, {
      quests: JSON.stringify({ ...state, claimed: [...state.claimed, q.id] }),
      gold: u.gold + (q.reward.gold ?? 0),
      shards: u.shards + (q.reward.shards ?? 0),
    });
    return this.profileOf(u.id);
  }

  async inbox(token: string): Promise<Inbox> {
    const me = await this.auth(token);
    const friendRequests = (await this.store.listFriends(me.id)).filter((f) => f.status === 'pending' && f.toId === me.id).length;
    const challenges = (await this.store.listChallenges(me.id)).filter((c) => c.status === 'pending' && c.toId === me.id).length;
    let yourTurn = 0;
    let rankedGame: string | null = null;
    for (const p of await this.store.listPvp(me.id, 30)) {
      if (p.status !== 'active') continue;
      if (p.ranked) rankedGame = p.id;
      else if (this.replayPvp(p).turn === (p.whiteId === me.id ? 'w' : 'b')) yourTurn++;
    }
    return { friendRequests, challenges, yourTurn, rankedGame };
  }

  // ── Admin ──

  async adminUsers(token: string): Promise<AdminUser[]> {
    await this.admin(token);
    const users = await this.store.listUsers(500);
    const out: AdminUser[] = [];
    for (const u of users) {
      out.push({
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        trophies: u.trophies,
        botTrophies: u.botTrophies,
        wins: u.wins,
        losses: u.losses,
        cards: (await this.store.listCards(u.id)).length,
        gold: u.gold,
        shards: u.shards,
        claimed: !!u.passHash,
      });
    }
    return out.sort((a, b) => b.trophies - a.trophies);
  }

  async adminGrantPack(token: string, userId: string, type: PackType): Promise<void> {
    await this.admin(token);
    if (!(await this.store.getUser(userId))) throw new ApiError(404, 'Гравця не знайдено.');
    await this.createPack(userId, type, 'Подарунок адміністратора');
  }

  async adminGrantAllCards(token: string, userId: string): Promise<void> {
    await this.admin(token);
    const owned = await this.ownedSet(userId);
    for (const c of CARDS) if (!owned.has(c.id)) await this.store.addCard(userId, c.id);
  }

  async adminSetTrophies(token: string, userId: string, trophies: number, ladder: Ladder = 'pvp'): Promise<void> {
    await this.admin(token);
    const t = Math.max(0, Math.round(trophies));
    await this.store.updateUser(userId, ladder === 'bot' ? { botTrophies: t } : { trophies: t });
  }

  async adminSetRole(token: string, userId: string, role: Role): Promise<void> {
    const me = await this.admin(token);
    if (me.id === userId && role !== 'admin') throw new ApiError(400, 'Не можна зняти адмінку із себе.');
    await this.store.updateUser(userId, { role });
  }

  async adminGrantCurrency(token: string, userId: string, gold: number, shards: number): Promise<void> {
    await this.admin(token);
    const u = await this.store.getUser(userId);
    if (!u) throw new ApiError(404, 'Гравця не знайдено.');
    await this.store.updateUser(userId, {
      gold: Math.max(0, u.gold + Math.round(gold || 0)),
      shards: Math.max(0, u.shards + Math.round(shards || 0)),
    });
  }
}
