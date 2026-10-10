// Persistence contract for the game service. Implemented by SQLite on the
// server (server/sqliteStore.ts) and by localStorage in the browser demo.

import type { Action } from '../engine/match';
import type { Deck } from '../engine/types';
import type { PackType } from './packs';
import type { PurchaseRow, PurchaseStatus } from './payments';

export type Role = 'player' | 'admin';

export interface UserRow {
  id: string;
  email: string;
  name: string;
  role: Role;
  /** null for a seeded account whose owner has not set a password yet. */
  passHash: string | null;
  trophies: number;
  wins: number;
  losses: number;
  draws: number;
  /** Ranked wins so far (drives the reward cycle). */
  cycle: number;
  starterGiven: boolean;
  activeDeckId: string | null;
  createdAt: number;
  gold: number;
  shards: number;
  /** Board themes bought in the shop (JSON array of ids). */
  themes: string;
  boardTheme: string;
  /** Packs won in ranked matches on `packsDay` (UTC date, YYYY-MM-DD). */
  packsToday: number;
  packsDay: string;
  /** Card id whose art is the avatar. */
  avatar: string;
  bestTrophies: number;
  lastSeen: number;
  /** Daily quest progress (JSON QuestState). */
  quests: string;
  /** Admin testing: ranked bot level override, -1 = by arena. */
  botOverride: number;
  /** Capture effect in use and the ones bought (JSON array of ids). */
  captureFx: string;
  ownedFx: string;
  /** Bot ladder: trophies, record, wins for the reward cycle and packs won today. */
  botTrophies: number;
  botBest: number;
  botCycle: number;
  botPacksToday: number;
  botPacksDay: string;
  /** Bot-ladder wins in a row (a loss or a draw resets it). */
  botStreak: number;
  /** UTC day the free pack of the day was last taken ('' never). */
  freePackDay: string;
  /** Highest league index already rewarded per ladder (JSON {bot, pvp}). */
  leagueRewards: string;
  /** Trial runs by trial id (JSON Record<string, TrialRun>). */
  trials: string;
  /** The owner opened the link sent to this address. */
  emailVerified: boolean;
  /** When the nickname was last changed (0: never). */
  nameChangedAt: number;
  /** The account was deleted: personal data is gone, games stay for the opponents. */
  deleted: boolean;
  /** Banned until this time (0: not banned; BAN_FOREVER in the service: for good). */
  bannedUntil: number;
  /** Why, as the admin wrote it (the player sees it when signing in). */
  banReason: string;
  /** A message the player sees once on their next visit (JSON Notice, '' for none). */
  notice: string;
  /** Achievement counters, feats and claimed rewards (JSON AchievementState). */
  achievements: string;
  /** The plate shown under the name ('' default, '-' none). */
  title: string;
  /** Plates earned besides the owner's (JSON array of ids, e.g. "founder"). */
  plates: string;
  /** Who invited this player (user id, '' none). */
  referredBy: string;
  /** Invite rewards paid: 0 none, 1 at sign-up, 2 after the games too. */
  refStage: number;
  /** Games counted towards the invite's second reward. */
  refGames: number;
  /** The patch notes the player has seen (PATCH_ID; '' none yet). */
  patchSeen: string;
  /** Skins won (JSON array of skin ids) and the one worn per card (JSON {cardId: skinId}). */
  skins: string;
  skinChoice: string;
  /** The weekly league: this week's run, or last week's while its reward waits (JSON WeeklyRun, '' none). */
  weekly: string;
}

export interface SessionRow {
  token: string;
  userId: string;
  expiresAt: number;
}

/** A one-time link sent by e-mail. Only its hash is stored: a leaked database opens nothing. */
export interface TokenRow {
  hash: string;
  userId: string;
  kind: 'reset' | 'verify';
  /** The address the link was sent to (verify: the one it confirms). */
  email: string;
  expiresAt: number;
}

export interface CardRow {
  userId: string;
  cardId: string;
  dupes: number;
}

/** 'locked'/'unlocking' only exist in old data from the timer era; they count as ready. */
export type PackStatus = 'locked' | 'unlocking' | 'ready' | 'opened';

export interface PackRow {
  id: string;
  userId: string;
  type: PackType;
  /** Legacy (reward slots were removed); always false for new packs. */
  slot: boolean;
  status: PackStatus;
  unlockAt: number | null;
  source: string;
  createdAt: number;
  openedAt: number | null;
  /** Card ids revealed when opened (JSON). */
  result: string | null;
}

export interface DeckRow {
  id: string;
  userId: string;
  deck: Deck;
  updatedAt: number;
}

export interface MatchRow {
  id: string;
  userId: string;
  /** A bot-ladder match (trophies and rewards). */
  ranked: boolean;
  /** 'bot' ladder, 'training', or 'trial:<id>'; '' in old rows (use `ranked`). */
  mode: string;
  color: 'w' | 'b';
  botLevel: number;
  playerDeck: Deck;
  botDeck: Deck;
  status: 'active' | 'finished';
  result: string | null;
  createdAt: number;
  /** Every action played so far, both sides (the server plays the bot's). */
  actions: Action[];
}

export interface FriendRow {
  id: string;
  fromId: string;
  toId: string;
  status: 'pending' | 'accepted';
  createdAt: number;
}

export interface ChallengeRow {
  id: string;
  fromId: string;
  toId: string;
  fromDeck: Deck;
  /** 'drafting': a draft accepted and being picked (the game starts when it ends). */
  status: 'pending' | 'drafting' | 'accepted' | 'declined' | 'cancelled';
  pvpId: string | null;
  createdAt: number;
  /** A game on the challenger's deck, or a draft (both decks picked card by card). */
  mode: 'classic' | 'draft';
  /** JSON DraftState while drafting and after ('' for a classic challenge). */
  draft: string;
}

/** A game between two players; the state is rebuilt by replaying `actions`. */
export interface PvpRow {
  id: string;
  whiteId: string;
  blackId: string;
  whiteDeck: Deck;
  blackDeck: Deck;
  /** JSON array of engine actions. */
  actions: string;
  status: 'active' | 'finished';
  /** JSON {winner, reason, moves} once finished. */
  result: string | null;
  resignedBy: 'w' | 'b' | null;
  /** A player-ladder game found by matchmaking (trophies and rewards). */
  ranked: boolean;
  createdAt: number;
  updatedAt: number;
}

/** A player waiting for a player-ladder opponent. */
export interface SeekRow {
  userId: string;
  deck: Deck;
  /** Refreshed while the player keeps searching; stale seeks are ignored. */
  updatedAt: number;
}

export interface Store {
  getUser(id: string): Promise<UserRow | null>;
  getUserByEmail(email: string): Promise<UserRow | null>;
  insertUser(u: UserRow): Promise<void>;
  updateUser(id: string, patch: Partial<UserRow>): Promise<void>;
  listUsers(limit: number): Promise<UserRow[]>;

  insertSession(s: SessionRow): Promise<void>;
  getSession(token: string): Promise<SessionRow | null>;
  deleteSession(token: string): Promise<void>;
  /** Sign the user out everywhere (but on `except`, the session asking). */
  deleteUserSessions(userId: string, except?: string): Promise<void>;

  insertToken(t: TokenRow): Promise<void>;
  /** Remove and return a link token: each link works once. */
  takeToken(hash: string): Promise<TokenRow | null>;
  deleteUserTokens(userId: string, kind?: TokenRow['kind']): Promise<void>;

  listCards(userId: string): Promise<CardRow[]>;
  /** Add a copy: creates the card or adds a duplicate. Returns true if new. */
  addCard(userId: string, cardId: string): Promise<boolean>;
  setDupes(userId: string, cardId: string, dupes: number): Promise<void>;

  listPacks(userId: string): Promise<PackRow[]>;
  getPack(id: string): Promise<PackRow | null>;
  insertPack(p: PackRow): Promise<void>;
  updatePack(id: string, patch: Partial<PackRow>): Promise<void>;
  /** How many packs the user has opened, ever. */
  countOpenedPacks(userId: string): Promise<number>;
  /** Atomically mark a ready pack as opened; false if it was not ready. */
  claimPack(id: string, userId: string, openedAt: number): Promise<boolean>;

  listDecks(userId: string): Promise<DeckRow[]>;
  upsertDeck(d: DeckRow): Promise<void>;
  deleteDeck(userId: string, id: string): Promise<void>;

  insertMatch(m: MatchRow): Promise<void>;
  getMatch(id: string): Promise<MatchRow | null>;
  /** With `expectedActions`, writes only if the stored game has that many actions (false otherwise). */
  updateMatch(id: string, patch: Partial<MatchRow>, expectedActions?: number): Promise<boolean>;
  /** Drop sessions and link tokens that expired before `now`. */
  purgeSessions(now: number): Promise<void>;
  listMatches(userId: string, limit: number): Promise<MatchRow[]>;
  /** Every finished game with the bot since `since` (admin statistics). */
  listFinishedMatches(since: number): Promise<MatchRow[]>;
  /** Every finished game between players, last changed since `since` (admin statistics). */
  listFinishedPvp(since: number): Promise<PvpRow[]>;

  listFriends(userId: string): Promise<FriendRow[]>;
  insertFriend(f: FriendRow): Promise<void>;
  updateFriend(id: string, patch: Partial<FriendRow>): Promise<void>;
  deleteFriend(id: string): Promise<void>;

  listChallenges(userId: string): Promise<ChallengeRow[]>;
  getChallenge(id: string): Promise<ChallengeRow | null>;
  insertChallenge(c: ChallengeRow): Promise<void>;
  updateChallenge(id: string, patch: Partial<ChallengeRow>): Promise<void>;

  listPvp(userId: string, limit: number): Promise<PvpRow[]>;
  getPvp(id: string): Promise<PvpRow | null>;
  insertPvp(p: PvpRow): Promise<void>;
  /** Write `patch` only if the game still has `expectedActions` actions (optimistic lock). */
  updatePvp(id: string, patch: Partial<PvpRow>, expectedActions?: number): Promise<boolean>;

  insertPurchase(p: PurchaseRow): Promise<void>;
  getPurchase(id: string): Promise<PurchaseRow | null>;
  updatePurchase(id: string, patch: Partial<PurchaseRow>): Promise<void>;
  listPurchases(userId: string, limit: number): Promise<PurchaseRow[]>;
  /** Newest first, everyone's (admin). */
  listAllPurchases(limit: number): Promise<PurchaseRow[]>;
  /**
   * In one transaction: move the purchase from `from` to `to` and add
   * `shards` (negative for a refund) to its buyer. False when the purchase
   * was not in `from` any more — someone else settled it first, nothing changed.
   */
  settlePurchase(id: string, from: PurchaseStatus, to: PurchaseStatus, shards: number, now: number): Promise<boolean>;
  /** Drop an entry from the journal (shards stay as they are). */
  deletePurchase(id: string): Promise<void>;

  listSeeks(): Promise<SeekRow[]>;
  putSeek(s: SeekRow): Promise<void>;
  /** Remove a seek; false if it was already gone (someone else took it). */
  deleteSeek(userId: string): Promise<boolean>;
}

export interface Hasher {
  hash(password: string): Promise<string>;
  verify(password: string, hash: string): Promise<boolean>;
}

export function randomId(bytes = 16): string {
  const a = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
}
