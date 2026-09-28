// Game service: accounts, collection, packs, decks and ranked matches.
// The same code runs on the Node server (SQLite) and in the browser demo.

import { CARDS, CARD_BY_ID } from '../engine/cards';
import { DECK_SLOTS, classicDeck, deckPositions, validateDeck } from '../engine/deck';
import { type Action, createMatch, performAction, resign } from '../engine/match';
import type { Color, Deck, PieceType, Rarity } from '../engine/types';
import {
  ARENAS,
  EXCHANGE,
  PACKS,
  PACK_SLOTS,
  type PackType,
  RARITIES,
  type Rng,
  TROPHIES,
  arenaFor,
  packName,
  rewardFor,
  rollPack,
} from './packs';
import { type Hasher, type PackRow, type Role, type Store, type UserRow, randomId } from './store';

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
}

export interface PackView {
  id: string;
  type: PackType;
  name: string;
  slot: boolean;
  status: 'locked' | 'unlocking' | 'ready';
  unlockAt: number | null;
  unlockMinutes: number;
  source: string;
}

export interface Collection {
  owned: Record<string, { dupes: number }>;
}

export interface OpenResult {
  pack: PackView;
  cards: { cardId: string; isNew: boolean }[];
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
  reward: PackView | null;
  rewardSkipped: boolean;
  profile: Profile;
}

export interface LeaderRow {
  name: string;
  trophies: number;
  wins: number;
  arena: string;
}

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  trophies: number;
  wins: number;
  losses: number;
  cards: number;
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
    };
  }

  async me(token: string): Promise<Profile> {
    return this.profileOf((await this.auth(token)).id);
  }

  // ── Collection & packs ──

  async collection(token: string): Promise<Collection> {
    const u = await this.auth(token);
    const owned: Collection['owned'] = {};
    for (const c of await this.store.listCards(u.id)) owned[c.cardId] = { dupes: c.dupes };
    return { owned };
  }

  private async giveStarter(user: UserRow): Promise<void> {
    if (user.starterGiven) return;
    await this.store.updateUser(user.id, { starterGiven: true });
    await this.createPack(user.id, 'starter', false, 'Реєстрація');
  }

  private async createPack(userId: string, type: PackType, slot: boolean, source: string): Promise<PackRow> {
    const p: PackRow = {
      id: randomId(8),
      userId,
      type,
      slot,
      status: slot ? 'locked' : 'ready',
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
    let status = p.status as PackView['status'];
    if (status === 'unlocking' && p.unlockAt !== null && p.unlockAt <= this.now()) status = 'ready';
    return {
      id: p.id,
      type: p.type,
      name: packName(p.type),
      slot: p.slot,
      status,
      unlockAt: p.unlockAt,
      unlockMinutes: p.type === 'starter' ? 0 : PACKS[p.type].unlockMinutes,
      source: p.source,
    };
  }

  async packs(token: string): Promise<PackView[]> {
    const u = await this.auth(token);
    const list = (await this.store.listPacks(u.id)).filter((p) => p.status !== 'opened');
    // Finished timers become ready packs.
    for (const p of list) {
      if (p.status === 'unlocking' && p.unlockAt !== null && p.unlockAt <= this.now()) {
        await this.store.updatePack(p.id, { status: 'ready' });
        p.status = 'ready';
      }
    }
    return list.sort((a, b) => a.createdAt - b.createdAt).map((p) => this.view(p));
  }

  async startUnlock(token: string, packId: string): Promise<PackView[]> {
    const u = await this.auth(token);
    const all = await this.packs(token);
    const p = await this.store.getPack(packId);
    if (!p || p.userId !== u.id || p.status !== 'locked') throw new ApiError(400, 'Цей пак не можна відкривати.');
    if (all.some((x) => x.status === 'unlocking')) throw new ApiError(409, 'Одночасно відкривається лише один пак.');
    await this.store.updatePack(p.id, { status: 'unlocking', unlockAt: this.now() + PACKS[p.type as Exclude<PackType, 'starter'>].unlockMinutes * 6e4 });
    return this.packs(token);
  }

  async openPack(token: string, packId: string): Promise<OpenResult> {
    const u = await this.auth(token);
    await this.packs(token); // settle finished timers
    const p = await this.store.getPack(packId);
    if (!p || p.userId !== u.id) throw new ApiError(404, 'Пак не знайдено.');
    if (!(await this.store.claimPack(p.id, u.id, this.now()))) throw new ApiError(409, 'Пак ще не готовий.');
    const ids = rollPack(p.type, this.rng);
    const cards: OpenResult['cards'] = [];
    for (const id of ids) cards.push({ cardId: id, isNew: await this.store.addCard(u.id, id) });
    await this.store.updatePack(p.id, { result: JSON.stringify(ids) });
    if (p.type === 'starter') await this.ensureStarterDeck(u.id);
    return { pack: this.view({ ...p, status: 'ready' }), cards };
  }

  /** Trade identical duplicates for a pack (10 common → common pack, …). */
  async exchange(token: string, cardId: string): Promise<PackView> {
    const u = await this.auth(token);
    const card = CARD_BY_ID[cardId];
    const row = (await this.store.listCards(u.id)).find((c) => c.cardId === cardId);
    if (!card || !row) throw new ApiError(404, 'Картку не знайдено.');
    const rule = EXCHANGE[card.rarity];
    if (row.dupes < rule.need) throw new ApiError(400, `Потрібно ${rule.need} однакових повторок.`);
    await this.store.setDupes(u.id, cardId, row.dupes - rule.need);
    return this.view(await this.createPack(u.id, rule.pack, false, `Обмін повторок: ${card.name}`));
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
    if (m.ranked) {
      trophiesDelta = outcome === 'win' ? TROPHIES.win : outcome === 'loss' ? TROPHIES.loss : TROPHIES.draw;
      trophiesDelta = Math.max(-u.trophies, trophiesDelta);
      const patch: Partial<UserRow> = {
        trophies: u.trophies + trophiesDelta,
        wins: u.wins + (outcome === 'win' ? 1 : 0),
        losses: u.losses + (outcome === 'loss' ? 1 : 0),
        draws: u.draws + (outcome === 'draw' ? 1 : 0),
      };
      if (outcome === 'win') {
        const inSlots = (await this.store.listPacks(u.id)).filter((p) => p.slot && p.status !== 'opened').length;
        if (inSlots < PACK_SLOTS) {
          reward = this.view(await this.createPack(u.id, rewardFor(u.cycle), true, 'Перемога в рейтинговому матчі'));
          patch.cycle = u.cycle + 1;
        } else {
          rewardSkipped = true;
        }
      }
      await this.store.updateUser(u.id, patch);
    }
    await this.store.updateMatch(m.id, {
      status: 'finished',
      result: JSON.stringify({ outcome, reason: state.result!.reason, moves: state.result!.moves }),
    });
    return { outcome, reason: state.result!.reason, trophiesDelta, reward, rewardSkipped, profile: await this.profileOf(u.id) };
  }

  async leaderboard(): Promise<LeaderRow[]> {
    return (await this.store.listUsers(50))
      .filter((u) => u.passHash)
      .sort((a, b) => b.trophies - a.trophies || b.wins - a.wins)
      .slice(0, 50)
      .map((u) => ({ name: u.name, trophies: u.trophies, wins: u.wins, arena: arenaFor(u.trophies).name }));
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
        claimed: !!u.passHash,
      });
    }
    return out.sort((a, b) => b.trophies - a.trophies);
  }

  async adminGrantPack(token: string, userId: string, type: PackType): Promise<void> {
    await this.admin(token);
    if (!(await this.store.getUser(userId))) throw new ApiError(404, 'Гравця не знайдено.');
    await this.createPack(userId, type, false, 'Подарунок адміністратора');
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

  /** Finish the timer of one of your own packs right away. */
  async adminFinishUnlock(token: string, packId: string): Promise<void> {
    const me = await this.admin(token);
    const p = await this.store.getPack(packId);
    if (!p || p.userId !== me.id || p.status === 'opened') throw new ApiError(404, 'Пак не знайдено.');
    await this.store.updatePack(p.id, { status: 'ready', unlockAt: this.now() });
  }
}
