import { describe, expect, it } from 'vitest';
import { classicDeck } from '../../src/engine/deck';
import { GameService } from '../../src/economy/service';
import type { Hasher } from '../../src/economy/store';
import { SqliteStore } from '../sqliteStore';

const hasher: Hasher = { hash: async (p) => `h:${p}`, verify: async (p, h) => h === `h:${p}` };

describe('new columns in SQLite', () => {
  it('keeps the win streak, skins, the weekly run and a fractional bot level', async () => {
    const store = new SqliteStore(':memory:');
    const svc = new GameService(store, hasher, Date.now, Math.random);
    await svc.init();
    const r = await svc.register('a@a.com', 'secret12', 'Анна');
    const id = r.profile.id;
    await store.updateUser(id, { botStreak: 3, skins: '["berserk-1"]', skinChoice: '{"knight-berserk":"berserk-1"}', weekly: '{"week":"2026-10-12"}' });
    const u = (await store.getUser(id))!;
    expect([u.botStreak, u.skins, u.skinChoice, u.weekly]).toEqual([3, '["berserk-1"]', '{"knight-berserk":"berserk-1"}', '{"week":"2026-10-12"}']);

    const deck = classicDeck();
    await store.insertMatch({ id: 'm1', userId: id, ranked: true, mode: 'bot', color: 'w', botLevel: 1.84, playerDeck: deck, botDeck: deck, status: 'active', result: null, createdAt: 1, actions: [] });
    expect((await store.getMatch('m1'))!.botLevel).toBe(1.84);
  });

  it('keeps a draft challenge and its picks', async () => {
    const store = new SqliteStore(':memory:');
    const svc = new GameService(store, hasher, Date.now, Math.random);
    await svc.init();
    const a = (await svc.register('a@a.com', 'secret12', 'Анна')).profile.id;
    const b = (await svc.register('b@b.com', 'secret12', 'Богдан')).profile.id;
    await store.insertChallenge({ id: 'c1', fromId: a, toId: b, fromDeck: classicDeck(), status: 'pending', pvpId: null, createdAt: 1, mode: 'draft', draft: '' });
    expect((await store.getChallenge('c1'))!.mode).toBe('draft');
    await store.updateChallenge('c1', { status: 'drafting', draft: '{"round":2}' });
    const c = (await store.getChallenge('c1'))!;
    expect([c.status, c.draft]).toEqual(['drafting', '{"round":2}']);
  });
});
