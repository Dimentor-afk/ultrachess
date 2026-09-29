// Game service: accounts, collection, packs, decks and ranked matches.
// The same code runs on the Node server (SQLite) and in the browser demo.

import { CARDS, CARD_BY_ID } from '../engine/cards';
import { DECK_SLOTS, classicDeck, deckPositions, validateDeck } from '../engine/deck';
import { type Action, type MatchState, createMatch, performAction, resign } from '../engine/match';
import type { Color, Deck, PieceType, Rarity } from '../engine/types';
import {
  ARENAS,
  DAILY_PACK_LIMIT,
  PACK_SHARD_PRICE,
  type PackType,
  RARITIES,
  type Rng,
  SHARDS_PER_DUPE,
  TROPHIES,
  WIN_GOLD,
  arenaFor,
  packGold,
  packName,
  rewardFor,
  rollPack,
} from './packs';
import { BOARD_THEMES, DEFAULT_THEME, themeById } from './themes';
import { type QuestEvent, type QuestView, addProgress, parseQuests, questViews } from './quests';
import { type Hasher, type PackRow, type PvpRow, type Role, type Store, type UserRow, randomId } from './store';

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
  arena: string;
  arenaIndex: number;
  nextArena: { name: string; minTrophies: number } | null;
  nextReward: PackType;
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
  /** Packs won today and the daily cap. */
  packsToday: number;
  packsLimit: number;
  quests: QuestView[];
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

export interface MatchStart {
  matchId: string;
  ranked: boolean;
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
  profile: Profile;
}

export interface LeaderRow {
  id: string;
  name: string;
  tag: string;
  avatar: string;
  trophies: number;
  wins: number;
  arena: string;
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
  kind: 'ranked' | 'training' | 'friend';
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
}

export interface PvpState {
  id: string;
  color: Color;
  you: PlayerCard;
  opponent: PlayerCard;
  whiteDeck: Deck;
  blackDeck: Deck;
  actions: Action[];
  status: 'active' | 'finished';
  resignedBy: Color | null;
}

export interface Inbox {
  friendRequests: number;
  challenges: number;
  yourTurn: number;
}

const ONLINE_MS = 2 * 60_000;

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  trophies: number;
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
    const arena = arenaFor(u.trophies);
    const i = ARENAS.indexOf(arena);
    const next = ARENAS[i + 1];
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      trophies: u.trophies,
      wins: u.wins,
      losses: u.losses,
      draws: u.draws,
      arena: arena.name,
      arenaIndex: i,
      nextArena: next ? { name: next.name, minTrophies: next.minTrophies } : null,
      nextReward: rewardFor(u.cycle),
      activeDeckId: u.activeDeckId,
      tag: tagOf(u),
      avatar: u.avatar,
      bestTrophies: Math.max(u.bestTrophies, u.trophies),
      createdAt: u.createdAt,
      gold: u.gold,
      shards: u.shards,
      themes: this.themesOf(u),
      boardTheme: themeById(u.boardTheme).id,
      packsToday: u.packsDay === this.today() ? u.packsToday : 0,
      packsLimit: DAILY_PACK_LIMIT,
      quests: questViews(parseQuests(u.quests, this.today())),
    };
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
        const pool = CARDS.filter((c) => c.pieceType === t && RARITIES.indexOf(c.rarity) <= cap);
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

  async startMatch(token: string, opts: { deckId?: string; ranked: boolean; level?: number }): Promise<MatchStart> {
    const u = await this.auth(token);
    const decks = await this.store.listDecks(u.id);
    const d = decks.find((x) => x.id === (opts.deckId ?? u.activeDeckId)) ?? decks[0];
    if (!d) throw new ApiError(400, 'Спочатку зберіть колоду.');
    const owned = await this.ownedSet(u.id);
    if (deckPositions(d.deck).some((id) => !owned.has(id))) throw new ApiError(400, 'У колоді є картки, яких немає в колекції.');
    const arena = arenaFor(u.trophies);
    const botLevel = opts.ranked ? arena.botLevel : Math.max(1, Math.min(3, opts.level ?? 2));
    const m = {
      id: randomId(8),
      userId: u.id,
      ranked: opts.ranked,
      color: (this.rng() < 0.5 ? 'w' : 'b') as Color,
      botLevel,
      playerDeck: d.deck,
      botDeck: opts.ranked ? this.botDeck(arena.botMaxRarity) : classicDeck('bot', 'Класична колода'),
      status: 'active' as const,
      result: null,
      createdAt: this.now(),
    };
    await this.store.insertMatch(m);
    return { matchId: m.id, ranked: m.ranked, color: m.color, botLevel, playerDeck: m.playerDeck, botDeck: m.botDeck };
  }

  /**
   * Finish a match. The server replays every action with the rules engine,
   * so an illegal or made-up game is rejected.
   */
  async finishMatch(token: string, matchId: string, actions: Action[], resigned: boolean): Promise<MatchFinish> {
    const u = await this.auth(token);
    const m = await this.store.getMatch(matchId);
    if (!m || m.userId !== u.id) throw new ApiError(404, 'Матч не знайдено.');
    if (m.status !== 'active') throw new ApiError(409, 'Матч уже завершено.');
    if (actions.length > 3000) throw new ApiError(400, 'Забагато ходів.');
    let state = m.color === 'w' ? createMatch(m.playerDeck, m.botDeck) : createMatch(m.botDeck, m.playerDeck);
    try {
      for (const a of actions) {
        if (state.result) break;
        state = performAction(state, a);
      }
    } catch {
      throw new ApiError(400, 'Запис партії не пройшов перевірку правил.');
    }
    if (!state.result) {
      if (!resigned) throw new ApiError(400, 'Партія ще не завершена.');
      state = resign(state, m.color);
    }
    const winner = state.result!.winner;
    const outcome: MatchFinish['outcome'] = winner === null ? 'draw' : winner === m.color ? 'win' : 'loss';

    let trophiesDelta = 0;
    let reward: PackView | null = null;
    let rewardSkipped = false;
    let goldDelta = 0;
    if (m.ranked) {
      trophiesDelta = outcome === 'win' ? TROPHIES.win : outcome === 'loss' ? TROPHIES.loss : TROPHIES.draw;
      trophiesDelta = Math.max(-u.trophies, trophiesDelta);
      const patch: Partial<UserRow> = {
        trophies: u.trophies + trophiesDelta,
        bestTrophies: Math.max(u.bestTrophies, u.trophies + trophiesDelta),
        wins: u.wins + (outcome === 'win' ? 1 : 0),
        losses: u.losses + (outcome === 'loss' ? 1 : 0),
        draws: u.draws + (outcome === 'draw' ? 1 : 0),
      };
      if (outcome === 'win') {
        goldDelta = WIN_GOLD;
        patch.gold = u.gold + WIN_GOLD;
        const today = this.today();
        const won = u.packsDay === today ? u.packsToday : 0;
        if (won < DAILY_PACK_LIMIT) {
          reward = this.view(await this.createPack(u.id, rewardFor(u.cycle), 'Перемога в рейтинговому матчі'));
          patch.cycle = u.cycle + 1;
          patch.packsToday = won + 1;
          patch.packsDay = today;
        } else {
          rewardSkipped = true;
        }
      }
      await this.store.updateUser(u.id, patch);
    }
    const events: QuestEvent[] = ['play'];
    if (outcome === 'win') events.push('win');
    if (outcome === 'win' && m.ranked) events.push('winRanked');
    await this.questEvent(u.id, events);
    await this.store.updateMatch(m.id, {
      status: 'finished',
      result: JSON.stringify({ outcome, reason: state.result!.reason, moves: state.result!.moves, trophiesDelta }),
    });
    return { outcome, reason: state.result!.reason, trophiesDelta, goldDelta, reward, rewardSkipped, profile: await this.profileOf(u.id) };
  }

  async leaderboard(): Promise<LeaderRow[]> {
    return (await this.store.listUsers(50))
      .filter((u) => u.passHash)
      .sort((a, b) => b.trophies - a.trophies || b.wins - a.wins)
      .slice(0, 50)
      .map((u) => ({
        id: u.id,
        name: u.name,
        tag: tagOf(u),
        avatar: u.avatar,
        trophies: u.trophies,
        wins: u.wins,
        arena: arenaFor(u.trophies).name,
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
      arena: arenaFor(u.trophies).name,
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
        kind: m.ranked ? 'ranked' : 'training',
        opponent: `Бот · рівень ${m.botLevel}`,
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
        kind: 'friend',
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
    return {
      id: row.id,
      color,
      you: await this.cardOf(color === 'w' ? row.whiteId : row.blackId),
      opponent: await this.cardOf(color === 'w' ? row.blackId : row.whiteId),
      whiteDeck: row.whiteDeck,
      blackDeck: row.blackDeck,
      actions: JSON.parse(row.actions),
      status: row.status,
      resignedBy: row.resignedBy,
    };
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
    if (next.result) {
      patch.status = 'finished';
      patch.result = JSON.stringify({ winner: next.result.winner, reason: next.result.reason, moves: next.result.moves });
    }
    if (!(await this.store.updatePvp(row.id, patch, expected))) throw new ApiError(409, 'Позиція змінилась — оновіть партію.');
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
      result: JSON.stringify({ winner: state.result!.winner, reason: state.result!.reason, moves: state.result!.moves }),
    };
    await this.store.updatePvp(row.id, patch);
    await this.pvpQuests(row, state.result!.winner);
    return this.pvpView({ ...row, ...patch }, color);
  }

  private async pvpQuests(row: PvpRow, winner: Color | null): Promise<void> {
    for (const [id, c] of [[row.whiteId, 'w'], [row.blackId, 'b']] as [string, Color][]) {
      await this.questEvent(id, winner === c ? ['play', 'friendGame', 'win'] : ['play', 'friendGame']);
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
    for (const p of await this.store.listPvp(me.id, 30)) {
      if (p.status === 'active' && this.replayPvp(p).turn === (p.whiteId === me.id ? 'w' : 'b')) yourTurn++;
    }
    return { friendRequests, challenges, yourTurn };
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

  async adminSetTrophies(token: string, userId: string, trophies: number): Promise<void> {
    await this.admin(token);
    await this.store.updateUser(userId, { trophies: Math.max(0, Math.round(trophies)) });
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
