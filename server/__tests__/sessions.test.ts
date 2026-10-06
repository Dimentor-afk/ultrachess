import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { SqliteStore } from '../sqliteStore';

const USER = 'u1';

function store() {
  const s = new SqliteStore(':memory:');
  const db = (s as unknown as { db: DatabaseSync }).db;
  db.exec('PRAGMA foreign_keys = OFF;');
  return { s, db };
}

describe('sessions in SQLite', () => {
  it('keeps only the hash of a token, and finds the session by the token', async () => {
    const { s, db } = store();
    await s.insertSession({ token: 'abc123', userId: USER, expiresAt: 10 });
    const rows = db.prepare('SELECT token FROM sessions').all() as { token: string }[];
    expect(rows.map((r) => r.token)).not.toContain('abc123');
    expect(rows[0].token).toMatch(/^[0-9a-f]{64}$/);
    expect(await s.getSession('abc123')).toEqual({ token: 'abc123', userId: USER, expiresAt: 10 });
    expect(await s.getSession(rows[0].token)).toBeNull();
  });

  it('moves a session stored before hashing to its hash on first use', async () => {
    const { s, db } = store();
    db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run('old', USER, 10);
    expect((await s.getSession('old'))?.userId).toBe(USER);
    const rows = db.prepare('SELECT token FROM sessions').all() as { token: string }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].token).not.toBe('old');
    expect((await s.getSession('old'))?.userId).toBe(USER);
  });

  it('signs out one session or all but the current one', async () => {
    const { s, db } = store();
    await s.insertSession({ token: 'a', userId: USER, expiresAt: 10 });
    await s.insertSession({ token: 'b', userId: USER, expiresAt: 10 });
    db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run('legacy', USER, 10);
    await s.deleteUserSessions(USER, 'a');
    expect(await s.getSession('a')).not.toBeNull();
    expect(await s.getSession('b')).toBeNull();
    expect(await s.getSession('legacy')).toBeNull();
    await s.deleteSession('a');
    expect(await s.getSession('a')).toBeNull();
  });
});

describe('a hash read from the database', () => {
  it('does not open the session', async () => {
    const { s, db } = store();
    await s.insertSession({ token: 'x'.repeat(48), userId: USER, expiresAt: 10 });
    const { token } = db.prepare('SELECT token FROM sessions').get() as { token: string };
    expect(await s.getSession(token)).toBeNull();
    await s.deleteSession(token);
    expect(await s.getSession('x'.repeat(48))).not.toBeNull();
  });
});
