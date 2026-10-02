// Persistence contract for the game service. Implemented by SQLite on the
// server (server/sqliteStore.ts) and by localStorage in the browser demo.

import type { Action } from '../engine/match';
import type { Deck } from '../engine/types';
import type { PackType } from './packs';

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
  /** Highest league index already rewarded per ladder (JSON {bot, pvp}). */
  leagueRewards: string;
  /** Trial runs by trial id (JSON Record<string, TrialRun>). */
  trials: string;
}

export interface SessionRow {
  token: string;
  userId: string;
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
  status: 'pending' | 'accepted' | 'declined' | 'cancelled';
  pvpId: string | null;
  createdAt: number;
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

  listCards(userId: string): Promise<CardRow[]>;
  /** Add a copy: creates the card or adds a duplicate. Returns true if new. */
  addCard(userId: string, cardId: string): Promise<boolean>;
  setDupes(userId: string, cardId: string, dupes: number): Promise<void>;

  listPacks(userId: string): Promise<PackRow[]>;
  getPack(id: string): Promise<PackRow | null>;
  insertPack(p: PackRow): Promise<void>;
  updatePack(id: string, patch: Partial<PackRow>): Promise<void>;
  /** Atomically mark a ready pack as opened; false if it was not ready. */
  claimPack(id: string, userId: string, openedAt: number): Promise<boolean>;

  listDecks(userId: string): Promise<DeckRow[]>;
  upsertDeck(d: DeckRow): Promise<void>;
  deleteDeck(userId: string, id: string): Promise<void>;

  insertMatch(m: MatchRow): Promise<void>;
  getMatch(id: string): Promise<MatchRow | null>;
  /** With `expectedActions`, writes only if the stored game has that many actions (false otherwise). */
  updateMatch(id: string, patch: Partial<MatchRow>, expectedActions?: number): Promise<boolean>;
  /** Drop sessions that expired before `now`. */
  purgeSessions(now: number): Promise<void>;
  listMatches(userId: string, limit: number): Promise<MatchRow[]>;

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
