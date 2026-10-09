// SQLite implementation of the game Store (Node's built-in node:sqlite).

import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import type { PurchaseRow, PurchaseStatus } from '../src/economy/payments';
import type { CardRow, ChallengeRow, DeckRow, FriendRow, MatchRow, PackRow, PvpRow, SeekRow, SessionRow, Store, TokenRow, UserRow } from '../src/economy/store';

/** What the sessions table keys a session by: the SHA-256 of its token. */
function tokenKey(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
/**
 * A token kept as it is, from before hashing (48 hex digits). Never a value as long as
 * a hash: a hash read from the database must not open the session by itself.
 */
function legacyKey(token: string): string {
  return token.length === 64 ? '' : token;
}

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
  last_seen INTEGER NOT NULL DEFAULT 0,
  quests TEXT NOT NULL DEFAULT '{}',
  bot_override INTEGER NOT NULL DEFAULT -1,
  capture_fx TEXT NOT NULL DEFAULT 'impact',
  owned_fx TEXT NOT NULL DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS purchases (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  product TEXT NOT NULL,
  shards INTEGER NOT NULL,
  amount INTEGER NOT NULL,
  ccy TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_id TEXT,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS purchases_user ON purchases(user_id, created_at);
CREATE TABLE IF NOT EXISTS tokens (
  hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL,
  email TEXT NOT NULL,
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
CREATE TABLE IF NOT EXISTS seeks (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  deck TEXT NOT NULL,
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
  quests: 'quests',
  botOverride: 'bot_override',
  captureFx: 'capture_fx',
  ownedFx: 'owned_fx',
  botTrophies: 'bot_trophies',
  botBest: 'bot_best',
  botCycle: 'bot_cycle',
  botPacksToday: 'bot_packs_today',
  botPacksDay: 'bot_packs_day',
  freePackDay: 'free_pack_day',
  leagueRewards: 'league_rewards',
  trials: 'trials',
  emailVerified: 'email_verified',
  nameChangedAt: 'name_changed_at',
  deleted: 'deleted',
  bannedUntil: 'banned_until',
  banReason: 'ban_reason',
  notice: 'notice',
  achievements: 'achievements',
  title: 'title',
  plates: 'plates',
  referredBy: 'referred_by',
  refStage: 'ref_stage',
  refGames: 'ref_games',
  patchSeen: 'patch_seen',
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
  ['quests', "TEXT NOT NULL DEFAULT '{}'"],
  ['bot_override', 'INTEGER NOT NULL DEFAULT -1'],
  ['capture_fx', "TEXT NOT NULL DEFAULT 'impact'"],
  ['owned_fx', "TEXT NOT NULL DEFAULT '[]'"],
  ['bot_trophies', 'INTEGER NOT NULL DEFAULT 0'],
  ['bot_best', 'INTEGER NOT NULL DEFAULT 0'],
  ['bot_cycle', 'INTEGER NOT NULL DEFAULT 0'],
  ['bot_packs_today', 'INTEGER NOT NULL DEFAULT 0'],
  ['bot_packs_day', "TEXT NOT NULL DEFAULT ''"],
  ['free_pack_day', "TEXT NOT NULL DEFAULT ''"],
  ['league_rewards', "TEXT NOT NULL DEFAULT '{}'"],
  ['trials', "TEXT NOT NULL DEFAULT '{}'"],
  ['email_verified', 'INTEGER NOT NULL DEFAULT 0'],
  ['name_changed_at', 'INTEGER NOT NULL DEFAULT 0'],
  ['deleted', 'INTEGER NOT NULL DEFAULT 0'],
  ['banned_until', 'INTEGER NOT NULL DEFAULT 0'],
  ['ban_reason', "TEXT NOT NULL DEFAULT ''"],
  ['notice', "TEXT NOT NULL DEFAULT ''"],
  ['achievements', "TEXT NOT NULL DEFAULT '{}'"],
  ['title', "TEXT NOT NULL DEFAULT ''"],
  ['plates', "TEXT NOT NULL DEFAULT '[]'"],
  ['referred_by', "TEXT NOT NULL DEFAULT ''"],
  ['ref_stage', 'INTEGER NOT NULL DEFAULT 0'],
  ['ref_games', 'INTEGER NOT NULL DEFAULT 0'],
  ['patch_seen', "TEXT NOT NULL DEFAULT ''"],
];

/** Columns added to other tables after the first release. */
const OTHER_MIGRATIONS: [string, string, string][] = [
  ['matches', 'mode', "TEXT NOT NULL DEFAULT ''"],
  ['matches', 'actions', "TEXT NOT NULL DEFAULT '[]'"],
  ['matches', 'action_count', 'INTEGER NOT NULL DEFAULT 0'],
  ['pvp', 'ranked', 'INTEGER NOT NULL DEFAULT 0'],
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
    quests: (r.quests as string | null) ?? '{}',
    botOverride: Number(r.bot_override ?? -1),
    captureFx: (r.capture_fx as string | null) ?? 'impact',
    ownedFx: (r.owned_fx as string | null) ?? '[]',
    botTrophies: Number(r.bot_trophies ?? 0),
    botBest: Number(r.bot_best ?? 0),
    botCycle: Number(r.bot_cycle ?? 0),
    botPacksToday: Number(r.bot_packs_today ?? 0),
    botPacksDay: (r.bot_packs_day as string | null) ?? '',
    freePackDay: (r.free_pack_day as string | null) ?? '',
    leagueRewards: (r.league_rewards as string | null) ?? '{}',
    trials: (r.trials as string | null) ?? '{}',
    emailVerified: !!r.email_verified,
    nameChangedAt: Number(r.name_changed_at ?? 0),
    deleted: !!r.deleted,
    bannedUntil: Number(r.banned_until ?? 0),
    banReason: (r.ban_reason as string | null) ?? '',
    notice: (r.notice as string | null) ?? '',
    achievements: (r.achievements as string | null) ?? '{}',
    title: (r.title as string | null) ?? '',
    plates: (r.plates as string | null) ?? '[]',
    referredBy: (r.referred_by as string | null) ?? '',
    refStage: Number(r.ref_stage ?? 0),
    refGames: Number(r.ref_games ?? 0),
    patchSeen: (r.patch_seen as string | null) ?? '',
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
    mode: (r.mode as string | null) ?? '',
    color: r.color as MatchRow['color'],
    botLevel: Number(r.bot_level),
    playerDeck: JSON.parse(r.player_deck as string),
    botDeck: JSON.parse(r.bot_deck as string),
    status: r.status as MatchRow['status'],
    result: (r.result as string | null) ?? null,
    createdAt: Number(r.created_at),
    actions: JSON.parse((r.actions as string | null) ?? '[]'),
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
    ranked: !!r.ranked,
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
  };
}

const PURCHASE_COLS: Record<string, string> = { providerId: 'provider_id', status: 'status', updatedAt: 'updated_at' };

function purchase(r: Row | undefined): PurchaseRow | null {
  if (!r) return null;
  return {
    id: r.id as string,
    userId: r.user_id as string,
    product: r.product as string,
    shards: Number(r.shards),
    amount: Number(r.amount),
    ccy: r.ccy as string,
    provider: r.provider as string,
    providerId: (r.provider_id as string | null) ?? null,
    status: r.status as PurchaseStatus,
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
    for (const [table, col, def] of OTHER_MIGRATIONS) {
      const cols = new Set((this.db.prepare(`PRAGMA table_info(${table})`).all() as Row[]).map((r) => r.name as string));
      if (!cols.has(col)) this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
    }
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

  // Sessions are kept by the SHA-256 of their token: the browser holds the token
  // itself, so a copy of the database cannot be used to sign in as anyone.
  async insertSession(s: SessionRow) {
    this.db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(tokenKey(s.token), s.userId, s.expiresAt);
  }
  async getSession(token: string) {
    const key = tokenKey(token);
    let r = this.db.prepare('SELECT * FROM sessions WHERE token = ?').get(key) as Row | undefined;
    if (!r && legacyKey(token)) {
      // Stored before hashing: moved to its hashed key on first use.
      r = this.db.prepare('UPDATE sessions SET token = ? WHERE token = ? RETURNING *').get(key, token) as Row | undefined;
    }
    return r ? { token, userId: r.user_id as string, expiresAt: Number(r.expires_at) } : null;
  }
  async purgeSessions(now: number) {
    this.db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now);
    this.db.prepare('DELETE FROM tokens WHERE expires_at < ?').run(now);
  }
  async deleteSession(token: string) {
    this.db.prepare('DELETE FROM sessions WHERE token IN (?, ?)').run(tokenKey(token), legacyKey(token));
  }
  async deleteUserSessions(userId: string, except?: string) {
    this.db.prepare('DELETE FROM sessions WHERE user_id = ? AND token NOT IN (?, ?)').run(userId, except ? tokenKey(except) : '', except ? legacyKey(except) : '');
  }

  async insertPurchase(p: PurchaseRow) {
    this.db
      .prepare(
        'INSERT INTO purchases (id, user_id, product, shards, amount, ccy, provider, provider_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(p.id, p.userId, p.product, p.shards, p.amount, p.ccy, p.provider, p.providerId, p.status, p.createdAt, p.updatedAt);
  }
  async getPurchase(id: string) {
    return purchase(this.db.prepare('SELECT * FROM purchases WHERE id = ?').get(id) as Row | undefined);
  }
  async updatePurchase(id: string, patch: Partial<PurchaseRow>) {
    update(this.db, 'purchases', PURCHASE_COLS, id, patch as Row);
  }
  async listPurchases(userId: string, limit: number) {
    return (this.db.prepare('SELECT * FROM purchases WHERE user_id = ? ORDER BY created_at DESC LIMIT ?').all(userId, limit) as Row[]).map((r) => purchase(r)!);
  }
  async listAllPurchases(limit: number) {
    return (this.db.prepare('SELECT * FROM purchases ORDER BY created_at DESC LIMIT ?').all(limit) as Row[]).map((r) => purchase(r)!);
  }
  async deletePurchase(id: string) {
    this.db.prepare('DELETE FROM purchases WHERE id = ?').run(id);
  }
  async settlePurchase(id: string, from: PurchaseStatus, to: PurchaseStatus, shards: number, now: number) {
    // One transaction: the status move is the lock, the shards follow it or nothing happens.
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const moved = this.db.prepare('UPDATE purchases SET status = ?, updated_at = ? WHERE id = ? AND status = ?').run(to, now, id, from);
      if (Number(moved.changes) > 0) {
        this.db.prepare('UPDATE users SET shards = shards + ? WHERE id = (SELECT user_id FROM purchases WHERE id = ?)').run(shards, id);
      }
      this.db.exec('COMMIT');
      return Number(moved.changes) > 0;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }

  async insertToken(t: TokenRow) {
    this.db
      .prepare('INSERT INTO tokens (hash, user_id, kind, email, expires_at) VALUES (?, ?, ?, ?, ?)')
      .run(t.hash, t.userId, t.kind, t.email, t.expiresAt);
  }
  async takeToken(hash: string) {
    // DELETE … RETURNING: two requests with the same link cannot both get it.
    const r = this.db.prepare('DELETE FROM tokens WHERE hash = ? RETURNING *').get(hash) as Row | undefined;
    if (!r) return null;
    return { hash, userId: r.user_id as string, kind: r.kind as TokenRow['kind'], email: r.email as string, expiresAt: Number(r.expires_at) };
  }
  async deleteUserTokens(userId: string, kind?: TokenRow['kind']) {
    if (kind) this.db.prepare('DELETE FROM tokens WHERE user_id = ? AND kind = ?').run(userId, kind);
    else this.db.prepare('DELETE FROM tokens WHERE user_id = ?').run(userId);
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
  async countOpenedPacks(userId: string) {
    const r = this.db.prepare("SELECT COUNT(*) AS n FROM packs WHERE user_id = ? AND status = 'opened'").get(userId) as Row;
    return Number(r.n);
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
        'INSERT INTO matches (id, user_id, ranked, mode, color, bot_level, player_deck, bot_deck, status, result, created_at, actions, action_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        m.id,
        m.userId,
        m.ranked ? 1 : 0,
        m.mode,
        m.color,
        m.botLevel,
        JSON.stringify(m.playerDeck),
        JSON.stringify(m.botDeck),
        m.status,
        m.result,
        m.createdAt,
        JSON.stringify(m.actions ?? []),
        (m.actions ?? []).length,
      );
  }
  async getMatch(id: string) {
    return match(this.db.prepare('SELECT * FROM matches WHERE id = ?').get(id) as Row | undefined);
  }
  async updateMatch(id: string, patch: Partial<MatchRow>, expectedActions?: number) {
    const sets: string[] = [];
    const vals: (string | number | null)[] = [];
    if (patch.status !== undefined) sets.push('status = ?'), vals.push(patch.status);
    if (patch.result !== undefined) sets.push('result = ?'), vals.push(patch.result);
    if (patch.actions !== undefined) {
      sets.push('actions = ?', 'action_count = ?');
      vals.push(JSON.stringify(patch.actions), patch.actions.length);
    }
    if (!sets.length) return true;
    let sql = `UPDATE matches SET ${sets.join(', ')} WHERE id = ?`;
    vals.push(id);
    // Optimistic lock: a second request on the same game cannot overwrite the first.
    if (expectedActions !== undefined) {
      sql += ' AND action_count = ?';
      vals.push(expectedActions);
    }
    return Number(this.db.prepare(sql).run(...vals).changes) > 0;
  }
  async listFinishedMatches(since: number) {
    return (this.db.prepare("SELECT * FROM matches WHERE status = 'finished' AND result IS NOT NULL AND created_at >= ?").all(since) as Row[]).map((r) => match(r)!);
  }
  async listFinishedPvp(since: number) {
    return (this.db.prepare("SELECT * FROM pvp WHERE status = 'finished' AND result IS NOT NULL AND updated_at >= ?").all(since) as Row[]).map((r) => pvp(r)!);
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
        'INSERT INTO pvp (id, white_id, black_id, white_deck, black_deck, actions, action_count, status, result, resigned_by, ranked, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
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
        p.ranked ? 1 : 0,
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

  async listSeeks() {
    return (this.db.prepare('SELECT * FROM seeks ORDER BY updated_at').all() as Row[]).map((r) => ({
      userId: r.user_id as string,
      deck: JSON.parse(r.deck as string),
      updatedAt: Number(r.updated_at),
    }));
  }
  async putSeek(s: SeekRow) {
    this.db
      .prepare('INSERT INTO seeks (user_id, deck, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET deck = excluded.deck, updated_at = excluded.updated_at')
      .run(s.userId, JSON.stringify(s.deck), s.updatedAt);
  }
  async deleteSeek(userId: string) {
    return Number(this.db.prepare('DELETE FROM seeks WHERE user_id = ?').run(userId).changes) > 0;
  }
}
