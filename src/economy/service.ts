// Game service: accounts, collection, packs, decks and ranked matches.
// The same code runs on the Node server (SQLite) and in the browser demo.

import { CARDS, CARD_BY_ID } from '../engine/cards';
import { DECK_SLOTS, classicDeck, deckPositions, validateDeck } from '../engine/deck';
import { type Action, type MatchState, canonicalAction, createMatch, performAction, resign } from '../engine/match';
import { secureState } from '../engine/secure';
import type { Color, Deck, Move, PieceType, Rarity } from '../engine/types';
import { FREE_PACK, PACK_SHARD_PRICE, type PackType, RARITIES, type Rng, SHARDS_PER_DUPE, packGold, packName, rollPack } from './packs';
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
import type { BotOptions, BotTurn } from '../engine/bot/search';
import { legalMoves } from '../engine/legal';
import { type QuestEvent, type QuestView, addProgress, parseQuests, questViews } from './quests';
import { type Hasher, type MatchRow, type PackRow, type PvpRow, type Role, type Store, type TokenRow, type UserRow, randomId } from './store';
import { ACHIEVEMENT_BY_ID, type AchievementState, type AchievementView, type CountedStat, achievementViews, gameFeats, parseAchievements } from './achievements';
import { NAME_CHANGE_MS, cleanName, nameProblem, passwordProblem, sha256 } from './account';
import { type PaymentProvider, type ProviderState, type PurchaseRow, type PurchaseView, SHARD_PRODUCTS, type ShardOffer, formatPrice, productById } from './payments';

/** Short public code for finding a player (first 6 hex digits of the id). */
const tagOf = (u: UserRow) => u.id.slice(0, 6).toUpperCase();

export const ADMIN_EMAILS = ['koldmiand@gmail.com'];
const SESSION_DAYS = 30;
/** How long the links sent by e-mail work. */
const LINK_TTL: Record<TokenRow['kind'], number> = { reset: 60 * 60_000, verify: 3 * 864e5 };
/** At most one letter of a kind to one user in this long (no flooding someone's mailbox). */
const MAIL_GAP_MS = 60_000;

/** A letter to send. The server sends it through a mail service; the demo shows the link instead. */
export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
}
export type Mailer = (mail: Mail) => Promise<void>;
/** What an action that sends a letter answers: in the demo (no mail) the link itself. */
export interface MailSent {
  sent: boolean;
  link?: string;
}

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
  /** The owner opened the confirmation link sent to `email`. */
  emailVerified: boolean;
  /** When the nickname may be changed again (0: now). */
  nameChangeAt: number;
  name: string;
  role: Role;
  /** The game's owner (ADMIN_EMAILS): the only one who appoints and removes admins. */
  owner: boolean;
  /** Something an admin did to the account, shown once (null: nothing to show). */
  notice: Notice | null;
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
  /** The free pack of the day is waiting in the shop. */
  freePack: boolean;
  /** Achievements reached (ids): a new one pops up on the screen. */
  achievements: string[];
  /** Achievement shown as the plate under the name (null: none). */
  title: string | null;
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

/**
 * A game as one viewer sees it. The server never sends the real game state:
 * a player gets it without the opponent's hidden information, a spectator
 * without anyone's (see engine/secure.ts).
 */
export interface GameView {
  /** The viewer's side; null for a spectator. */
  you: Color | null;
  state: MatchState;
  /** The viewer's legal moves, worked out by the server, when it is their turn. */
  legal: Move[];
  /**
   * Version of the game, sent back with the next action so a stale move is
   * refused. Random per position (it does not count actions: that would
   * give hidden actions away). Empty when the viewer cannot act.
   */
  v: string;
}

/** Something that the open screens of these users should pick up (live updates). */
export type ServiceEvent =
  | { type: 'game'; id: string; users: string[] }
  | { type: 'matched'; id: string; users: string[] }
  | { type: 'nudge'; users: string[] };

export interface MatchStart {
  matchId: string;
  ranked: boolean;
  /** The game so far: a game that was left unfinished goes on from here. */
  view: GameView;
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
  /** Achievements this game reached (ids). */
  achievements: string[];
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
  /** The achievement plate under the name. */
  title: string | null;
}

export interface FriendsView {
  friends: (PlayerCard & { linkId: string })[];
  incoming: (PlayerCard & { linkId: string })[];
  outgoing: (PlayerCard & { linkId: string })[];
  /** Friends' games in progress (to watch). */
  live: LiveGame[];
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

/** A finished game, whole, for its replay (only its players get it). */
export interface GameRecord {
  /** 'm': a game with the bot, 'p': with a player. */
  kind: 'm' | 'p';
  id: string;
  /** Who is who; the bot has no avatar. */
  players: Record<Color, { name: string; avatar: string | null }>;
  myColor: Color;
  decks: Record<Color, Deck>;
  /** Every action of the game, both sides, in order. */
  actions: Action[];
  result: { winner: Color | null; reason: string; moves: number };
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
  /** Your side; null when you are watching someone else's game. */
  color: Color | null;
  /** Each side's capture effect. */
  captureFx: Record<Color, string>;
  white: PlayerCard;
  black: PlayerCard;
  whiteDeck: Deck;
  blackDeck: Deck;
  view: GameView;
  status: 'active' | 'finished';
  resignedBy: Color | null;
  /** A player-ladder game; `ladder` is what it changed for you once finished. */
  ranked: boolean;
  ladder: LadderResult | null;
  /** The player-ladder trial this game counted for, if any. */
  trial: TrialResult | null;
  /** Achievements the game reached for you, once finished. */
  achievements: string[];
}

/** A friend's game in progress, open to watch. */
export interface LiveGame {
  id: string;
  white: PlayerCard;
  black: PlayerCard;
  ranked: boolean;
  moves: number;
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
/** Games whose last replayed state the service keeps (a state is tens of kilobytes). */
const REPLAY_CACHE = 300;

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
  owner: boolean;
  emailVerified: boolean;
  createdAt: number;
  lastSeen: number;
  online: boolean;
  /** Banned until (0: not banned, BAN_FOREVER: for good) and why. */
  bannedUntil: number;
  banReason: string;
}

/** A message for the player about what an admin did, shown on their next visit. */
export interface Notice {
  kind: 'renamed';
  from: string;
  to: string;
  reason: string;
  at: number;
}

/** A ban "for good": the latest date JavaScript can hold. */
export const BAN_FOREVER = 8.64e15;
/** The longest ban with an end date (about ten years), in hours. */
const BAN_MAX_HOURS = 24 * 3650;

/** What a banned player is told when signing in or on their next request. */
function banError(u: UserRow): ApiError {
  const r = u.banReason;
  if (u.bannedUntil >= BAN_FOREVER) return new ApiError(403, r ? `Акаунт заблоковано назавжди. Причина: ${r}` : 'Акаунт заблоковано назавжди.');
  const until = new Date(u.bannedUntil).toISOString().slice(0, 16).replace('T', ' ');
  return new ApiError(403, r ? `Акаунт заблоковано до ${until} UTC. Причина: ${r}` : `Акаунт заблоковано до ${until} UTC.`);
}

const emailOk = (e: string) => e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

// ── Letters ──

/** Where players write (forwarded to the author's inbox); also in src/ui/LegalPage.tsx. */
const SUPPORT_EMAIL = 'support@ultrachess.app';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Text of a letter in the reader's language: the Ukrainian text with {0}-style placeholders is the key. */
export type Say = (text: string, ...args: unknown[]) => string;
const ukrainian: Say = (text, ...args) => text.replace(/\{(\d+)\}/g, (m, i) => (i < args.length ? String(args[+i]) : m));

/**
 * A letter in the site's look (dark card, gold button). Mail clients ignore
 * <style> and flexbox, so it is tables with inline styles; `text` is the
 * plain copy for clients that show no HTML.
 */
function letter(say: Say, base: string, to: string, subject: string, lines: string[], link?: { href: string; label: string }): Mail {
  const footer = [say('Цей лист надіслано, бо цю пошту вказано в акаунті Ultrachess.'), say('Питання щодо гри й покупок: {0}.', SUPPORT_EMAIL)];
  const text = [...lines, ...(link ? ['', link.href] : []), '', '— Ultrachess', '', ...footer].join('\n');
  const font = "font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
  const p = (l: string, i: number) =>
    `<p style="margin:0 0 14px;${i === 0 ? 'font-size:18px;font-weight:700;color:#ffffff' : 'font-size:15px;line-height:1.55;color:#c9d2ee'}">${esc(l)}</p>`;
  const button = link
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 18px"><tr><td style="border-radius:10px;background:#f5c451">
<a href="${esc(link.href)}" style="display:inline-block;padding:13px 26px;${font};font-size:15px;font-weight:700;color:#1b1405;text-decoration:none;border-radius:10px">${esc(link.label)}</a></td></tr></table>
<p style="margin:0;font-size:12px;line-height:1.5;color:#7f8bb0">${esc(say('Якщо кнопка не працює, скопіюйте посилання:'))}<br><a href="${esc(link.href)}" style="color:#9fb6ff;word-break:break-all">${esc(link.href)}</a></p>`
    : '';
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#0c1120">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0c1120;${font}"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px">
<tr><td style="padding:0 4px 16px"><a href="${esc(base)}" style="text-decoration:none">
<img src="${esc(base)}icon-192.png" width="36" height="36" alt="" style="vertical-align:middle;border:0;border-radius:8px">
<span style="vertical-align:middle;margin-left:8px;font-size:20px;font-weight:800;letter-spacing:1px;color:#f5c451">ULTRACHESS</span></a></td></tr>
<tr><td style="background:#151f3a;border:1px solid #2a3a66;border-radius:14px;padding:28px 26px">
${lines.map(p).join('\n')}
${button}
</td></tr>
<tr><td style="padding:16px 6px 0;font-size:12px;line-height:1.5;color:#6c789d">${footer.map(esc).join('<br>')}</td></tr>
</table></td></tr></table></body></html>`;
  return { to, subject, text, html };
}

function resetMail(say: Say, base: string, name: string, to: string, href: string): Mail {
  return letter(say, base, to, say('Ultrachess: новий пароль'), [
    say('Привіт, {0}!', name),
    say('Хтось (сподіваємось, ви) попросив змінити пароль до вашого акаунта Ultrachess.'),
    say('Посилання працює одну годину й лише один раз. Якщо ви нічого не просили, просто проігноруйте цей лист: пароль лишиться тим самим.'),
  ], { href, label: say('Задати новий пароль') });
}

function verifyMail(say: Say, base: string, name: string, to: string, href: string): Mail {
  return letter(say, base, to, say('Ultrachess: підтвердіть пошту'), [
    say('Привіт, {0}!', name),
    say('Підтвердіть, що це ваша пошта: так ви зможете відновити пароль, якщо його забудете.'),
    say('Посилання працює 3 дні.'),
  ], { href, label: say('Підтвердити пошту') });
}

function emailChangedMail(say: Say, base: string, name: string, to: string, next: string): Mail {
  return letter(say, base, to, say('Ultrachess: пошту акаунта змінено'), [
    say('Привіт, {0}!', name),
    say('Пошту вашого акаунта Ultrachess щойно змінено на {0}.', next),
    say('Якщо це були не ви, негайно напишіть на {0}: ми повернемо акаунт на цю адресу.', SUPPORT_EMAIL),
  ]);
}

/**
 * A deck as the client sent it, reduced to the known fields with the right
 * types (anything else in the request is dropped, a wrong type is an error).
 */
function cleanDeck(input: unknown): Deck {
  const d = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const str = (v: unknown, field: string) => {
    if (typeof v !== 'string') throw new ApiError(400, `Колода: поле «${field}» має бути рядком.`);
    return v;
  };
  const id = str(d.id, 'id');
  if (!/^[\w-]{1,40}$/.test(id)) throw new ApiError(400, 'Колода: некоректний id.');
  const name = str(d.name, 'name').trim();
  if (name.length > 32) throw new ApiError(400, 'Назва колоди — до 32 символів.');
  if (!Array.isArray(d.pawnVersions) || d.pawnVersions.length > 2) throw new ApiError(400, 'Для пішаків потрібно обрати 1 або 2 версії.');
  const deck: Deck = {
    id,
    name,
    pawnVersions: d.pawnVersions.map((v) => str(v, 'pawnVersions')),
    pawnFormation: str(d.pawnFormation ?? '11111111', 'pawnFormation'),
    rook1: '',
    rook2: '',
    bishop1: '',
    bishop2: '',
    knight1: '',
    knight2: '',
    queen: '',
    king: '',
  };
  for (const s of DECK_SLOTS) (deck as unknown as Record<string, string>)[s.key] = str(d[s.key], s.key);
  return deck;
}

export class GameService {
  constructor(
    private store: Store,
    private hasher: Hasher,
    private now: () => number = Date.now,
    private rng: Rng = Math.random,
    // Loaded on demand: the browser demo passes its web worker and never needs this copy.
    private bot: BotRunner = async (state, color, opts) => (await import('../engine/bot/search')).chooseTurn(state, color, opts),
    /** E-mails that get the admin role (the server reads them from ADMIN_EMAILS). */
    private admins: string[] = ADMIN_EMAILS,
  ) {}

  /** Seed the admin accounts (no password until their owner registers). */
  async init(): Promise<void> {
    for (const email of this.admins) {
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
      freePackDay: '',
      leagueRewards: '{}',
      trials: '{}',
      emailVerified: false,
      nameChangedAt: 0,
      deleted: false,
      bannedUntil: 0,
      banReason: '',
      notice: '',
      achievements: '{}',
      title: '',
    };
  }

  // ── Accounts ──

  /** `base` (the site's address): where the confirmation link in the welcome letter points. */
  async register(emailRaw: string, password: string, nameRaw: string, base?: string, lang?: string): Promise<{ token: string; profile: Profile }> {
    const email = emailRaw.trim().toLowerCase();
    if (!emailOk(email)) throw new ApiError(400, 'Вкажіть коректну пошту.');
    const typed = cleanName(nameRaw);
    let name = typed;
    if (typed) {
      const bad = nameProblem(typed);
      if (bad) throw new ApiError(400, bad);
    } else {
      // No nickname typed: the start of the e-mail, if it makes a fine one.
      const local = cleanName(email.split('@')[0].replace(/[^\p{L}\p{N}_.-]/gu, '')).slice(0, 24);
      name = nameProblem(local) ? 'Гравець' : local;
    }
    const weak = passwordProblem(password, email);
    if (weak) throw new ApiError(400, weak);
    let user = await this.store.getUserByEmail(email);
    const hash = await this.hasher.hash(password);
    if (user && user.passHash) throw new ApiError(409, 'Акаунт з цією поштою вже існує. Увійдіть.');
    if (user) {
      // A seeded account (admin) is claimed by its first registration.
      await this.store.updateUser(user.id, { passHash: hash, name });
      user = (await this.store.getUser(user.id))!;
    } else {
      user = this.newUser(email, name, this.admins.includes(email) ? 'admin' : 'player', hash);
      await this.store.insertUser(user);
    }
    await this.giveStarter(user);
    // The confirmation letter must not stand in the way of playing: a failure is only logged.
    if (base) await this.sendLink(user, 'verify', email, base, lang).catch((e) => console.error('Verification mail failed:', e));
    return { token: await this.newSession(user.id), profile: await this.profileOf(user.id) };
  }

  async login(emailRaw: string, password: string): Promise<{ token: string; profile: Profile }> {
    const email = emailRaw.trim().toLowerCase();
    const user = await this.store.getUserByEmail(email);
    // No such account: check the password against a dummy hash anyway, so the
    // answer takes as long and the timing does not tell which e-mails exist.
    const ok = await this.hasher.verify(password.slice(0, 1024), user?.passHash ?? (await this.dummyHash()));
    if (!user || !user.passHash || user.deleted || !ok) throw new ApiError(401, 'Неправильна пошта або пароль.');
    if (user.bannedUntil > this.now()) throw banError(user);
    return { token: await this.newSession(user.id), profile: await this.profileOf(user.id) };
  }

  private dummy: Promise<string> | null = null;
  private dummyHash(): Promise<string> {
    return (this.dummy ??= this.hasher.hash(randomId(8)));
  }

  // ── Account: letters, settings, deletion ──

  /** Set by the server (a mail service) or the demo; without one, letters are only logged. */
  mailer: Mailer | null = null;
  /** The browser demo has no mail: actions answer with the link itself. */
  showLinks = false;
  /** Letters in the reader's language (the server sets it; without it they are Ukrainian). */
  localize: ((lang: string) => Say | null) | null = null;
  private say(lang?: string): Say {
    return (lang && this.localize?.(lang)) || ukrainian;
  }
  private lastMail = new Map<string, number>();

  /** A one-time link of `kind` for `u`, sent to `email`. `base` is the site's address. */
  private async sendLink(u: UserRow, kind: TokenRow['kind'], email: string, base: string, lang?: string): Promise<MailSent> {
    const key = `${kind}:${u.id}`;
    if (this.now() - (this.lastMail.get(key) ?? 0) < MAIL_GAP_MS) {
      throw new ApiError(429, 'Лист уже надіслано. Зачекайте хвилину, перш ніж просити ще один.');
    }
    if (this.lastMail.size > 10_000) this.lastMail.clear();
    this.lastMail.set(key, this.now());
    // A new link replaces the old ones of the same kind.
    await this.store.deleteUserTokens(u.id, kind);
    const token = randomId(32);
    await this.store.insertToken({ hash: await sha256(token), userId: u.id, kind, email, expiresAt: this.now() + LINK_TTL[kind] });
    const link = `${base}#/${kind}/${token}`;
    const mail = kind === 'reset' ? resetMail(this.say(lang), base, u.name, email, link) : verifyMail(this.say(lang), base, u.name, email, link);
    if (this.mailer) await this.mailer(mail);
    else if (!this.showLinks) console.log(`[mail to ${email}] ${mail.subject}: ${link}`);
    return this.showLinks ? { sent: true, link } : { sent: true };
  }

  /** The valid link token of `kind`, used up; null when it is unknown, expired or of another kind. */
  private async takeLink(token: string, kind: TokenRow['kind']): Promise<{ t: TokenRow; u: UserRow } | null> {
    if (!/^[a-f0-9]{64}$/.test(token)) return null;
    const t = await this.store.takeToken(await sha256(token));
    if (!t || t.kind !== kind || t.expiresAt < this.now()) return null;
    const u = await this.store.getUser(t.userId);
    // The address changed since the link was sent: it no longer proves anything.
    if (!u || u.deleted || u.email !== t.email) return null;
    return { t, u };
  }

  /**
   * "Forgot password": a reset link to the address, if an account has it.
   * The answer is the same either way, so nobody can test which e-mails are registered.
   */
  async requestPasswordReset(emailRaw: string, base: string, lang?: string): Promise<MailSent> {
    const email = emailRaw.trim().toLowerCase();
    if (!emailOk(email)) throw new ApiError(400, 'Вкажіть коректну пошту.');
    const u = await this.store.getUserByEmail(email);
    if (!u || u.deleted) return { sent: true };
    const sending = this.sendLink(u, 'reset', email, base, lang).catch((e) => {
      // Too soon or the mail service failed: still the same answer to the asker.
      if (!(e instanceof ApiError)) console.error('Reset mail failed:', e);
      return { sent: true } as MailSent;
    });
    // The demo shows the link, so it waits. A real letter goes out in the background:
    // waiting for the mail service would make known addresses answer slower than unknown ones.
    return this.showLinks ? sending : { sent: true };
  }

  /** A new password from a reset link: every other session ends, this browser is signed in. */
  async resetPassword(token: string, password: string): Promise<{ token: string; profile: Profile }> {
    const weak = passwordProblem(password);
    if (weak) throw new ApiError(400, weak);
    const link = await this.takeLink(token, 'reset');
    if (!link) throw new ApiError(400, 'Посилання недійсне або застаріло. Попросіть новий лист.');
    const { u } = link;
    const again = passwordProblem(password, u.email);
    if (again) throw new ApiError(400, again);
    // Opening the letter proves the address too.
    await this.store.updateUser(u.id, { passHash: await this.hasher.hash(password), emailVerified: true });
    await this.store.deleteUserSessions(u.id);
    await this.store.deleteUserTokens(u.id, 'reset');
    return { token: await this.newSession(u.id), profile: await this.profileOf(u.id) };
  }

  /** Send (again) the link that confirms the account's e-mail. */
  async sendVerification(token: string, base: string, lang?: string): Promise<MailSent> {
    const u = await this.auth(token);
    if (u.emailVerified) throw new ApiError(409, 'Пошту вже підтверджено.');
    return this.sendLink(u, 'verify', u.email, base, lang);
  }

  /** The confirmation link was opened (signed in or not). */
  async verifyEmail(token: string): Promise<{ email: string }> {
    const link = await this.takeLink(token, 'verify');
    if (!link) throw new ApiError(400, 'Посилання недійсне або застаріло. Надішліть новий лист із профілю.');
    await this.store.updateUser(link.u.id, { emailVerified: true });
    this.emit({ type: 'nudge', users: [link.u.id] });
    return { email: link.u.email };
  }

  private async checkPassword(u: UserRow, password: string): Promise<void> {
    if (!u.passHash || !(await this.hasher.verify(password.slice(0, 1024), u.passHash))) {
      throw new ApiError(403, 'Неправильний поточний пароль.');
    }
  }

  /** New password (knowing the current one): other devices are signed out, this one stays. */
  async changePassword(token: string, current: string, next: string): Promise<void> {
    const u = await this.auth(token);
    await this.checkPassword(u, current);
    const weak = passwordProblem(next, u.email);
    if (weak) throw new ApiError(400, weak);
    await this.store.updateUser(u.id, { passHash: await this.hasher.hash(next) });
    await this.store.deleteUserSessions(u.id, token);
    await this.store.deleteUserTokens(u.id, 'reset');
  }

  /** Move the account to another address; it has to be confirmed again. */
  async changeEmail(token: string, password: string, emailRaw: string, base: string, lang?: string): Promise<{ profile: Profile; mail: MailSent }> {
    const u = await this.auth(token);
    await this.checkPassword(u, password);
    const email = emailRaw.trim().toLowerCase();
    if (!emailOk(email)) throw new ApiError(400, 'Вкажіть коректну пошту.');
    if (email === u.email) throw new ApiError(400, 'Це ваша поточна пошта.');
    if (await this.store.getUserByEmail(email)) throw new ApiError(409, 'Ця пошта вже зайнята іншим акаунтом.');
    const old = u.email;
    await this.store.updateUser(u.id, { email, emailVerified: false });
    await this.store.deleteUserTokens(u.id);
    this.lastMail.delete(`verify:${u.id}`);
    const moved = { ...u, email, emailVerified: false };
    let mail: MailSent = { sent: false };
    try {
      mail = await this.sendLink(moved, 'verify', email, base, lang);
      // The old address learns about it: if it was not its owner, they know at once.
      if (this.mailer) await this.mailer(emailChangedMail(this.say(lang), base, u.name, old, email)).catch(() => undefined);
    } catch (e) {
      console.error('Verification mail failed:', e);
    }
    return { profile: await this.profileOf(u.id), mail };
  }

  /** Sign out everywhere else (a lost phone, a shared computer). */
  async logoutOthers(token: string): Promise<void> {
    const u = await this.auth(token);
    await this.store.deleteUserSessions(u.id, token);
  }

  /**
   * Delete the account: open games are resigned, friends and challenges go,
   * the e-mail, name and password are erased. Finished games stay in the
   * opponents' history under "Видалений гравець".
   */
  async deleteAccount(token: string, password: string): Promise<void> {
    const u = await this.auth(token);
    await this.checkPassword(u, password);
    await this.eraseUser(u);
  }

  /** Open games resigned, the search for a game dropped (the player leaves the game: ban, deletion). */
  private async leaveGames(u: UserRow): Promise<void> {
    for (const p of await this.store.listPvp(u.id, 200)) {
      if (p.status === 'active') await this.resignPvp(p, p.whiteId === u.id ? 'w' : 'b').catch(() => undefined);
    }
    await this.store.deleteSeek(u.id);
  }

  /** The deletion itself (by the player or by an admin). */
  private async eraseUser(u: UserRow): Promise<void> {
    await this.leaveGames(u);
    for (const f of await this.store.listFriends(u.id)) await this.store.deleteFriend(f.id);
    for (const c of await this.store.listChallenges(u.id)) {
      if (c.status === 'pending') await this.store.updateChallenge(c.id, { status: 'cancelled' });
    }
    await this.store.updateUser(u.id, {
      // Not an e-mail at all: nobody can register it and claim the account.
      email: `deleted:${u.id}`,
      name: 'Видалений гравець',
      passHash: null,
      emailVerified: false,
      avatar: 'pawn-classic',
      deleted: true,
    });
    await this.store.deleteUserTokens(u.id);
    await this.store.deleteUserSessions(u.id);
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
    if (!u || u.deleted) throw new ApiError(401, 'Акаунт не знайдено.');
    if (u.bannedUntil > this.now()) throw banError(u);
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

  /** The game's owner: an admin from ADMIN_EMAILS. Nobody can ban, delete or demote them. */
  private isOwner(u: UserRow): boolean {
    return this.admins.includes(u.email);
  }

  /**
   * The player an admin wants to ban, delete, log out or change the role of.
   * Not oneself, never the owner, and another admin only by the owner.
   */
  private async managed(me: UserRow, userId: string): Promise<UserRow> {
    const u = await this.store.getUser(userId);
    if (!u || u.deleted) throw new ApiError(404, 'Гравця не знайдено.');
    if (u.id === me.id) throw new ApiError(400, 'Це ваш власний акаунт.');
    if (this.isOwner(u)) throw new ApiError(403, 'Власника гри змінити не можна.');
    if (u.role === 'admin' && !this.isOwner(me)) throw new ApiError(403, 'Інших адміністраторів може змінювати лише власник гри.');
    return u;
  }

  private async profileOf(userId: string): Promise<Profile> {
    const u = (await this.store.getUser(userId))!;
    return {
      id: u.id,
      email: u.email,
      emailVerified: u.emailVerified,
      nameChangeAt: u.nameChangedAt && u.nameChangedAt + NAME_CHANGE_MS > this.now() ? u.nameChangedAt + NAME_CHANGE_MS : 0,
      name: u.name,
      role: u.role,
      owner: this.isOwner(u),
      notice: u.notice ? (JSON.parse(u.notice) as Notice) : null,
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
      freePack: u.freePackDay !== this.today(),
      achievements: (await this.achievementList(u)).filter((a) => a.done).map((a) => a.id),
      title: this.titleOf(u),
    };
  }

  // ── Achievements ──

  /** The player's achievement record; old accounts start their counters from what the profile already counts. */
  private achState(u: UserRow): AchievementState {
    const a = parseAchievements(u.achievements);
    a.stats.wins ??= u.wins;
    a.stats.games ??= u.wins + u.losses + u.draws;
    return a;
  }

  private async achievementList(u: UserRow): Promise<AchievementView[]> {
    return achievementViews(this.achState(u), {
      cards: (await this.store.listCards(u.id)).filter((c) => CARD_BY_ID[c.cardId] && !CARD_BY_ID[c.cardId].trialOnly).length,
      botLeague: leagueIndex('bot', Math.max(u.botBest, u.botTrophies)),
      pvpLeague: leagueIndex('pvp', Math.max(u.bestTrophies, u.trophies)),
    });
  }

  /** The plate shown under the name: an achievement the player has reached. */
  private titleOf(u: UserRow): string | null {
    return u.title && ACHIEVEMENT_BY_ID[u.title] ? u.title : null;
  }

  /**
   * Count what happened (counters up, feats in) and return the achievements
   * this reached for the first time.
   */
  private async achieve(userId: string, add: Partial<Record<CountedStat, number>>, feats: string[] = []): Promise<string[]> {
    const u = await this.store.getUser(userId);
    if (!u || u.deleted) return [];
    const before = new Set((await this.achievementList(u)).filter((a) => a.done).map((a) => a.id));
    const st = this.achState(u);
    for (const [k, n] of Object.entries(add) as [CountedStat, number][]) st.stats[k] = (st.stats[k] ?? 0) + n;
    for (const f of feats) if (ACHIEVEMENT_BY_ID[f] && !st.feats.includes(f)) st.feats.push(f);
    const next = { ...u, achievements: JSON.stringify(st) };
    await this.store.updateUser(userId, { achievements: next.achievements });
    return (await this.achievementList(next)).filter((a) => a.done && !before.has(a.id)).map((a) => a.id);
  }

  /** A finished game for one player: counters and the feats found in its record. */
  private async gameAchievements(userId: string, decks: Record<Color, Deck>, actions: Action[], color: Color, outcome: 'win' | 'loss' | 'draw', pvp: boolean): Promise<string[]> {
    const won = outcome === 'win';
    return this.achieve(userId, { games: 1, wins: won ? 1 : 0, pvpWins: won && pvp ? 1 : 0 }, gameFeats(decks, actions, color, won));
  }

  async achievements(token: string): Promise<AchievementView[]> {
    return this.achievementList(await this.auth(token));
  }

  /** Put an achievement's plate under the name (null: none). */
  async setTitle(token: string, id: string | null): Promise<Profile> {
    const u = await this.auth(token);
    if (id) {
      const a = (await this.achievementList(u)).find((x) => x.id === id);
      if (!a?.done) throw new ApiError(400, 'Спершу здобудьте це досягнення.');
    }
    await this.store.updateUser(u.id, { title: id ?? '' });
    return this.profileOf(u.id);
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
    if (status === 'won') await this.achieve(userId, { trials: 1 }, t.id === 'comet' ? ['comet-path'] : []);
    return { name: t.name, wins, rounds: t.opponents.length, status, reward, card };
  }

  /** Pay the entry fee and start a fresh run. */
  async enterTrial(token: string, id: string): Promise<Profile> {
    const u = await this.auth(token);
    const t = trialById(id);
    if (!t) throw new ApiError(404, 'Такого випробування немає.');
    if (this.trialRuns(u)[id]?.status === 'active') throw new ApiError(409, 'Ви вже проходите це випробування.');
    if (u.shards < t.cost) throw new ApiError(400, `Вхід коштує ${t.cost} уламків, у вас ${u.shards}.`);
    await this.store.updateUser(u.id, { shards: u.shards - t.cost });
    await this.saveRun(u, { id, wins: 0, status: 'active' });
    return this.profileOf(u.id);
  }

  /** Admin testing: pick the ranked bot's level (null = by arena). */
  async setBotOverride(token: string, level: number | null): Promise<Profile> {
    const u = await this.admin(token);
    await this.store.updateUser(u.id, { botOverride: level === null || !Number.isFinite(level) ? -1 : Math.max(0, Math.min(BOT_LEVELS.length - 1, Math.round(level))) });
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

  /** The signed-in user's id (the WebSocket hub checks a connection's session with it). */
  async userIdOf(token: string): Promise<string> {
    return (await this.auth(token)).id;
  }

  /** The player has read the notice: it is not shown again. */
  async dismissNotice(token: string): Promise<Profile> {
    const u = await this.auth(token);
    if (u.notice) await this.store.updateUser(u.id, { notice: '' });
    return this.profileOf(u.id);
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
    await this.achieve(u.id, { packs: 1 });
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
    if (type === 'starter' || !Object.hasOwn(PACK_SHARD_PRICE, type)) throw new ApiError(400, 'Такого паку в магазині немає.');
    const price = PACK_SHARD_PRICE[type];
    if (u.shards < price) throw new ApiError(400, `Потрібно ${price} уламків, у вас ${u.shards}.`);
    await this.store.updateUser(u.id, { shards: u.shards - price });
    const pack = this.view(await this.createPack(u.id, type, 'Магазин'));
    return { pack, profile: await this.profileOf(u.id) };
  }

  /** The free common pack of the day (once per UTC day); it lands with the other ready packs. */
  async claimFreePack(token: string): Promise<{ pack: PackView; profile: Profile }> {
    const u = await this.auth(token);
    const today = this.today();
    if (u.freePackDay === today) throw new ApiError(400, 'Безкоштовний пак сьогодні вже забрано. Новий буде завтра.');
    await this.store.updateUser(u.id, { freePackDay: today });
    const pack = this.view(await this.createPack(u.id, FREE_PACK, 'Подарунок дня'));
    return { pack, profile: await this.profileOf(u.id) };
  }

  // ── Shards for real money ──

  /** The payment service (Paddle on the server, test payments in the demo); null: not on sale. */
  payments: PaymentProvider | null = null;

  /** Sales open to admins only (the server sets it until PAYMENTS_PUBLIC=1): others do not see the shards for money. */
  paymentsAdminOnly = false;

  private async canBuy(token: string | null | undefined): Promise<boolean> {
    if (!this.paymentsAdminOnly) return true;
    const u = await this.auth(token).catch(() => null);
    return u?.role === 'admin';
  }

  async shardOffer(token?: string | null): Promise<ShardOffer> {
    if (!(await this.canBuy(token))) return { products: [], enabled: false, test: false, checkout: null, hidden: true };
    const u = await this.auth(token).catch(() => null);
    const paid = u ? await this.paidProducts(u.id) : new Set<string>();
    return {
      products: SHARD_PRODUCTS.filter((p) => !p.once || !paid.has(p.id)),
      enabled: !!this.payments,
      test: this.payments?.id === 'test',
      checkout: this.payments?.client ?? null,
      hidden: false,
    };
  }

  /** Products this player has paid for (refunded ones count: a one-time offer is used up). */
  private async paidProducts(userId: string): Promise<Set<string>> {
    const list = await this.store.listPurchases(userId, 1000);
    return new Set(list.filter((p) => p.status === 'paid' || p.status === 'refunded').map((p) => p.product));
  }

  private purchaseView(p: PurchaseRow): PurchaseView {
    return { id: p.id, product: p.product, shards: p.shards, amount: p.amount, ccy: p.ccy, status: p.status, createdAt: p.createdAt };
  }

  /**
   * Start a purchase: a journal entry first (so nothing paid is ever
   * unaccounted for), then the invoice at the payment service. The player
   * pays on the service's page; the shards come when the service confirms.
   */
  async buyShards(token: string, productId: string, base: string): Promise<{ purchaseId: string; pageUrl: string }> {
    const u = await this.auth(token);
    if (!this.payments || !(await this.canBuy(token))) throw new ApiError(503, 'Покупки за гроші поки недоступні.');
    const product = productById(productId);
    if (!product) throw new ApiError(404, 'Такого набору немає.');
    const paid = await this.paidProducts(u.id);
    if (product.once && paid.has(product.id)) throw new ApiError(400, 'Цю пропозицію вже куплено.');
    const recent = (await this.store.listPurchases(u.id, 20)).filter((p) => p.status === 'pending' && this.now() - p.createdAt < 60 * 60_000);
    if (recent.length >= 5) throw new ApiError(429, 'Забагато незавершених оплат. Завершіть одну з них або спробуйте за годину.');
    const p: PurchaseRow = {
      id: randomId(10),
      userId: u.id,
      product: product.id,
      shards: product.shards,
      amount: product.price,
      ccy: product.ccy,
      provider: this.payments.id,
      providerId: null,
      status: 'pending',
      createdAt: this.now(),
      updatedAt: this.now(),
    };
    await this.store.insertPurchase(p);
    try {
      const inv = await this.payments.createInvoice({
        purchaseId: p.id,
        base,
        amount: p.amount,
        ccy: p.ccy,
        title: `Ultrachess: ${product.shards} shards${product.pack ? ` + ${product.pack} pack` : ''}`,
        redirectUrl: `${base}#/shop/paid/${p.id}`,
        webhookUrl: `${base}api/payments/${this.payments.id}/webhook`,
      });
      await this.store.updatePurchase(p.id, { providerId: inv.providerId, updatedAt: this.now() });
      return { purchaseId: p.id, pageUrl: inv.pageUrl };
    } catch (e) {
      console.error('Invoice failed:', e);
      await this.store.settlePurchase(p.id, 'pending', 'failed', 0, this.now());
      throw new ApiError(502, 'Платіжний сервіс не відповів. Спробуйте ще раз за хвилину.');
    }
  }

  /**
   * What the payment service says about a purchase, applied: paid credits the
   * shards (once — the status move is atomic), a refund takes them back, a
   * failure or expiry closes it. Anything else changes nothing.
   */
  private async applyPayment(p: PurchaseRow, st: ProviderState): Promise<void> {
    let done = false;
    if (st.status === 'paid' && p.status === 'pending') {
      if (st.amount !== null && (st.amount !== p.amount || st.ccy !== p.ccy)) {
        // Never credit a different sum: leave it for a person to look at.
        console.error(`Payment ${p.id}: paid ${st.amount} ${st.ccy}, expected ${p.amount} ${p.ccy}. Not credited.`);
        done = await this.store.settlePurchase(p.id, 'pending', 'failed', 0, this.now());
      } else {
        done = await this.store.settlePurchase(p.id, 'pending', 'paid', p.shards, this.now());
        // A pack in the offer comes once, with the shards (a refund later takes back the shards only).
        const pack = productById(p.product)?.pack;
        if (done && pack) await this.createPack(p.userId, pack, 'Спецпропозиція');
      }
    } else if ((st.status === 'failed' || st.status === 'expired') && p.status === 'pending') {
      done = await this.store.settlePurchase(p.id, 'pending', st.status, 0, this.now());
    } else if (st.status === 'refunded' && p.status === 'paid') {
      // The shards go back even if spent: the balance may go below zero until earned again.
      done = await this.store.settlePurchase(p.id, 'paid', 'refunded', -p.shards, this.now());
    } else if (st.status === 'refunded' && p.status === 'pending') {
      done = await this.store.settlePurchase(p.id, 'pending', 'refunded', 0, this.now());
    }
    if (done) this.emit({ type: 'nudge', users: [p.userId] });
  }

  /**
   * The payment service's notice (its signature already checked by the
   * server). `purchaseId` is our reference inside it; the invoice id, when the
   * notice carries it, must match.
   */
  async paymentNotice(provider: string, purchaseId: string, providerId: string | null, st: ProviderState): Promise<void> {
    const p = await this.store.getPurchase(purchaseId);
    if (!p || p.provider !== provider || (providerId !== null && p.providerId !== providerId)) {
      console.warn(`Payment notice for an unknown purchase: ${provider} ${purchaseId} ${providerId}`);
      return;
    }
    await this.applyPayment(p, st);
  }

  /** A purchase of mine; while it waits, ask the payment service too (a lost notice must not lose shards). */
  async purchase(token: string, id: string): Promise<{ purchase: PurchaseView; profile: Profile }> {
    const u = await this.auth(token);
    let p = await this.store.getPurchase(id);
    if (!p || p.userId !== u.id) throw new ApiError(404, 'Покупку не знайдено.');
    if (p.status === 'pending' && p.providerId && this.payments?.id === p.provider && this.payments.id !== 'test') {
      try {
        await this.applyPayment(p, await this.payments.status(p.providerId));
        p = (await this.store.getPurchase(id))!;
      } catch (e) {
        console.error('Payment status check failed:', e);
      }
    }
    return { purchase: this.purchaseView(p), profile: await this.profileOf(u.id) };
  }

  async purchases(token: string): Promise<PurchaseView[]> {
    const u = await this.auth(token);
    return (await this.store.listPurchases(u.id, 50)).map((p) => this.purchaseView(p));
  }

  /** The test payment page: Pay or Decline (test payments only). */
  async completeTestPayment(token: string, id: string, ok: boolean): Promise<{ purchase: PurchaseView; profile: Profile }> {
    const u = await this.auth(token);
    if (this.payments?.id !== 'test') throw new ApiError(404, 'Тестових оплат тут немає.');
    const p = await this.store.getPurchase(id);
    if (!p || p.userId !== u.id || p.provider !== 'test') throw new ApiError(404, 'Покупку не знайдено.');
    await this.applyPayment(p, { status: ok ? 'paid' : 'failed', amount: p.amount, ccy: p.ccy });
    return this.purchase(token, id);
  }

  /** Every purchase, newest first, with the buyer (admin). */
  async adminPurchases(token: string): Promise<(PurchaseView & { email: string; name: string; price: string })[]> {
    await this.admin(token);
    const out = [];
    for (const p of await this.store.listAllPurchases(200)) {
      const u = await this.store.getUser(p.userId);
      out.push({ ...this.purchaseView(p), email: u?.email ?? '', name: u?.name ?? '', price: formatPrice(p.amount) });
    }
    return out;
  }

  /**
   * Remove an entry from the purchase journal (owner only), e.g. the test
   * purchases from the sandbox. The shards it brought stay with the player.
   */
  async adminDeletePurchase(token: string, id: string): Promise<void> {
    const me = await this.admin(token);
    if (!this.isOwner(me)) throw new ApiError(403, 'Видаляти покупки з журналу може лише власник гри.');
    if (!(await this.store.getPurchase(id))) throw new ApiError(404, 'Такої покупки немає.');
    await this.store.deletePurchase(id);
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

  async saveDeck(token: string, input: Deck): Promise<Deck[]> {
    const u = await this.auth(token);
    const deck = cleanDeck(input);
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
      const recent = (await this.store.listMatches(u.id, 50)).filter((x) => x.status === 'active');
      if (opts.ranked) {
        // An unfinished bot-ladder game goes on: leaving a lost game must not save the trophies.
        const open = recent.find((x) => this.modeOf(x) === 'bot');
        if (open) return this.matchStart(open);
      } else {
        // Training has no stakes: a new game closes the ones left open (no result, not in history).
        for (const x of recent) if (this.modeOf(x) === 'training') await this.store.updateMatch(x.id, { status: 'finished' });
      }
      const decks = await this.store.listDecks(u.id);
      const d = decks.find((x) => x.id === (opts.deckId ?? u.activeDeckId)) ?? decks[0];
      if (!d) throw new ApiError(400, 'Спочатку зберіть колоду.');
      const owned = await this.ownedSet(u.id);
      if (deckPositions(d.deck).some((id) => !owned.has(id))) throw new ApiError(400, 'У колоді є картки, яких немає в колекції.');
      playerDeck = d.deck;
      const league = BOT_LEAGUES[leagueIndex('bot', u.botTrophies)];
      botLevel = opts.ranked ? this.rankedBot(u) : Math.max(0, Math.min(BOT_LEVELS.length - 1, Math.round(Number.isFinite(opts.level) ? opts.level! : 2)));
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
      view: this.matchView(m, this.replayMatch(m), m.actions.length),
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

  private matchView(m: MatchRow, state: MatchState, n: number): GameView {
    return this.gameView(`match:${m.id}`, state, m.color, n, m.status === 'active');
  }

  private replayMatch(m: MatchRow): MatchState {
    return this.replay(
      `match:${m.id}`,
      m.actions,
      () => (m.color === 'w' ? createMatch(m.playerDeck, m.botDeck) : createMatch(m.botDeck, m.playerDeck)),
      `${m.color}:${JSON.stringify(m.playerDeck)}:${JSON.stringify(m.botDeck)}`,
    );
  }

  /**
   * Replaying a long game costs a few hundred milliseconds (every action is
   * checked with the engine), and the server would do it on every poll. Game
   * records only ever grow, so the last state of each game is kept and only
   * the new actions are played on top of it.
   */
  private replays = new Map<string, { n: number; state: MatchState; sig: string }>();

  // ── Views ──

  /** Opaque ids of hidden pieces, per game (stable while the server runs). */
  private opaqueIds = new Map<string, Map<string, string>>();
  /** The current version token of each game. */
  private versions = new Map<string, { n: number; v: string }>();

  private opaqueFor(key: string): (id: string) => string {
    let ids = this.opaqueIds.get(key);
    if (!ids) {
      ids = new Map();
      this.opaqueIds.set(key, ids);
      if (this.opaqueIds.size > REPLAY_CACHE) this.opaqueIds.delete(this.opaqueIds.keys().next().value!);
    }
    const map = ids;
    return (id) => {
      let x = map.get(id);
      if (!x) map.set(id, (x = `x${randomId(5)}`));
      return x;
    };
  }

  private versionOf(key: string, n: number): string {
    const cur = this.versions.get(key);
    if (cur && cur.n === n) return cur.v;
    const v = randomId(6);
    this.versions.delete(key);
    this.versions.set(key, { n, v });
    if (this.versions.size > REPLAY_CACHE * 4) this.versions.delete(this.versions.keys().next().value!);
    return v;
  }

  private gameView(key: string, state: MatchState, viewer: Color | null, n: number, active: boolean): GameView {
    const canAct = active && viewer !== null && !state.result && state.turn === viewer;
    return {
      you: viewer,
      state: secureState(state, viewer, this.opaqueFor(key)),
      legal: canAct ? legalMoves(state) : [],
      v: canAct ? this.versionOf(key, n) : '',
    };
  }

  /** Live updates: the server's WebSocket hub listens; the browser demo polls instead. */
  onEvent: ((e: ServiceEvent) => void) | null = null;

  private emit(e: ServiceEvent): void {
    try {
      this.onEvent?.(e);
    } catch (err) {
      console.error('Event listener failed:', err);
    }
  }

  /** `sig` describes the game's setup: a cached state of a different setup is not reused. */
  private replay(key: string, actions: Action[], fresh: () => MatchState, sig = ''): MatchState {
    const cached = this.replays.get(key);
    const hit = cached && cached.n <= actions.length && cached.sig === sig ? cached : null;
    let state = hit ? hit.state : fresh();
    for (let i = hit ? hit.n : 0; i < actions.length; i++) state = performAction(state, actions[i]);
    // Most recently used last; the oldest entries go first.
    this.replays.delete(key);
    this.replays.set(key, { n: actions.length, state, sig });
    if (this.replays.size > REPLAY_CACHE) this.replays.delete(this.replays.keys().next().value!);
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
   * cannot make the bot lose; the answer is the player's view of the game.
   * `v` is the version of the view the player acted on: a stale action is
   * not played (`stale: true`, the answer is the current view). `action: null`
   * lets the bot move (it opens as white, or the game was resumed) and also
   * just fetches the view, e.g. after a reconnect.
   */
  async matchAction(token: string, matchId: string, action: Action | null, v: string): Promise<{ view: GameView; stale?: boolean }> {
    const u = await this.auth(token);
    const m = await this.store.getMatch(matchId);
    if (!m || m.userId !== u.id) throw new ApiError(404, 'Матч не знайдено.');
    let state = this.replayMatch(m);
    const n = m.actions.length;
    if (m.status !== 'active') return { view: this.matchView(m, state, n), stale: !!action };
    if (action && v !== this.versionOf(`match:${m.id}`, n)) return { view: this.matchView(m, state, n), stale: true };
    if (n > 3000) throw new ApiError(400, 'Забагато ходів.');
    const actions = [...m.actions];
    const botColor: Color = m.color === 'w' ? 'b' : 'w';
    if (action) {
      if (state.result) throw new ApiError(409, 'Партію завершено.');
      if (state.turn !== m.color) throw new ApiError(409, 'Зараз хід бота.');
      let clean: Action;
      try {
        clean = canonicalAction(state, action);
        state = performAction(state, clean);
      } catch {
        throw new ApiError(400, 'Такий хід неможливий.');
      }
      actions.push(clean);
    }
    // The bot answers until it is the player's turn again (or the game is over).
    for (let guard = 0; guard < 4 && !state.result && state.turn === botColor; guard++) {
      const r = await this.botTurn(state, botColor, m.botLevel);
      if (!r.actions.length) break;
      state = r.state;
      actions.push(...r.actions);
    }
    if (actions.length !== n && !(await this.store.updateMatch(m.id, { actions }, n))) {
      // Another request on this game got there first: answer with the stored game.
      const fresh = (await this.store.getMatch(m.id))!;
      return { view: this.matchView(fresh, this.replayMatch(fresh), fresh.actions.length), stale: true };
    }
    return { view: this.matchView(m, state, actions.length) };
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
    const decks: Record<Color, Deck> = m.color === 'w' ? { w: m.playerDeck, b: m.botDeck } : { w: m.botDeck, b: m.playerDeck };
    const achievements = await this.gameAchievements(u.id, decks, m.actions, m.color, outcome, false);
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
      achievements,
      profile: await this.profileOf(u.id),
    };
  }

  async leaderboard(): Promise<LeaderRow[]> {
    // Top 50 of each ladder (the page sorts by the one it shows).
    const all = (await this.store.listUsers(1000)).filter((u) => u.passHash && u.bannedUntil <= this.now());
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
    if (patch.name !== undefined && cleanName(patch.name) !== u.name) {
      const name = cleanName(patch.name);
      const bad = nameProblem(name);
      if (bad) throw new ApiError(400, bad);
      const wait = u.nameChangedAt + NAME_CHANGE_MS - this.now();
      if (u.nameChangedAt && wait > 0) {
        throw new ApiError(429, `Нікнейм можна змінювати раз на 7 днів. Наступна зміна — через ${Math.ceil(wait / 864e5)} дн.`);
      }
      next.name = name;
      next.nameChangedAt = this.now();
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
      title: this.titleOf(u),
    };
  }

  private async cardOf(id: string): Promise<PlayerCard> {
    const u = await this.store.getUser(id);
    if (!u) return { id, name: 'Гравець', tag: '', avatar: 'pawn-classic', trophies: 0, arena: '', online: false, lastSeen: 0, title: null };
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
      cards: (await this.store.listCards(u.id)).filter((c) => CARD_BY_ID[c.cardId] && !CARD_BY_ID[c.cardId].trialOnly).length,
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

  // ── Game archive ──

  /** A finished game of mine, whole: decks and every action, to replay. */
  async gameRecord(token: string, kind: string, id: string): Promise<GameRecord> {
    const u = await this.auth(token);
    if (kind === 'm') {
      const m = await this.store.getMatch(id);
      if (!m || m.userId !== u.id) throw new ApiError(404, 'Партію не знайдено.');
      if (m.status !== 'finished' || !m.result) throw new ApiError(409, 'Партія ще триває.');
      const r = JSON.parse(m.result) as { outcome: 'win' | 'loss' | 'draw'; reason: string; moves: number };
      const bot = m.color === 'w' ? 'b' : 'w';
      const me = { name: u.name, avatar: u.avatar };
      const them = { name: `Бот · ${botLevel(m.botLevel).name}`, avatar: null };
      return {
        kind: 'm',
        id,
        players: m.color === 'w' ? { w: me, b: them } : { w: them, b: me },
        myColor: m.color,
        decks: m.color === 'w' ? { w: m.playerDeck, b: m.botDeck } : { w: m.botDeck, b: m.playerDeck },
        actions: m.actions,
        result: { winner: r.outcome === 'draw' ? null : r.outcome === 'win' ? m.color : bot, reason: r.reason, moves: r.moves },
        at: m.createdAt,
      };
    }
    if (kind === 'p') {
      const { row, color } = await this.pvpFor(u.id, id);
      if (row.status !== 'finished' || !row.result) throw new ApiError(409, 'Партія ще триває.');
      const r = JSON.parse(row.result) as GameRecord['result'];
      const who = async (userId: string) => {
        const p = await this.store.getUser(userId);
        return { name: p?.name ?? 'Гравець', avatar: p?.avatar ?? null };
      };
      return {
        kind: 'p',
        id,
        players: { w: await who(row.whiteId), b: await who(row.blackId) },
        myColor: color,
        decks: { w: row.whiteDeck, b: row.blackDeck },
        actions: JSON.parse(row.actions) as Action[],
        result: { winner: r.winner, reason: r.reason, moves: r.moves },
        at: row.updatedAt,
      };
    }
    throw new ApiError(404, 'Партію не знайдено.');
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
    const view: FriendsView = { friends: [], incoming: [], outgoing: [], live: [] };
    for (const f of await this.store.listFriends(me.id)) {
      const other = f.fromId === me.id ? f.toId : f.fromId;
      const entry = { ...(await this.cardOf(other)), linkId: f.id };
      if (f.status === 'accepted') view.friends.push(entry);
      else if (f.toId === me.id) view.incoming.push(entry);
      else view.outgoing.push(entry);
    }
    view.friends.sort((a, b) => Number(b.online) - Number(a.online) || b.trophies - a.trophies);
    // Friends' games in progress, to watch (not your own: you play those).
    const seen = new Set<string>();
    for (const f of view.friends) {
      for (const p of await this.store.listPvp(f.id, 5)) {
        if (p.status !== 'active' || seen.has(p.id) || p.whiteId === me.id || p.blackId === me.id) continue;
        seen.add(p.id);
        view.live.push({
          id: p.id,
          white: await this.cardOf(p.whiteId),
          black: await this.cardOf(p.blackId),
          ranked: !!p.ranked,
          // Half-moves, not actions: the action count would give hidden ones away.
          moves: this.replayPvp(p).ply,
        });
      }
    }
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
    this.emit({ type: 'nudge', users: [userId] });
    return this.friends(token);
  }

  async respondFriend(token: string, linkId: string, accept: boolean): Promise<FriendsView> {
    const me = await this.auth(token);
    const link = (await this.store.listFriends(me.id)).find((f) => f.id === linkId);
    if (!link || link.toId !== me.id || link.status !== 'pending') throw new ApiError(404, 'Заявку не знайдено.');
    if (accept) await this.store.updateFriend(link.id, { status: 'accepted' });
    else await this.store.deleteFriend(link.id);
    this.emit({ type: 'nudge', users: [link.fromId] });
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
      // Only a game in progress needs replaying (whose turn is it); a finished one just counts its moves.
      const state = p.status === 'active' ? this.replayPvp(p) : null;
      const r = p.result ? (JSON.parse(p.result) as { winner: Color | null }) : null;
      games.push({
        id: p.id,
        opponent: await this.cardOf(color === 'w' ? p.blackId : p.whiteId),
        color,
        yourTurn: !!state && state.turn === color,
        status: p.status,
        outcome: !r ? null : r.winner === null ? 'draw' : r.winner === color ? 'win' : 'loss',
        // Half-moves, not actions or history lines: those would count the opponent's hidden actions.
        moves: state ? state.ply : (JSON.parse(p.actions) as unknown[]).length,
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
    this.emit({ type: 'nudge', users: [friendId] });
  }

  async respondChallenge(token: string, id: string, accept: boolean, deckId?: string): Promise<{ pvpId: string | null }> {
    const me = await this.auth(token);
    const c = await this.store.getChallenge(id);
    if (!c || c.status !== 'pending' || (c.toId !== me.id && c.fromId !== me.id)) throw new ApiError(404, 'Виклик не знайдено.');
    if (!accept || c.fromId === me.id) {
      await this.store.updateChallenge(c.id, { status: c.fromId === me.id ? 'cancelled' : 'declined' });
      this.emit({ type: 'nudge', users: [c.fromId === me.id ? c.toId : c.fromId] });
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
    this.emit({ type: 'matched', id: row.id, users: [c.fromId] });
    return { pvpId: row.id };
  }

  private replayPvp(p: PvpRow): MatchState {
    const state = this.replay(`pvp:${p.id}`, JSON.parse(p.actions) as Action[], () => createMatch(p.whiteDeck, p.blackDeck));
    return p.resignedBy && !state.result ? resign(state, p.resignedBy) : state;
  }

  private async pvpFor(userId: string, id: string): Promise<{ row: PvpRow; color: Color }> {
    const row = await this.store.getPvp(id);
    if (!row || (row.whiteId !== userId && row.blackId !== userId)) throw new ApiError(404, 'Матч не знайдено.');
    return { row, color: row.whiteId === userId ? 'w' : 'b' };
  }

  /** A player of the game, or anyone else as a spectator (game ids are unguessable: the link is the invitation). */
  private async pvpRole(userId: string, id: string): Promise<{ row: PvpRow; color: Color | null }> {
    const row = await this.store.getPvp(id);
    if (!row) throw new ApiError(404, 'Партію не знайдено.');
    return { row, color: row.whiteId === userId ? 'w' : row.blackId === userId ? 'b' : null };
  }

  private async pvpView(row: PvpRow, color: Color | null): Promise<PvpState> {
    const w = await this.store.getUser(row.whiteId);
    const b = await this.store.getUser(row.blackId);
    const result = row.result ? (JSON.parse(row.result) as { ladder?: Record<Color, LadderResult>; trial?: Record<Color, TrialResult>; achievements?: Record<Color, string[]> }) : null;
    return {
      id: row.id,
      color,
      captureFx: { w: captureFxById(w?.captureFx).id, b: captureFxById(b?.captureFx).id },
      white: await this.cardOf(row.whiteId),
      black: await this.cardOf(row.blackId),
      whiteDeck: row.whiteDeck,
      blackDeck: row.blackDeck,
      view: this.gameView(`pvp:${row.id}`, this.replayPvp(row), color, (JSON.parse(row.actions) as unknown[]).length, row.status === 'active'),
      status: row.status,
      resignedBy: row.resignedBy,
      ranked: !!row.ranked,
      ladder: color && result?.ladder?.[color] ? result.ladder[color] : null,
      trial: color && result?.trial?.[color] ? result.trial[color] : null,
      achievements: color ? (result?.achievements?.[color] ?? []) : [],
    };
  }

  /** A finished game's result; player-ladder games also settle trophies and rewards for both. */
  /** `actions`: the game's whole record when it is newer than the row's (the last move not written into `row`). */
  private async pvpResult(row: PvpRow, state: MatchState, actions: Action[] = JSON.parse(row.actions) as Action[]): Promise<string> {
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
    const achievements: Partial<Record<Color, string[]>> = {};
    for (const [id, c] of [[row.whiteId, 'w'], [row.blackId, 'b']] as [string, Color][]) {
      const outcome = winner === null ? 'draw' : winner === c ? 'win' : 'loss';
      achievements[c] = await this.gameAchievements(id, { w: row.whiteDeck, b: row.blackDeck }, actions, c, outcome, true);
    }
    out.achievements = achievements;
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
      this.emit({ type: 'matched', id: row.id, users: [other.userId] });
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
    this.emit({ type: 'game', id: row.id, users: [row.whiteId, row.blackId] });
    return this.pvpView({ ...row, ...patch }, color);
  }

  /** The game for a player, or for a spectator (anyone signed in who has the game's link). */
  async pvpState(token: string, id: string): Promise<PvpState> {
    const me = await this.auth(token);
    const { row, color } = await this.pvpRole(me.id, id);
    return this.pvpView(row, color);
  }

  /**
   * Play one action in a player game. The server replays the game and checks
   * that it is this player's turn, that `v` is the version they saw, and that
   * the action is legal. Then everyone watching gets the new view.
   */
  async pvpAction(token: string, id: string, action: Action, v: string): Promise<PvpState> {
    const me = await this.auth(token);
    const { row, color } = await this.pvpFor(me.id, id);
    if (row.status !== 'active') throw new ApiError(409, 'Партію завершено.');
    const actions = JSON.parse(row.actions) as Action[];
    const expected = actions.length;
    if (v !== this.versionOf(`pvp:${row.id}`, expected)) throw new ApiError(409, 'Позиція змінилась — оновлюємо партію.');
    const state = this.replayPvp(row);
    if (state.turn !== color) throw new ApiError(409, 'Зараз хід суперника.');
    let next: MatchState;
    let clean: Action;
    try {
      // The record keeps the engine's own form of the action, not what the client sent.
      clean = canonicalAction(state, action);
      next = performAction(state, clean);
    } catch {
      throw new ApiError(400, 'Такий хід неможливий.');
    }
    actions.push(clean);
    // A hidden action (Безсмертна, Підказка) must not even show as "the opponent did something".
    const hidden = next.history[next.history.length - 1]?.text === null;
    const patch: Partial<PvpRow> = { actions: JSON.stringify(actions), updatedAt: hidden ? row.updatedAt : this.now() };
    if (!(await this.store.updatePvp(row.id, patch, expected))) throw new ApiError(409, 'Позиція змінилась — оновлюємо партію.');
    if (next.result) {
      // Settle only after the move is written, so a race cannot pay twice.
      const fin: Partial<PvpRow> = { status: 'finished', result: await this.pvpResult(row, next, actions) };
      await this.store.updatePvp(row.id, fin);
      Object.assign(patch, fin);
    }
    if (next.result) await this.pvpQuests(row, next.result.winner);
    this.emit({ type: 'game', id: row.id, users: [row.whiteId, row.blackId] });
    return this.pvpView({ ...row, ...patch }, color);
  }

  async pvpResign(token: string, id: string): Promise<PvpState> {
    const me = await this.auth(token);
    const { row, color } = await this.pvpFor(me.id, id);
    if (row.status !== 'active') throw new ApiError(409, 'Партію завершено.');
    return this.pvpView(await this.resignPvp(row, color), color);
  }

  /** `color` gives up an active game (by the player, or because they were banned or deleted). */
  private async resignPvp(row: PvpRow, color: Color): Promise<PvpRow> {
    const state = resign(this.replayPvp(row), color);
    const patch: Partial<PvpRow> = {
      status: 'finished',
      resignedBy: color,
      updatedAt: this.now(),
      result: await this.pvpResult(row, state),
    };
    await this.store.updatePvp(row.id, patch);
    await this.pvpQuests(row, state.result!.winner);
    this.emit({ type: 'game', id: row.id, users: [row.whiteId, row.blackId] });
    return { ...row, ...patch };
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
    const users = (await this.store.listUsers(500)).filter((u) => !u.deleted);
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
        cards: (await this.store.listCards(u.id)).filter((c) => CARD_BY_ID[c.cardId] && !CARD_BY_ID[c.cardId].trialOnly).length,
        gold: u.gold,
        shards: u.shards,
        claimed: !!u.passHash,
        owner: this.isOwner(u),
        emailVerified: u.emailVerified,
        createdAt: u.createdAt,
        lastSeen: u.lastSeen,
        online: this.now() - u.lastSeen < ONLINE_MS,
        bannedUntil: u.bannedUntil > this.now() ? u.bannedUntil : 0,
        banReason: u.bannedUntil > this.now() ? u.banReason : '',
      });
    }
    return out.sort((a, b) => b.trophies - a.trophies);
  }

  async adminGrantPack(token: string, userId: string, type: PackType): Promise<void> {
    await this.admin(token);
    if (!(await this.store.getUser(userId))) throw new ApiError(404, 'Гравця не знайдено.');
    if (!Object.hasOwn(PACK_SHARD_PRICE, type) && type !== 'starter') throw new ApiError(400, 'Такого паку немає.');
    await this.createPack(userId, type, 'Подарунок адміністратора');
  }

  async adminGrantAllCards(token: string, userId: string): Promise<void> {
    await this.admin(token);
    if (!(await this.store.getUser(userId))) throw new ApiError(404, 'Гравця не знайдено.');
    const owned = await this.ownedSet(userId);
    for (const c of CARDS) if (!owned.has(c.id)) await this.store.addCard(userId, c.id);
  }

  async adminSetTrophies(token: string, userId: string, trophies: number, ladder: Ladder = 'pvp'): Promise<void> {
    await this.admin(token);
    if (!Number.isFinite(trophies)) throw new ApiError(400, 'Вкажіть число кубків.');
    if (!(await this.store.getUser(userId))) throw new ApiError(404, 'Гравця не знайдено.');
    const t = Math.max(0, Math.round(trophies));
    await this.store.updateUser(userId, ladder === 'bot' ? { botTrophies: t } : { trophies: t });
  }

  /** Appointing and removing admins: the owner only. */
  async adminSetRole(token: string, userId: string, role: Role): Promise<void> {
    const me = await this.admin(token);
    if (!this.isOwner(me)) throw new ApiError(403, 'Призначати й знімати адміністраторів може лише власник гри.');
    if (role !== 'admin' && role !== 'player') throw new ApiError(400, 'Такої ролі немає.');
    await this.managed(me, userId);
    await this.store.updateUser(userId, { role });
  }

  /** Add (or, with negative numbers, take away) gold and shards; never below zero. */
  async adminGrantCurrency(token: string, userId: string, gold: number, shards: number): Promise<void> {
    await this.admin(token);
    const u = await this.store.getUser(userId);
    if (!u || u.deleted) throw new ApiError(404, 'Гравця не знайдено.');
    const n = (x: number) => (Number.isFinite(x) ? Math.max(-1e7, Math.min(1e7, Math.round(x))) : 0);
    await this.store.updateUser(userId, {
      gold: Math.max(0, u.gold + n(gold)),
      shards: Math.max(0, u.shards + n(shards)),
    });
  }

  /**
   * Ban for `hours` (null: for good). The player is signed out everywhere, their
   * open games are resigned and their search for a game dropped; signing in
   * shows the end date and the reason.
   */
  async adminBan(token: string, userId: string, hours: number | null, reason: string): Promise<void> {
    const me = await this.admin(token);
    const u = await this.managed(me, userId);
    if (hours !== null && !(Number.isFinite(hours) && hours > 0 && hours <= BAN_MAX_HOURS)) {
      throw new ApiError(400, 'Вкажіть строк бану.');
    }
    await this.store.updateUser(u.id, {
      bannedUntil: hours === null ? BAN_FOREVER : this.now() + Math.round(hours * 3_600_000),
      banReason: String(reason ?? '').trim().slice(0, 200),
    });
    await this.leaveGames(u);
    await this.store.deleteUserSessions(u.id);
  }

  /**
   * Give the player another nickname (theirs breaks the rules). They read who
   * renamed them and why on their next visit, and keep the new name for the
   * usual 7 days, so it cannot be changed straight back.
   */
  async adminRename(token: string, userId: string, nameRaw: string, reason: string): Promise<void> {
    const me = await this.admin(token);
    const u = await this.managed(me, userId);
    const name = cleanName(String(nameRaw ?? ''));
    const bad = nameProblem(name);
    if (bad) throw new ApiError(400, bad);
    if (name === u.name) throw new ApiError(400, 'У гравця вже такий нікнейм.');
    const notice: Notice = { kind: 'renamed', from: u.name, to: name, reason: String(reason ?? '').trim().slice(0, 200), at: this.now() };
    await this.store.updateUser(u.id, { name, nameChangedAt: this.now(), notice: JSON.stringify(notice) });
  }

  async adminUnban(token: string, userId: string): Promise<void> {
    const me = await this.admin(token);
    const u = await this.managed(me, userId);
    await this.store.updateUser(u.id, { bannedUntil: 0, banReason: '' });
  }

  /** Sign the player out on every device (e.g. after a stolen password). */
  async adminLogout(token: string, userId: string): Promise<void> {
    const me = await this.admin(token);
    const u = await this.managed(me, userId);
    await this.store.deleteUserSessions(u.id);
  }

  /** Delete the account as the player could (personal data erased, games stay for the opponents). */
  async adminDeleteUser(token: string, userId: string): Promise<void> {
    const me = await this.admin(token);
    await this.eraseUser(await this.managed(me, userId));
  }
}
