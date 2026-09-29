// In-memory Store. The browser demo persists it to localStorage; tests use
// it as is.

import type { CardRow, ChallengeRow, DeckRow, FriendRow, MatchRow, PackRow, PvpRow, SessionRow, Store, UserRow } from './store';

export interface MemoryData {
  users: UserRow[];
  sessions: SessionRow[];
  cards: CardRow[];
  packs: PackRow[];
  decks: DeckRow[];
  matches: MatchRow[];
  friends: FriendRow[];
  challenges: ChallengeRow[];
  pvp: PvpRow[];
}

export const emptyData = (): MemoryData => ({
  users: [],
  sessions: [],
  cards: [],
  packs: [],
  decks: [],
  matches: [],
  friends: [],
  challenges: [],
  pvp: [],
});

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

/** Fill fields added after the demo data was first saved. */
export function withUserDefaults(u: UserRow): UserRow {
  return {
    ...u,
    gold: u.gold ?? 0,
    shards: u.shards ?? 0,
    themes: u.themes ?? '[]',
    boardTheme: u.boardTheme ?? 'classic',
    packsToday: u.packsToday ?? 0,
    packsDay: u.packsDay ?? '',
    avatar: u.avatar ?? 'knight-classic',
    bestTrophies: u.bestTrophies ?? u.trophies ?? 0,
    lastSeen: u.lastSeen ?? 0,
    quests: u.quests ?? '{}',
  };
}

export class MemoryStore implements Store {
  constructor(
    public data: MemoryData = emptyData(),
    private onChange: (data: MemoryData) => void = () => {},
  ) {
    this.data = { ...emptyData(), ...this.data };
    this.data.users = this.data.users.map(withUserDefaults);
  }

  /** Take over data another tab wrote (the browser demo shares one storage). */
  reload(data: MemoryData | null): void {
    if (!data) return;
    this.data = { ...emptyData(), ...data };
    this.data.users = this.data.users.map(withUserDefaults);
  }

  private save(): void {
    this.onChange(this.data);
  }

  async getUser(id: string) {
    const u = this.data.users.find((x) => x.id === id);
    return u ? clone(u) : null;
  }
  async getUserByEmail(email: string) {
    const u = this.data.users.find((x) => x.email === email);
    return u ? clone(u) : null;
  }
  async insertUser(u: UserRow) {
    this.data.users.push(clone(u));
    this.save();
  }
  async updateUser(id: string, patch: Partial<UserRow>) {
    const u = this.data.users.find((x) => x.id === id);
    if (u) Object.assign(u, clone(patch));
    this.save();
  }
  async listUsers(limit: number) {
    return clone(this.data.users.slice(0, limit));
  }

  async insertSession(s: SessionRow) {
    this.data.sessions.push(s);
    this.save();
  }
  async getSession(token: string) {
    return this.data.sessions.find((s) => s.token === token) ?? null;
  }
  async deleteSession(token: string) {
    this.data.sessions = this.data.sessions.filter((s) => s.token !== token);
    this.save();
  }

  async listCards(userId: string) {
    return clone(this.data.cards.filter((c) => c.userId === userId));
  }
  async addCard(userId: string, cardId: string) {
    const c = this.data.cards.find((x) => x.userId === userId && x.cardId === cardId);
    if (c) c.dupes++;
    else this.data.cards.push({ userId, cardId, dupes: 0 });
    this.save();
    return !c;
  }
  async setDupes(userId: string, cardId: string, dupes: number) {
    const c = this.data.cards.find((x) => x.userId === userId && x.cardId === cardId);
    if (c) c.dupes = dupes;
    this.save();
  }

  async listPacks(userId: string) {
    return clone(this.data.packs.filter((p) => p.userId === userId));
  }
  async getPack(id: string) {
    const p = this.data.packs.find((x) => x.id === id);
    return p ? clone(p) : null;
  }
  async insertPack(p: PackRow) {
    this.data.packs.push(clone(p));
    this.save();
  }
  async updatePack(id: string, patch: Partial<PackRow>) {
    const p = this.data.packs.find((x) => x.id === id);
    if (p) Object.assign(p, clone(patch));
    this.save();
  }
  async claimPack(id: string, userId: string, openedAt: number) {
    const p = this.data.packs.find((x) => x.id === id && x.userId === userId);
    if (!p || p.status !== 'ready') return false;
    p.status = 'opened';
    p.openedAt = openedAt;
    this.save();
    return true;
  }

  async listDecks(userId: string) {
    return clone(this.data.decks.filter((d) => d.userId === userId));
  }
  async upsertDeck(d: DeckRow) {
    const i = this.data.decks.findIndex((x) => x.id === d.id && x.userId === d.userId);
    if (i >= 0) this.data.decks[i] = clone(d);
    else this.data.decks.push(clone(d));
    this.save();
  }
  async deleteDeck(userId: string, id: string) {
    this.data.decks = this.data.decks.filter((d) => !(d.id === id && d.userId === userId));
    this.save();
  }

  async insertMatch(m: MatchRow) {
    this.data.matches.push(clone(m));
    // Keep the demo storage small.
    if (this.data.matches.length > 200) this.data.matches = this.data.matches.slice(-200);
    this.save();
  }
  async getMatch(id: string) {
    const m = this.data.matches.find((x) => x.id === id);
    return m ? clone(m) : null;
  }
  async updateMatch(id: string, patch: Partial<MatchRow>) {
    const m = this.data.matches.find((x) => x.id === id);
    if (m) Object.assign(m, clone(patch));
    this.save();
  }
  async listMatches(userId: string, limit: number) {
    return clone(this.data.matches.filter((m) => m.userId === userId).slice(-limit).reverse());
  }

  async listFriends(userId: string) {
    return clone(this.data.friends.filter((f) => f.fromId === userId || f.toId === userId));
  }
  async insertFriend(f: FriendRow) {
    this.data.friends.push(clone(f));
    this.save();
  }
  async updateFriend(id: string, patch: Partial<FriendRow>) {
    const f = this.data.friends.find((x) => x.id === id);
    if (f) Object.assign(f, clone(patch));
    this.save();
  }
  async deleteFriend(id: string) {
    this.data.friends = this.data.friends.filter((f) => f.id !== id);
    this.save();
  }

  async listChallenges(userId: string) {
    return clone(this.data.challenges.filter((c) => c.fromId === userId || c.toId === userId));
  }
  async getChallenge(id: string) {
    const c = this.data.challenges.find((x) => x.id === id);
    return c ? clone(c) : null;
  }
  async insertChallenge(c: ChallengeRow) {
    this.data.challenges.push(clone(c));
    this.save();
  }
  async updateChallenge(id: string, patch: Partial<ChallengeRow>) {
    const c = this.data.challenges.find((x) => x.id === id);
    if (c) Object.assign(c, clone(patch));
    this.save();
  }

  async listPvp(userId: string, limit: number) {
    return clone(
      this.data.pvp
        .filter((p) => p.whiteId === userId || p.blackId === userId)
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, limit),
    );
  }
  async getPvp(id: string) {
    const p = this.data.pvp.find((x) => x.id === id);
    return p ? clone(p) : null;
  }
  async insertPvp(p: PvpRow) {
    this.data.pvp.push(clone(p));
    this.save();
  }
  async updatePvp(id: string, patch: Partial<PvpRow>, expectedActions?: number) {
    const p = this.data.pvp.find((x) => x.id === id);
    if (!p) return false;
    if (expectedActions !== undefined && JSON.parse(p.actions).length !== expectedActions) return false;
    Object.assign(p, clone(patch));
    this.save();
    return true;
  }
}
