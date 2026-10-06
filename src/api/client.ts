// One API for the UI with two back ends: the Node server (real database,
// shared accounts) and a browser-only fallback that runs the same game
// service over localStorage (demo hosting without a server).

import { MemoryStore, type MemoryData } from '../economy/memoryStore';
import type { ShopOffer } from '../economy/dailyShop';
import type { PackType } from '../economy/packs';
import {
  type AdminUser,
  ApiError,
  type ChallengeView,
  type Collection,
  type FriendsView,
  type GameView,
  type LiveGame as LiveGameRow,
  type HistoryRow,
  type GameRecord,
  type Inbox,
  type PlayerCard,
  type PublicProfile,
  type PvpState,
  type PvpSummary,
  GameService,
  type LadderResult,
  type LadderView,
  type LeagueUp,
  type LeaderRow,
  type MatchFinish,
  type MatchStart,
  type MailSent,
  type OpenResult,
  type PackView,
  type Profile,
} from '../economy/service';
import type { Hasher, Role } from '../economy/store';
import type { AchievementView } from '../economy/achievements';
import type { ReferralView } from '../economy/referrals';
import { type PurchaseView, type ShardOffer, type ShardProduct, TestPayments } from '../economy/payments';
import type { Action } from '../engine/match';
import type { Deck } from '../engine/types';
import { requestBotTurn } from '../ui/botClient';
import { LiveSocket, liveUrl } from './live';
import { getLang, t, tr } from '../i18n';

export { ApiError };
export type { PurchaseView, ShardOffer, ShardProduct, AchievementView, ReferralView };
export type {
  GameView,
  LiveGameRow,
  AdminUser,
  ChallengeView,
  Collection,
  FriendsView,
  HistoryRow,
  GameRecord,
  Inbox,
  LadderResult,
  LadderView,
  LeagueUp,
  LeaderRow,
  MatchFinish,
  MatchStart,
  MailSent,
  OpenResult,
  PackView,
  PlayerCard,
  Profile,
  PublicProfile,
  PvpState,
  PvpSummary,
  ShopOffer,
};

export interface ChallengesView {
  incoming: ChallengeView[];
  outgoing: ChallengeView[];
  games: PvpSummary[];
}

export interface Api {
  mode: 'server' | 'local';
  me(): Promise<Profile | null>;
  /** `ref`: the invite code the player came with. */
  register(email: string, password: string, name: string, ref?: string): Promise<Profile>;
  referrals(): Promise<ReferralView>;
  login(email: string, password: string): Promise<Profile>;
  logout(): Promise<void>;
  /** "Forgot password": always the same answer (in the demo, with the link). */
  forgotPassword(email: string): Promise<MailSent>;
  /** A new password from a reset link; signs in. */
  resetPassword(token: string, password: string): Promise<Profile>;
  verifyEmail(token: string): Promise<{ email: string }>;
  sendVerification(): Promise<MailSent>;
  changePassword(current: string, next: string): Promise<void>;
  changeEmail(password: string, email: string): Promise<{ profile: Profile; mail: MailSent }>;
  /** Sign out on every other device. */
  logoutOthers(): Promise<void>;
  deleteAccount(password: string): Promise<void>;
  /** Shard bundles for real money and whether they are on sale. */
  shardOffer(): Promise<ShardOffer>;
  /** Start a purchase: the page where the player pays. */
  buyShards(product: string): Promise<{ purchaseId: string; pageUrl: string }>;
  purchase(id: string): Promise<{ purchase: PurchaseView; profile: Profile }>;
  purchases(): Promise<PurchaseView[]>;
  /** The test payment page (demo and PAYMENTS=test only). */
  completeTestPayment(id: string, ok: boolean): Promise<{ purchase: PurchaseView; profile: Profile }>;
  adminPurchases(): Promise<(PurchaseView & { email: string; name: string; price: string })[]>;
  adminDeletePurchase(id: string): Promise<void>;
  collection(): Promise<Collection>;
  packs(): Promise<PackView[]>;
  openPack(id: string): Promise<OpenResult>;
  buyPack(type: PackType): Promise<{ pack: PackView; profile: Profile }>;
  claimFreePack(): Promise<{ pack: PackView; profile: Profile }>;
  /** Today's boards and capture effects. */
  shop(): Promise<ShopOffer>;
  buyTheme(id: string): Promise<Profile>;
  setBoardTheme(id: string): Promise<Profile>;
  buyCaptureFx(id: string): Promise<Profile>;
  setCaptureFx(id: string): Promise<Profile>;
  decks(): Promise<Deck[]>;
  saveDeck(deck: Deck): Promise<Deck[]>;
  deleteDeck(id: string): Promise<Deck[]>;
  setActiveDeck(id: string): Promise<Profile>;
  startMatch(opts: { deckId?: string; ranked: boolean; level?: number; trial?: string }): Promise<MatchStart>;
  /** Send the player's action (or null to let the bot move); the answer is the server's record of the game. */
  /**
   * Bot games: send the player's action (null: let the bot move, or just fetch
   * the game) with the version `v` of the view it was made on.
   */
  matchAction(id: string, action: Action | null, v: string): Promise<{ view: GameView; stale?: boolean }>;
  finishMatch(id: string, resigned: boolean): Promise<MatchFinish>;
  leaderboard(): Promise<LeaderRow[]>;
  adminUsers(): Promise<AdminUser[]>;
  adminGrantPack(userId: string, type: PackType): Promise<void>;
  adminGrantAllCards(userId: string): Promise<void>;
  adminSetTrophies(userId: string, trophies: number, ladder?: 'bot' | 'pvp'): Promise<void>;
  adminSetRole(userId: string, role: Role): Promise<void>;
  adminGrantCurrency(userId: string, gold: number, shards: number): Promise<void>;
  /** `hours` null: for good. */
  adminBan(userId: string, hours: number | null, reason: string): Promise<void>;
  adminUnban(userId: string): Promise<void>;
  adminRename(userId: string, name: string, reason: string): Promise<void>;
  /** The player has read profile.notice. */
  dismissNotice(): Promise<Profile>;
  adminLogout(userId: string): Promise<void>;
  adminDeleteUser(userId: string): Promise<void>;
  updateProfile(patch: { name?: string; avatar?: string }): Promise<Profile>;
  playerProfile(userId: string): Promise<PublicProfile>;
  history(): Promise<HistoryRow[]>;
  /** A finished game of mine ('m': with the bot, 'p': with a player), to replay. */
  gameRecord(kind: 'm' | 'p', id: string): Promise<GameRecord>;
  inbox(): Promise<Inbox>;
  claimQuest(id: string): Promise<Profile>;
  achievements(): Promise<AchievementView[]>;
  setTitle(id: string | null): Promise<Profile>;
  seeAchievements(ids: string[]): Promise<Profile>;
  setShowcase(ids: string[]): Promise<Profile>;
  setBotOverride(level: number | null): Promise<Profile>;
  friends(): Promise<FriendsView>;
  searchPlayers(query: string): Promise<PlayerCard[]>;
  addFriend(userId: string): Promise<FriendsView>;
  respondFriend(linkId: string, accept: boolean): Promise<FriendsView>;
  removeFriend(linkId: string): Promise<FriendsView>;
  challenges(): Promise<ChallengesView>;
  challengeFriend(friendId: string, deckId?: string): Promise<void>;
  respondChallenge(id: string, accept: boolean, deckId?: string): Promise<{ pvpId: string | null }>;
  pvpState(id: string): Promise<PvpState>;
  pvpAction(id: string, action: Action, v: string): Promise<PvpState>;
  pvpResign(id: string): Promise<PvpState>;
  pvpClaim(id: string): Promise<PvpState>;
  seek(deckId?: string): Promise<{ pvpId: string | null; searching: number }>;
  cancelSeek(): Promise<void>;
  enterTrial(id: string): Promise<Profile>;
  /** Live updates over WebSocket (server mode); the browser demo polls instead. */
  live?: LiveSocket;
  /** Browser demo only: delete every demo account stored in this browser. */
  resetDemo?(): Promise<void>;
}

// ── Server ──

class HttpApi implements Api {
  mode = 'server' as const;

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`api/${path}`, {
      method,
      credentials: 'same-origin',
      // The server writes letters (password reset, confirmation) in the player's language.
      headers: { 'X-Lang': getLang(), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const data = res.status === 204 ? null : await res.json().catch(() => null);
    if (!res.ok) throw new ApiError(res.status, data?.error ? tr(data.error) : t('Помилка сервера ({0})', res.status));
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
  register = (email: string, password: string, name: string, ref?: string) => this.call<Profile>('POST', 'auth/register', { email, password, name, ref });
  referrals = () => this.call<ReferralView>('GET', 'referrals');
  login = (email: string, password: string) => this.call<Profile>('POST', 'auth/login', { email, password });
  logout = async () => {
    this.socket?.close();
    this.socket = undefined;
    await this.call<void>('POST', 'auth/logout', {});
  };
  forgotPassword = (email: string) => this.call<MailSent>('POST', 'auth/forgot', { email });
  resetPassword = (token: string, password: string) => this.call<Profile>('POST', 'auth/reset', { token, password });
  verifyEmail = (token: string) => this.call<{ email: string }>('POST', 'auth/verify', { token });
  sendVerification = () => this.call<MailSent>('POST', 'account/verify', {});
  changePassword = (current: string, password: string) => this.call<void>('POST', 'account/password', { current, password });
  changeEmail = (password: string, email: string) => this.call<{ profile: Profile; mail: MailSent }>('POST', 'account/email', { password, email });
  logoutOthers = () => this.call<void>('POST', 'auth/logout-others', {});
  deleteAccount = async (password: string) => {
    await this.call<void>('POST', 'account/delete', { password });
    this.socket?.close();
    this.socket = undefined;
  };
  shardOffer = () => this.call<ShardOffer>('GET', 'shop/shards');
  buyShards = (product: string) => this.call<{ purchaseId: string; pageUrl: string }>('POST', 'shop/shards', { product });
  purchase = (id: string) => this.call<{ purchase: PurchaseView; profile: Profile }>('GET', `purchases/${id}`);
  purchases = () => this.call<PurchaseView[]>('GET', 'purchases');
  completeTestPayment = (id: string, ok: boolean) => this.call<{ purchase: PurchaseView; profile: Profile }>('POST', `payments/test/${id}`, { ok });
  adminPurchases = () => this.call<(PurchaseView & { email: string; name: string; price: string })[]>('GET', 'admin/purchases');
  adminDeletePurchase = (id: string) => this.call<void>('POST', `admin/purchases/${id}/delete`, {});
  private socket: LiveSocket | undefined;
  /** Opened on first use (signed in by then: the socket is authenticated by the session cookie). */
  get live(): LiveSocket {
    return (this.socket ??= new LiveSocket(liveUrl()));
  }
  collection = () => this.call<Collection>('GET', 'collection');
  packs = () => this.call<PackView[]>('GET', 'packs');
  openPack = (id: string) => this.call<OpenResult>('POST', `packs/${id}/open`, {});
  buyPack = (type: PackType) => this.call<{ pack: PackView; profile: Profile }>('POST', 'shop/pack', { type });
  claimFreePack = () => this.call<{ pack: PackView; profile: Profile }>('POST', 'shop/free-pack');
  shop = () => this.call<ShopOffer>('GET', 'shop');
  buyTheme = (id: string) => this.call<Profile>('POST', 'shop/theme', { id });
  setBoardTheme = (id: string) => this.call<Profile>('POST', 'profile/theme', { id });
  buyCaptureFx = (id: string) => this.call<Profile>('POST', 'shop/fx', { id });
  setCaptureFx = (id: string) => this.call<Profile>('POST', 'profile/fx', { id });
  decks = () => this.call<Deck[]>('GET', 'decks');
  saveDeck = (deck: Deck) => this.call<Deck[]>('PUT', 'decks', deck);
  deleteDeck = (id: string) => this.call<Deck[]>('DELETE', `decks/${id}`);
  setActiveDeck = (id: string) => this.call<Profile>('POST', 'decks/active', { id });
  startMatch = (opts: { deckId?: string; ranked: boolean; level?: number; trial?: string }) => this.call<MatchStart>('POST', 'matches', opts);
  matchAction = (id: string, action: Action | null, v: string) =>
    this.call<{ view: GameView; stale?: boolean }>('POST', `matches/${id}/action`, { action, v });
  finishMatch = (id: string, resigned: boolean) => this.call<MatchFinish>('POST', `matches/${id}/finish`, { resigned });
  leaderboard = () => this.call<LeaderRow[]>('GET', 'leaderboard');
  adminUsers = () => this.call<AdminUser[]>('GET', 'admin/users');
  adminGrantPack = (userId: string, type: PackType) => this.call<void>('POST', `admin/users/${userId}/pack`, { type });
  adminGrantAllCards = (userId: string) => this.call<void>('POST', `admin/users/${userId}/all-cards`, {});
  adminSetTrophies = (userId: string, trophies: number, ladder: 'bot' | 'pvp' = 'pvp') => this.call<void>('POST', `admin/users/${userId}/trophies`, { trophies, ladder });
  adminSetRole = (userId: string, role: Role) => this.call<void>('POST', `admin/users/${userId}/role`, { role });
  adminGrantCurrency = (userId: string, gold: number, shards: number) =>
    this.call<void>('POST', `admin/users/${userId}/currency`, { gold, shards });
  adminBan = (userId: string, hours: number | null, reason: string) => this.call<void>('POST', `admin/users/${userId}/ban`, { hours, reason });
  adminUnban = (userId: string) => this.call<void>('POST', `admin/users/${userId}/unban`, {});
  adminRename = (userId: string, name: string, reason: string) => this.call<void>('POST', `admin/users/${userId}/rename`, { name, reason });
  dismissNotice = () => this.call<Profile>('POST', 'profile/notice', {});
  adminLogout = (userId: string) => this.call<void>('POST', `admin/users/${userId}/logout`, {});
  adminDeleteUser = (userId: string) => this.call<void>('POST', `admin/users/${userId}/delete`, {});
  updateProfile = (patch: { name?: string; avatar?: string }) => this.call<Profile>('POST', 'profile', patch);
  playerProfile = (userId: string) => this.call<PublicProfile>('GET', `players/${userId}`);
  history = () => this.call<HistoryRow[]>('GET', 'history');
  gameRecord = (kind: 'm' | 'p', id: string) => this.call<GameRecord>('GET', `games/${kind}/${id}`);
  inbox = () => this.call<Inbox>('GET', 'inbox');
  claimQuest = (id: string) => this.call<Profile>('POST', `quests/${id}/claim`, {});
  achievements = () => this.call<AchievementView[]>('GET', 'achievements');
  setTitle = (id: string | null) => this.call<Profile>('POST', 'profile/title', { id });
  seeAchievements = (ids: string[]) => this.call<Profile>('POST', 'achievements/seen', { ids });
  setShowcase = (ids: string[]) => this.call<Profile>('POST', 'achievements/showcase', { ids });
  setBotOverride = (level: number | null) => this.call<Profile>('POST', 'admin/bot', { level });
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
  pvpAction = (id: string, action: Action, v: string) => this.call<PvpState>('POST', `pvp/${id}/action`, { action, v });
  pvpResign = (id: string) => this.call<PvpState>('POST', `pvp/${id}/resign`, {});
  pvpClaim = (id: string) => this.call<PvpState>('POST', `pvp/${id}/claim`, {});
  seek = (deckId?: string) => this.call<{ pvpId: string | null; searching: number }>('POST', 'seek', { deckId });
  cancelSeek = () => this.call<void>('DELETE', 'seek');
  enterTrial = (id: string) => this.call<Profile>('POST', `trials/${id}/enter`, {});
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

/** This page's address without the route: links in letters open the app here. */
function siteBase(): string {
  return `${location.origin}${location.pathname}`;
}

class LocalApi implements Api {
  mode = 'local' as const;
  private svc: GameService;
  private store: MemoryStore;
  private ready: Promise<void>;
  private token: string | null = null;

  constructor() {
    const store = new MemoryStore(readJson<MemoryData>(DB_KEY) ?? undefined, (d) => write(DB_KEY, JSON.stringify(d)));
    this.store = store;
    // The demo has no server: the bot thinks in a web worker, like before.
    this.svc = new GameService(store, webHasher, Date.now, Math.random, requestBotTurn);
    // No mail in the demo: the screens show the link from the "letter" instead.
    this.svc.showLinks = true;
    // No money in the demo either: purchases go through the test payment page.
    this.svc.payments = new TestPayments();
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
  referrals = async () => this.svc.referrals(await this.t());
  async register(email: string, password: string, name: string, ref?: string) {
    await this.t();
    const r = await this.svc.register(email, password, name, undefined, undefined, ref);
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
  forgotPassword = async (email: string) => {
    await this.t();
    return this.svc.requestPasswordReset(email, siteBase());
  };
  resetPassword = async (token: string, password: string) => {
    await this.t();
    const r = await this.svc.resetPassword(token, password);
    this.remember(r.token);
    return r.profile;
  };
  verifyEmail = async (token: string) => {
    await this.t();
    return this.svc.verifyEmail(token);
  };
  sendVerification = async () => this.svc.sendVerification(await this.t(), siteBase());
  changePassword = async (current: string, next: string) => this.svc.changePassword(await this.t(), current, next);
  changeEmail = async (password: string, email: string) => this.svc.changeEmail(await this.t(), password, email, siteBase());
  logoutOthers = async () => this.svc.logoutOthers(await this.t());
  shardOffer = async () => this.svc.shardOffer(await this.t());
  buyShards = async (product: string) => this.svc.buyShards(await this.t(), product, siteBase());
  purchase = async (id: string) => this.svc.purchase(await this.t(), id);
  purchases = async () => this.svc.purchases(await this.t());
  completeTestPayment = async (id: string, ok: boolean) => this.svc.completeTestPayment(await this.t(), id, ok);
  adminPurchases = async () => this.svc.adminPurchases(await this.t());
  adminDeletePurchase = async (id: string) => this.svc.adminDeletePurchase(await this.t(), id);
  deleteAccount = async (password: string) => {
    await this.svc.deleteAccount(await this.t(), password);
    this.remember(null);
  };
  collection = async () => this.svc.collection(await this.t());
  packs = async () => this.svc.packs(await this.t());
  openPack = async (id: string) => this.svc.openPack(await this.t(), id);
  buyPack = async (type: PackType) => this.svc.buyPack(await this.t(), type);
  claimFreePack = async () => this.svc.claimFreePack(await this.t());
  shop = async () => this.svc.shop(await this.t());
  buyTheme = async (id: string) => this.svc.buyTheme(await this.t(), id);
  setBoardTheme = async (id: string) => this.svc.setBoardTheme(await this.t(), id);
  buyCaptureFx = async (id: string) => this.svc.buyCaptureFx(await this.t(), id);
  setCaptureFx = async (id: string) => this.svc.setCaptureFx(await this.t(), id);
  decks = async () => this.svc.decks(await this.t());
  saveDeck = async (deck: Deck) => this.svc.saveDeck(await this.t(), deck);
  deleteDeck = async (id: string) => this.svc.deleteDeck(await this.t(), id);
  setActiveDeck = async (id: string) => this.svc.setActiveDeck(await this.t(), id);
  startMatch = async (opts: { deckId?: string; ranked: boolean; level?: number; trial?: string }) => this.svc.startMatch(await this.t(), opts);
  matchAction = async (id: string, action: Action | null, v: string) => this.svc.matchAction(await this.t(), id, action, v);
  finishMatch = async (id: string, resigned: boolean) => this.svc.finishMatch(await this.t(), id, resigned);
  leaderboard = async () => {
    await this.t();
    return this.svc.leaderboard();
  };
  adminUsers = async () => this.svc.adminUsers(await this.t());
  adminGrantPack = async (userId: string, type: PackType) => this.svc.adminGrantPack(await this.t(), userId, type);
  adminGrantAllCards = async (userId: string) => this.svc.adminGrantAllCards(await this.t(), userId);
  adminSetTrophies = async (userId: string, trophies: number, ladder: 'bot' | 'pvp' = 'pvp') => this.svc.adminSetTrophies(await this.t(), userId, trophies, ladder);
  adminSetRole = async (userId: string, role: Role) => this.svc.adminSetRole(await this.t(), userId, role);
  adminGrantCurrency = async (userId: string, gold: number, shards: number) =>
    this.svc.adminGrantCurrency(await this.t(), userId, gold, shards);
  adminBan = async (userId: string, hours: number | null, reason: string) => this.svc.adminBan(await this.t(), userId, hours, reason);
  adminUnban = async (userId: string) => this.svc.adminUnban(await this.t(), userId);
  adminRename = async (userId: string, name: string, reason: string) => this.svc.adminRename(await this.t(), userId, name, reason);
  dismissNotice = async () => this.svc.dismissNotice(await this.t());
  adminLogout = async (userId: string) => this.svc.adminLogout(await this.t(), userId);
  adminDeleteUser = async (userId: string) => this.svc.adminDeleteUser(await this.t(), userId);
  updateProfile = async (patch: { name?: string; avatar?: string }) => this.svc.updateProfile(await this.t(), patch);
  playerProfile = async (userId: string) => this.svc.playerProfile(await this.t(), userId);
  history = async () => this.svc.history(await this.t());
  gameRecord = async (kind: 'm' | 'p', id: string) => this.svc.gameRecord(await this.t(), kind, id);
  inbox = async () => this.svc.inbox(await this.t());
  claimQuest = async (id: string) => this.svc.claimQuest(await this.t(), id);
  achievements = async () => this.svc.achievements(await this.t());
  setTitle = async (id: string | null) => this.svc.setTitle(await this.t(), id);
  seeAchievements = async (ids: string[]) => this.svc.seeAchievements(await this.t(), ids);
  setShowcase = async (ids: string[]) => this.svc.setShowcase(await this.t(), ids);
  setBotOverride = async (level: number | null) => this.svc.setBotOverride(await this.t(), level);
  friends = async () => this.svc.friends(await this.t());
  searchPlayers = async (query: string) => this.svc.searchPlayers(await this.t(), query);
  addFriend = async (userId: string) => this.svc.addFriend(await this.t(), userId);
  respondFriend = async (linkId: string, accept: boolean) => this.svc.respondFriend(await this.t(), linkId, accept);
  removeFriend = async (linkId: string) => this.svc.removeFriend(await this.t(), linkId);
  challenges = async () => this.svc.challenges(await this.t());
  challengeFriend = async (friendId: string, deckId?: string) => this.svc.challengeFriend(await this.t(), friendId, deckId);
  respondChallenge = async (id: string, accept: boolean, deckId?: string) => this.svc.respondChallenge(await this.t(), id, accept, deckId);
  pvpState = async (id: string) => this.svc.pvpState(await this.t(), id);
  pvpAction = async (id: string, action: Action, v: string) => this.svc.pvpAction(await this.t(), id, action, v);
  pvpResign = async (id: string) => this.svc.pvpResign(await this.t(), id);
  pvpClaim = async (id: string) => this.svc.pvpClaim(await this.t(), id);
  seek = async (deckId?: string) => this.svc.seek(await this.t(), deckId);
  cancelSeek = async () => this.svc.cancelSeek(await this.t());
  enterTrial = async (id: string) => this.svc.enterTrial(await this.t(), id);
  async resetDemo() {
    await this.ready;
    this.store.reload({} as MemoryData);
    write(DB_KEY, null);
    this.remember(null);
    await this.svc.init();
  }
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
  return translatedErrors(new LocalApi());
}

/** The demo's service throws Ukrainian errors: show them in the chosen language, like the server's. */
function translatedErrors(api: LocalApi): Api {
  return new Proxy(api, {
    get(target, key, receiver) {
      const value = Reflect.get(target, key, receiver);
      if (typeof value !== 'function') return value;
      return (...args: unknown[]) => {
        const out = value.apply(target, args);
        return out instanceof Promise
          ? out.catch((e: unknown) => {
              throw e instanceof ApiError ? new ApiError(e.status, tr(e.message)) : e;
            })
          : out;
      };
    },
  });
}
