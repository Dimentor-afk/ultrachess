// One API for the UI with two back ends: the Node server (real database,
// shared accounts) and a browser-only fallback that runs the same game
// service over localStorage (demo hosting without a server).

import { MemoryStore, type MemoryData } from '../economy/memoryStore';
import type { PackType } from '../economy/packs';
import {
  type AdminUser,
  ApiError,
  type ChallengeView,
  type Collection,
  type FriendsView,
  type HistoryRow,
  type Inbox,
  type PlayerCard,
  type PublicProfile,
  type PvpState,
  type PvpSummary,
  GameService,
  type LeaderRow,
  type MatchFinish,
  type MatchStart,
  type OpenResult,
  type PackView,
  type Profile,
} from '../economy/service';
import type { Hasher, Role } from '../economy/store';
import type { Action } from '../engine/match';
import type { Deck } from '../engine/types';

export { ApiError };
export type {
  AdminUser,
  ChallengeView,
  Collection,
  FriendsView,
  HistoryRow,
  Inbox,
  LeaderRow,
  MatchFinish,
  MatchStart,
  OpenResult,
  PackView,
  PlayerCard,
  Profile,
  PublicProfile,
  PvpState,
  PvpSummary,
};

export interface ChallengesView {
  incoming: ChallengeView[];
  outgoing: ChallengeView[];
  games: PvpSummary[];
}

export interface Api {
  mode: 'server' | 'local';
  me(): Promise<Profile | null>;
  register(email: string, password: string, name: string): Promise<Profile>;
  login(email: string, password: string): Promise<Profile>;
  logout(): Promise<void>;
  collection(): Promise<Collection>;
  packs(): Promise<PackView[]>;
  openPack(id: string): Promise<OpenResult>;
  buyPack(type: PackType): Promise<{ pack: PackView; profile: Profile }>;
  buyTheme(id: string): Promise<Profile>;
  setBoardTheme(id: string): Promise<Profile>;
  decks(): Promise<Deck[]>;
  saveDeck(deck: Deck): Promise<Deck[]>;
  deleteDeck(id: string): Promise<Deck[]>;
  setActiveDeck(id: string): Promise<Profile>;
  startMatch(opts: { deckId?: string; ranked: boolean; level?: number }): Promise<MatchStart>;
  finishMatch(id: string, actions: Action[], resigned: boolean): Promise<MatchFinish>;
  leaderboard(): Promise<LeaderRow[]>;
  adminUsers(): Promise<AdminUser[]>;
  adminGrantPack(userId: string, type: PackType): Promise<void>;
  adminGrantAllCards(userId: string): Promise<void>;
  adminSetTrophies(userId: string, trophies: number): Promise<void>;
  adminSetRole(userId: string, role: Role): Promise<void>;
  adminGrantCurrency(userId: string, gold: number, shards: number): Promise<void>;
  updateProfile(patch: { name?: string; avatar?: string }): Promise<Profile>;
  playerProfile(userId: string): Promise<PublicProfile>;
  history(): Promise<HistoryRow[]>;
  inbox(): Promise<Inbox>;
  friends(): Promise<FriendsView>;
  searchPlayers(query: string): Promise<PlayerCard[]>;
  addFriend(userId: string): Promise<FriendsView>;
  respondFriend(linkId: string, accept: boolean): Promise<FriendsView>;
  removeFriend(linkId: string): Promise<FriendsView>;
  challenges(): Promise<ChallengesView>;
  challengeFriend(friendId: string, deckId?: string): Promise<void>;
  respondChallenge(id: string, accept: boolean, deckId?: string): Promise<{ pvpId: string | null }>;
  pvpState(id: string): Promise<PvpState>;
  pvpAction(id: string, action: Action, expected: number): Promise<PvpState>;
  pvpResign(id: string): Promise<PvpState>;
}

// ── Server ──

class HttpApi implements Api {
  mode = 'server' as const;

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`api/${path}`, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const data = res.status === 204 ? null : await res.json().catch(() => null);
    if (!res.ok) throw new ApiError(res.status, data?.error ?? `Помилка сервера (${res.status})`);
    return data as T;
  }

  async me() {
    try {
      return await this.call<Profile | null>('GET', 'me');
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return null;
      throw e;
    }
  }
  register = (email: string, password: string, name: string) => this.call<Profile>('POST', 'auth/register', { email, password, name });
  login = (email: string, password: string) => this.call<Profile>('POST', 'auth/login', { email, password });
  logout = () => this.call<void>('POST', 'auth/logout', {});
  collection = () => this.call<Collection>('GET', 'collection');
  packs = () => this.call<PackView[]>('GET', 'packs');
  openPack = (id: string) => this.call<OpenResult>('POST', `packs/${id}/open`, {});
  buyPack = (type: PackType) => this.call<{ pack: PackView; profile: Profile }>('POST', 'shop/pack', { type });
  buyTheme = (id: string) => this.call<Profile>('POST', 'shop/theme', { id });
  setBoardTheme = (id: string) => this.call<Profile>('POST', 'profile/theme', { id });
  decks = () => this.call<Deck[]>('GET', 'decks');
  saveDeck = (deck: Deck) => this.call<Deck[]>('PUT', 'decks', deck);
  deleteDeck = (id: string) => this.call<Deck[]>('DELETE', `decks/${id}`);
  setActiveDeck = (id: string) => this.call<Profile>('POST', 'decks/active', { id });
  startMatch = (opts: { deckId?: string; ranked: boolean; level?: number }) => this.call<MatchStart>('POST', 'matches', opts);
  finishMatch = (id: string, actions: Action[], resigned: boolean) =>
    this.call<MatchFinish>('POST', `matches/${id}/finish`, { actions, resigned });
  leaderboard = () => this.call<LeaderRow[]>('GET', 'leaderboard');
  adminUsers = () => this.call<AdminUser[]>('GET', 'admin/users');
  adminGrantPack = (userId: string, type: PackType) => this.call<void>('POST', `admin/users/${userId}/pack`, { type });
  adminGrantAllCards = (userId: string) => this.call<void>('POST', `admin/users/${userId}/all-cards`, {});
  adminSetTrophies = (userId: string, trophies: number) => this.call<void>('POST', `admin/users/${userId}/trophies`, { trophies });
  adminSetRole = (userId: string, role: Role) => this.call<void>('POST', `admin/users/${userId}/role`, { role });
  adminGrantCurrency = (userId: string, gold: number, shards: number) =>
    this.call<void>('POST', `admin/users/${userId}/currency`, { gold, shards });
  updateProfile = (patch: { name?: string; avatar?: string }) => this.call<Profile>('POST', 'profile', patch);
  playerProfile = (userId: string) => this.call<PublicProfile>('GET', `players/${userId}`);
  history = () => this.call<HistoryRow[]>('GET', 'history');
  inbox = () => this.call<Inbox>('GET', 'inbox');
  friends = () => this.call<FriendsView>('GET', 'friends');
  searchPlayers = (query: string) => this.call<PlayerCard[]>('POST', 'friends/search', { query });
  addFriend = (userId: string) => this.call<FriendsView>('POST', 'friends', { userId });
  respondFriend = (linkId: string, accept: boolean) => this.call<FriendsView>('POST', `friends/${linkId}/respond`, { accept });
  removeFriend = (linkId: string) => this.call<FriendsView>('DELETE', `friends/${linkId}`);
  challenges = () => this.call<ChallengesView>('GET', 'challenges');
  challengeFriend = (friendId: string, deckId?: string) => this.call<void>('POST', 'challenges', { friendId, deckId });
  respondChallenge = (id: string, accept: boolean, deckId?: string) =>
    this.call<{ pvpId: string | null }>('POST', `challenges/${id}/respond`, { accept, deckId });
  pvpState = (id: string) => this.call<PvpState>('GET', `pvp/${id}`);
  pvpAction = (id: string, action: Action, expected: number) => this.call<PvpState>('POST', `pvp/${id}/action`, { action, expected });
  pvpResign = (id: string) => this.call<PvpState>('POST', `pvp/${id}/resign`, {});
}

// ── Browser only ──

const DB_KEY = 'ultrachess.db.v1';
const TOKEN_KEY = 'ultrachess.token.v1';

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Storage blocked: the demo still works until the tab closes.
  }
}

const webHasher: Hasher = {
  async hash(password) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    return `pbkdf2$${toHex(salt)}$${await derive(password, salt)}`;
  },
  async verify(password, stored) {
    const [, salt, hash] = stored.split('$');
    return (await derive(password, fromHex(salt))) === hash;
  },
};

async function derive(password: string, salt: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: salt as BufferSource, iterations: 100_000, hash: 'SHA-256' }, key, 256);
  return toHex(new Uint8Array(bits));
}

const toHex = (a: Uint8Array) => [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
const fromHex = (h: string) => new Uint8Array((h.match(/../g) ?? []).map((x) => parseInt(x, 16)));

class LocalApi implements Api {
  mode = 'local' as const;
  private svc: GameService;
  private store: MemoryStore;
  private ready: Promise<void>;
  private token: string | null = null;

  constructor() {
    const store = new MemoryStore(readJson<MemoryData>(DB_KEY) ?? undefined, (d) => write(DB_KEY, JSON.stringify(d)));
    this.store = store;
    this.svc = new GameService(store, webHasher);
    this.ready = this.svc.init();
    try {
      this.token = localStorage.getItem(TOKEN_KEY);
    } catch {
      this.token = null;
    }
  }

  private async t(): Promise<string> {
    await this.ready;
    // Another tab may have written (a friend's move in the demo): read storage again.
    this.store.reload(readJson<MemoryData>(DB_KEY));
    return this.token ?? '';
  }

  private remember(token: string | null) {
    this.token = token;
    write(TOKEN_KEY, token);
  }

  async me() {
    try {
      return await this.svc.me(await this.t());
    } catch {
      return null;
    }
  }
  async register(email: string, password: string, name: string) {
    await this.t();
    const r = await this.svc.register(email, password, name);
    this.remember(r.token);
    return r.profile;
  }
  async login(email: string, password: string) {
    await this.t();
    const r = await this.svc.login(email, password);
    this.remember(r.token);
    return r.profile;
  }
  async logout() {
    await this.svc.logout(await this.t());
    this.remember(null);
  }
  collection = async () => this.svc.collection(await this.t());
  packs = async () => this.svc.packs(await this.t());
  openPack = async (id: string) => this.svc.openPack(await this.t(), id);
  buyPack = async (type: PackType) => this.svc.buyPack(await this.t(), type);
  buyTheme = async (id: string) => this.svc.buyTheme(await this.t(), id);
  setBoardTheme = async (id: string) => this.svc.setBoardTheme(await this.t(), id);
  decks = async () => this.svc.decks(await this.t());
  saveDeck = async (deck: Deck) => this.svc.saveDeck(await this.t(), deck);
  deleteDeck = async (id: string) => this.svc.deleteDeck(await this.t(), id);
  setActiveDeck = async (id: string) => this.svc.setActiveDeck(await this.t(), id);
  startMatch = async (opts: { deckId?: string; ranked: boolean; level?: number }) => this.svc.startMatch(await this.t(), opts);
  finishMatch = async (id: string, actions: Action[], resigned: boolean) => this.svc.finishMatch(await this.t(), id, actions, resigned);
  leaderboard = async () => {
    await this.t();
    return this.svc.leaderboard();
  };
  adminUsers = async () => this.svc.adminUsers(await this.t());
  adminGrantPack = async (userId: string, type: PackType) => this.svc.adminGrantPack(await this.t(), userId, type);
  adminGrantAllCards = async (userId: string) => this.svc.adminGrantAllCards(await this.t(), userId);
  adminSetTrophies = async (userId: string, trophies: number) => this.svc.adminSetTrophies(await this.t(), userId, trophies);
  adminSetRole = async (userId: string, role: Role) => this.svc.adminSetRole(await this.t(), userId, role);
  adminGrantCurrency = async (userId: string, gold: number, shards: number) =>
    this.svc.adminGrantCurrency(await this.t(), userId, gold, shards);
  updateProfile = async (patch: { name?: string; avatar?: string }) => this.svc.updateProfile(await this.t(), patch);
  playerProfile = async (userId: string) => this.svc.playerProfile(await this.t(), userId);
  history = async () => this.svc.history(await this.t());
  inbox = async () => this.svc.inbox(await this.t());
  friends = async () => this.svc.friends(await this.t());
  searchPlayers = async (query: string) => this.svc.searchPlayers(await this.t(), query);
  addFriend = async (userId: string) => this.svc.addFriend(await this.t(), userId);
  respondFriend = async (linkId: string, accept: boolean) => this.svc.respondFriend(await this.t(), linkId, accept);
  removeFriend = async (linkId: string) => this.svc.removeFriend(await this.t(), linkId);
  challenges = async () => this.svc.challenges(await this.t());
  challengeFriend = async (friendId: string, deckId?: string) => this.svc.challengeFriend(await this.t(), friendId, deckId);
  respondChallenge = async (id: string, accept: boolean, deckId?: string) => this.svc.respondChallenge(await this.t(), id, accept, deckId);
  pvpState = async (id: string) => this.svc.pvpState(await this.t(), id);
  pvpAction = async (id: string, action: Action, expected: number) => this.svc.pvpAction(await this.t(), id, action, expected);
  pvpResign = async (id: string) => this.svc.pvpResign(await this.t(), id);
}

/** Use the server when it answers, otherwise the in-browser demo. */
export async function createApi(): Promise<Api> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 1500);
    const res = await fetch('api/health', { signal: ctrl.signal });
    clearTimeout(timer);
    const data = res.ok ? await res.json() : null;
    if (data?.ok) return new HttpApi();
  } catch {
    // No server: fall through.
  }
  return new LocalApi();
}
