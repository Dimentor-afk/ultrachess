// SQLite implementation of the game Store (Node's built-in node:sqlite).

import { DatabaseSync } from 'node:sqlite';
import type { CardRow, ChallengeRow, DeckRow, FriendRow, MatchRow, PackRow, PvpRow, SessionRow, Store, UserRow } from '../src/economy/store';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  pass_hash TEXT,
  trophies INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  draws INTEGER NOT NULL DEFAULT 0,
  cycle INTEGER NOT NULL DEFAULT 0,
  starter_given INTEGER NOT NULL DEFAULT 0,
  active_deck_id TEXT,
  created_at INTEGER NOT NULL,
  gold INTEGER NOT NULL DEFAULT 0,
  shards INTEGER NOT NULL DEFAULT 0,
  themes TEXT NOT NULL DEFAULT '[]',
  board_theme TEXT NOT NULL DEFAULT 'classic',
  packs_today INTEGER NOT NULL DEFAULT 0,
  packs_day TEXT NOT NULL DEFAULT '',
  avatar TEXT NOT NULL DEFAULT 'knight-classic',
  best_trophies INTEGER NOT NULL DEFAULT 0,
  last_seen INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS cards (
  user_id TEXT NOT NULL REFERENCES users(id),
  card_id TEXT NOT NULL,
  dupes INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, card_id)
);
CREATE TABLE IF NOT EXISTS packs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  type TEXT NOT NULL,
  slot INTEGER NOT NULL,
  status TEXT NOT NULL,
  unlock_at INTEGER,
  source TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  opened_at INTEGER,
  result TEXT
);
CREATE INDEX IF NOT EXISTS packs_user ON packs(user_id, status);
CREATE TABLE IF NOT EXISTS decks (
  id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  data TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, id)
);
CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  ranked INTEGER NOT NULL,
  color TEXT NOT NULL,
  bot_level INTEGER NOT NULL,
  player_deck TEXT NOT NULL,
  bot_deck TEXT NOT NULL,
  status TEXT NOT NULL,
  result TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS matches_user ON matches(user_id, created_at);
CREATE TABLE IF NOT EXISTS friends (
  id TEXT PRIMARY KEY,
  from_id TEXT NOT NULL REFERENCES users(id),
  to_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS friends_from ON friends(from_id);
CREATE INDEX IF NOT EXISTS friends_to ON friends(to_id);
CREATE TABLE IF NOT EXISTS challenges (
  id TEXT PRIMARY KEY,
  from_id TEXT NOT NULL REFERENCES users(id),
  to_id TEXT NOT NULL REFERENCES users(id),
  from_deck TEXT NOT NULL,
  status TEXT NOT NULL,
  pvp_id TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS pvp (
  id TEXT PRIMARY KEY,
  white_id TEXT NOT NULL REFERENCES users(id),
  black_id TEXT NOT NULL REFERENCES users(id),
  white_deck TEXT NOT NULL,
  black_deck TEXT NOT NULL,
  actions TEXT NOT NULL,
  action_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  result TEXT,
  resigned_by TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
`;

type Row = Record<string, unknown>;

const USER_COLS: Record<keyof UserRow, string> = {
  id: 'id',
  email: 'email',
  name: 'name',
  role: 'role',
  passHash: 'pass_hash',
  trophies: 'trophies',
  wins: 'wins',
  losses: 'losses',
  draws: 'draws',
  cycle: 'cycle',
  starterGiven: 'starter_given',
  activeDeckId: 'active_deck_id',
  createdAt: 'created_at',
  gold: 'gold',
  shards: 'shards',
  themes: 'themes',
  boardTheme: 'board_theme',
  packsToday: 'packs_today',
  packsDay: 'packs_day',
  avatar: 'avatar',
  bestTrophies: 'best_trophies',
  lastSeen: 'last_seen',
};

/** Columns added after the first release, for databases created before them. */
const USER_MIGRATIONS: [string, string][] = [
  ['gold', "INTEGER NOT NULL DEFAULT 0"],
  ['shards', "INTEGER NOT NULL DEFAULT 0"],
  ['themes', "TEXT NOT NULL DEFAULT '[]'"],
  ['board_theme', "TEXT NOT NULL DEFAULT 'classic'"],
  ['packs_today', "INTEGER NOT NULL DEFAULT 0"],
  ['packs_day', "TEXT NOT NULL DEFAULT ''"],
  ['avatar', "TEXT NOT NULL DEFAULT 'knight-classic'"],
  ['best_trophies', 'INTEGER NOT NULL DEFAULT 0'],
  ['last_seen', 'INTEGER NOT NULL DEFAULT 0'],
];

const PACK_COLS: Record<keyof PackRow, string> = {
  id: 'id',
  userId: 'user_id',
  type: 'type',
  slot: 'slot',
  status: 'status',
  unlockAt: 'unlock_at',
  source: 'source',
  createdAt: 'created_at',
  openedAt: 'opened_at',
  result: 'result',
};

const toSql = (v: unknown) => (typeof v === 'boolean' ? (v ? 1 : 0) : (v as string | number | null));

function user(r: Row | undefined): UserRow | null {
  if (!r) return null;
  return {
    id: r.id as string,
    email: r.email as string,
    name: r.name as string,
    role: r.role as UserRow['role'],
    passHash: (r.pass_hash as string | null) ?? null,
    trophies: Number(r.trophies),
    wins: Number(r.wins),
    losses: Number(r.losses),
    draws: Number(r.draws),
    cycle: Number(r.cycle),
    starterGiven: !!r.starter_given,
    activeDeckId: (r.active_deck_id as string | null) ?? null,
    createdAt: Number(r.created_at),
    gold: Number(r.gold ?? 0),
    shards: Number(r.shards ?? 0),
    themes: (r.themes as string | null) ?? '[]',
    boardTheme: (r.board_theme as string | null) ?? 'classic',
    packsToday: Number(r.packs_today ?? 0),
    packsDay: (r.packs_day as string | null) ?? '',
    avatar: (r.avatar as string | null) ?? 'knight-classic',
    bestTrophies: Number(r.best_trophies ?? 0),
    lastSeen: Number(r.last_seen ?? 0),
  };
}

function pack(r: Row | undefined): PackRow | null {
  if (!r) return null;
  return {
    id: r.id as string,
    userId: r.user_id as string,
    type: r.type as PackRow['type'],
    slot: !!r.slot,
    status: r.status as PackRow['status'],
    unlockAt: r.unlock_at === null ? null : Number(r.unlock_at),
    source: r.source as string,
    createdAt: Number(r.created_at),
    openedAt: r.opened_at === null ? null : Number(r.opened_at),
    result: (r.result as string | null) ?? null,
  };
}

function match(r: Row | undefined): MatchRow | null {
  if (!r) return null;
  return {
    id: r.id as string,
    userId: r.user_id as string,
    ranked: !!r.ranked,
    color: r.color as MatchRow['color'],
    botLevel: Number(r.bot_level),
    playerDeck: JSON.parse(r.player_deck as string),
    botDeck: JSON.parse(r.bot_deck as string),
    status: r.status as MatchRow['status'],
    result: (r.result as string | null) ?? null,
    createdAt: Number(r.created_at),
  };
}

function friend(r: Row | undefined): FriendRow | null {
  if (!r) return null;
  return { id: r.id as string, fromId: r.from_id as string, toId: r.to_id as string, status: r.status as FriendRow['status'], createdAt: Number(r.created_at) };
}

function challenge(r: Row | undefined): ChallengeRow | null {
  if (!r) return null;
  return {
    id: r.id as string,
    fromId: r.from_id as string,
    toId: r.to_id as string,
    fromDeck: JSON.parse(r.from_deck as string),
    status: r.status as ChallengeRow['status'],
    pvpId: (r.pvp_id as string | null) ?? null,
    createdAt: Number(r.created_at),
  };
}

function pvp(r: Row | undefined): PvpRow | null {
  if (!r) return null;
  return {
    id: r.id as string,
    whiteId: r.white_id as string,
    blackId: r.black_id as string,
    whiteDeck: JSON.parse(r.white_deck as string),
    blackDeck: JSON.parse(r.black_deck as string),
    actions: r.actions as string,
    status: r.status as PvpRow['status'],
    result: (r.result as string | null) ?? null,
    resignedBy: (r.resigned_by as PvpRow['resignedBy']) ?? null,
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
  };
}

const FRIEND_COLS: Record<string, string> = { status: 'status' };
const CHALLENGE_COLS: Record<string, string> = { status: 'status', pvpId: 'pvp_id' };
const PVP_COLS: Record<string, string> = {
  actions: 'actions',
  status: 'status',
  result: 'result',
  resignedBy: 'resigned_by',
  updatedAt: 'updated_at',
};

function update(db: DatabaseSync, table: string, cols: Record<string, string>, id: string, patch: Row): void {
  const keys = Object.keys(patch).filter((k) => k in cols);
  if (!keys.length) return;
  const sets = keys.map((k) => `${cols[k]} = ?`).join(', ');
  db.prepare(`UPDATE ${table} SET ${sets} WHERE id = ?`).run(...keys.map((k) => toSql(patch[k])), id);
}

export class SqliteStore implements Store {
  db: DatabaseSync;

  constructor(file: string) {
    this.db = new DatabaseSync(file);
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
    this.db.exec(SCHEMA);
    const have = new Set((this.db.prepare('PRAGMA table_info(users)').all() as Row[]).map((r) => r.name as string));
    for (const [col, def] of USER_MIGRATIONS) if (!have.has(col)) this.db.exec(`ALTER TABLE users ADD COLUMN ${col} ${def}`);
  }

  async getUser(id: string) {
    return user(this.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as Row | undefined);
  }
  async getUserByEmail(email: string) {
    return user(this.db.prepare('SELECT * FROM users WHERE email = ?').get(email) as Row | undefined);
  }
  async insertUser(u: UserRow) {
    const keys = Object.keys(USER_COLS) as (keyof UserRow)[];
    this.db
      .prepare(`INSERT INTO users (${keys.map((k) => USER_COLS[k]).join(',')}) VALUES (${keys.map(() => '?').join(',')})`)
      .run(...keys.map((k) => toSql(u[k])));
  }
  async updateUser(id: string, patch: Partial<UserRow>) {
    update(this.db, 'users', USER_COLS, id, patch as Row);
  }
  async listUsers(limit: number) {
    return (this.db.prepare('SELECT * FROM users ORDER BY trophies DESC LIMIT ?').all(limit) as Row[]).map((r) => user(r)!);
  }

  async insertSession(s: SessionRow) {
    this.db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(s.token, s.userId, s.expiresAt);
  }
  async getSession(token: string) {
    const r = this.db.prepare('SELECT * FROM sessions WHERE token = ?').get(token) as Row | undefined;
    return r ? { token: r.token as string, userId: r.user_id as string, expiresAt: Number(r.expires_at) } : null;
  }
  async deleteSession(token: string) {
    this.db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  }

  async listCards(userId: string) {
    return (this.db.prepare('SELECT * FROM cards WHERE user_id = ?').all(userId) as Row[]).map(
      (r): CardRow => ({ userId, cardId: r.card_id as string, dupes: Number(r.dupes) }),
    );
  }
  async addCard(userId: string, cardId: string) {
    const res = this.db.prepare('INSERT OR IGNORE INTO cards (user_id, card_id, dupes) VALUES (?, ?, 0)').run(userId, cardId);
    if (Number(res.changes) > 0) return true;
    this.db.prepare('UPDATE cards SET dupes = dupes + 1 WHERE user_id = ? AND card_id = ?').run(userId, cardId);
    return false;
  }
  async setDupes(userId: string, cardId: string, dupes: number) {
    this.db.prepare('UPDATE cards SET dupes = ? WHERE user_id = ? AND card_id = ?').run(dupes, userId, cardId);
  }

  async listPacks(userId: string) {
    return (this.db.prepare("SELECT * FROM packs WHERE user_id = ? AND status != 'opened'").all(userId) as Row[]).map((r) => pack(r)!);
  }
  async getPack(id: string) {
    return pack(this.db.prepare('SELECT * FROM packs WHERE id = ?').get(id) as Row | undefined);
  }
  async insertPack(p: PackRow) {
    const keys = Object.keys(PACK_COLS) as (keyof PackRow)[];
    this.db
      .prepare(`INSERT INTO packs (${keys.map((k) => PACK_COLS[k]).join(',')}) VALUES (${keys.map(() => '?').join(',')})`)
      .run(...keys.map((k) => toSql(p[k])));
  }
  async updatePack(id: string, patch: Partial<PackRow>) {
    update(this.db, 'packs', PACK_COLS, id, patch as Row);
  }
  async claimPack(id: string, userId: string, openedAt: number) {
    const res = this.db
      .prepare("UPDATE packs SET status = 'opened', opened_at = ? WHERE id = ? AND user_id = ? AND status = 'ready'")
      .run(openedAt, id, userId);
    return Number(res.changes) > 0;
  }

  async listDecks(userId: string) {
    return (this.db.prepare('SELECT * FROM decks WHERE user_id = ?').all(userId) as Row[]).map(
      (r): DeckRow => ({ id: r.id as string, userId, deck: JSON.parse(r.data as string), updatedAt: Number(r.updated_at) }),
    );
  }
  async upsertDeck(d: DeckRow) {
    this.db
      .prepare(
        'INSERT INTO decks (id, user_id, data, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at',
      )
      .run(d.id, d.userId, JSON.stringify(d.deck), d.updatedAt);
  }
  async deleteDeck(userId: string, id: string) {
    this.db.prepare('DELETE FROM decks WHERE user_id = ? AND id = ?').run(userId, id);
  }

  async insertMatch(m: MatchRow) {
    this.db
      .prepare(
        'INSERT INTO matches (id, user_id, ranked, color, bot_level, player_deck, bot_deck, status, result, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(m.id, m.userId, m.ranked ? 1 : 0, m.color, m.botLevel, JSON.stringify(m.playerDeck), JSON.stringify(m.botDeck), m.status, m.result, m.createdAt);
  }
  async getMatch(id: string) {
    return match(this.db.prepare('SELECT * FROM matches WHERE id = ?').get(id) as Row | undefined);
  }
  async updateMatch(id: string, patch: Partial<MatchRow>) {
    const cols: Record<string, string> = { status: 'status', result: 'result' };
    update(this.db, 'matches', cols, id, patch as Row);
  }
  async listMatches(userId: string, limit: number) {
    return (this.db.prepare('SELECT * FROM matches WHERE user_id = ? ORDER BY created_at DESC LIMIT ?').all(userId, limit) as Row[]).map(
      (r) => match(r)!,
    );
  }

  async listFriends(userId: string) {
    return (this.db.prepare('SELECT * FROM friends WHERE from_id = ? OR to_id = ?').all(userId, userId) as Row[]).map((r) => friend(r)!);
  }
  async insertFriend(f: FriendRow) {
    this.db.prepare('INSERT INTO friends (id, from_id, to_id, status, created_at) VALUES (?, ?, ?, ?, ?)').run(f.id, f.fromId, f.toId, f.status, f.createdAt);
  }
  async updateFriend(id: string, patch: Partial<FriendRow>) {
    update(this.db, 'friends', FRIEND_COLS, id, patch as Row);
  }
  async deleteFriend(id: string) {
    this.db.prepare('DELETE FROM friends WHERE id = ?').run(id);
  }

  async listChallenges(userId: string) {
    return (this.db.prepare('SELECT * FROM challenges WHERE from_id = ? OR to_id = ?').all(userId, userId) as Row[]).map((r) => challenge(r)!);
  }
  async getChallenge(id: string) {
    return challenge(this.db.prepare('SELECT * FROM challenges WHERE id = ?').get(id) as Row | undefined);
  }
  async insertChallenge(c: ChallengeRow) {
    this.db
      .prepare('INSERT INTO challenges (id, from_id, to_id, from_deck, status, pvp_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(c.id, c.fromId, c.toId, JSON.stringify(c.fromDeck), c.status, c.pvpId, c.createdAt);
  }
  async updateChallenge(id: string, patch: Partial<ChallengeRow>) {
    update(this.db, 'challenges', CHALLENGE_COLS, id, patch as Row);
  }

  async listPvp(userId: string, limit: number) {
    return (
      this.db.prepare('SELECT * FROM pvp WHERE white_id = ? OR black_id = ? ORDER BY updated_at DESC LIMIT ?').all(userId, userId, limit) as Row[]
    ).map((r) => pvp(r)!);
  }
  async getPvp(id: string) {
    return pvp(this.db.prepare('SELECT * FROM pvp WHERE id = ?').get(id) as Row | undefined);
  }
  async insertPvp(p: PvpRow) {
    this.db
      .prepare(
        'INSERT INTO pvp (id, white_id, black_id, white_deck, black_deck, actions, action_count, status, result, resigned_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        p.id,
        p.whiteId,
        p.blackId,
        JSON.stringify(p.whiteDeck),
        JSON.stringify(p.blackDeck),
        p.actions,
        JSON.parse(p.actions).length,
        p.status,
        p.result,
        p.resignedBy,
        p.createdAt,
        p.updatedAt,
      );
  }
  async updatePvp(id: string, patch: Partial<PvpRow>, expectedActions?: number) {
    const keys = Object.keys(patch).filter((k) => k in PVP_COLS);
    const sets = keys.map((k) => `${PVP_COLS[k]} = ?`);
    const vals = keys.map((k) => toSql((patch as Row)[k]));
    if (patch.actions !== undefined) {
      sets.push('action_count = ?');
      vals.push(JSON.parse(patch.actions).length);
    }
    if (!sets.length) return true;
    let sql = `UPDATE pvp SET ${sets.join(', ')} WHERE id = ?`;
    vals.push(id);
    if (expectedActions !== undefined) {
      sql += ' AND action_count = ?';
      vals.push(expectedActions);
    }
    return Number(this.db.prepare(sql).run(...vals).changes) > 0;
  }
}
