import { describe, expect, it } from 'vitest';
import { MemoryStore } from '../memoryStore';
import { GameService } from '../service';
import type { Hasher } from '../store';

const hasher: Hasher = { hash: async (p) => `h:${p}`, verify: async (p, h) => h === `h:${p}` };
const BASE = 'https://ultrachess.test/';

async function setup() {
  let now = 1_800_000_000_000;
  const clock = { tick: (ms: number) => (now += ms) };
  const store = new MemoryStore();
  const svc = new GameService(store, hasher, () => now, Math.random, undefined, ['boss@x.com']);
  await svc.init();
  const boss = await svc.register('boss@x.com', 'secret12', 'Богдан', BASE);
  const mod = await svc.register('mod@x.com', 'secret12', 'Мирослав', BASE);
  const anna = await svc.register('anna@x.com', 'secret12', 'Анна', BASE);
  await svc.adminSetRole(boss.token, mod.profile.id, 'admin');
  return { svc, store, clock, boss, mod, anna };
}

describe('admin roles', () => {
  it('the owner (ADMIN_EMAILS) appoints and removes admins; nobody else can', async () => {
    const { svc, boss, mod, anna } = await setup();
    expect(boss.profile.owner).toBe(true);
    expect((await svc.me(mod.token)).role).toBe('admin');
    expect((await svc.me(mod.token)).owner).toBe(false);
    await expect(svc.adminSetRole(mod.token, anna.profile.id, 'admin')).rejects.toThrow(/лише власник/);
    await expect(svc.adminSetRole(mod.token, boss.profile.id, 'player')).rejects.toThrow(/лише власник/);
    await expect(svc.adminSetRole(boss.token, boss.profile.id, 'player')).rejects.toThrow();
    await expect(svc.adminSetRole(boss.token, anna.profile.id, 'owner' as never)).rejects.toThrow(/ролі/);
    await svc.adminSetRole(boss.token, mod.profile.id, 'player');
    await expect(svc.adminUsers(mod.token)).rejects.toThrow(/адміністратора/);
  });

  it('an admin cannot touch the owner or another admin; the owner can', async () => {
    const { svc, boss, mod } = await setup();
    const other = await svc.register('other@x.com', 'secret12', 'Інший', BASE);
    await svc.adminSetRole(boss.token, other.profile.id, 'admin');
    await expect(svc.adminBan(mod.token, boss.profile.id, null, '')).rejects.toThrow(/Власника/);
    await expect(svc.adminDeleteUser(mod.token, boss.profile.id)).rejects.toThrow(/Власника/);
    await expect(svc.adminBan(mod.token, other.profile.id, 24, '')).rejects.toThrow(/лише власник/);
    await expect(svc.adminBan(mod.token, mod.profile.id, 24, '')).rejects.toThrow(/власний/);
    await svc.adminBan(boss.token, other.profile.id, 24, 'тест');
  });
});

describe('bans', () => {
  it('signs the player out, refuses sign-in with the reason, ends with time or an unban', async () => {
    const { svc, clock, mod, anna } = await setup();
    await svc.adminBan(mod.token, anna.profile.id, 24, 'Образи в чаті');
    await expect(svc.me(anna.token)).rejects.toThrow(/./);
    await expect(svc.login('anna@x.com', 'secret12')).rejects.toThrow(/заблоковано до .* UTC\. Причина: Образи в чаті/);
    const row = (await svc.adminUsers(mod.token)).find((u) => u.id === anna.profile.id)!;
    expect(row.bannedUntil).toBeGreaterThan(0);
    expect(row.banReason).toBe('Образи в чаті');
    expect((await svc.leaderboard()).some((r) => r.id === anna.profile.id)).toBe(false);
    clock.tick(25 * 3_600_000);
    await svc.login('anna@x.com', 'secret12');
    await svc.adminBan(mod.token, anna.profile.id, null, '');
    await expect(svc.login('anna@x.com', 'secret12')).rejects.toThrow(/назавжди/);
    await svc.adminUnban(mod.token, anna.profile.id);
    await svc.login('anna@x.com', 'secret12');
  });

  it('a ban needs a sane length', async () => {
    const { svc, mod, anna } = await setup();
    for (const h of [0, -5, Number.NaN, 1e9]) await expect(svc.adminBan(mod.token, anna.profile.id, h, '')).rejects.toThrow(/строк/);
  });
});

describe('admin actions', () => {
  it('logs a player out everywhere and deletes an account', async () => {
    const { svc, mod, anna } = await setup();
    await svc.adminLogout(mod.token, anna.profile.id);
    await expect(svc.me(anna.token)).rejects.toThrow(/./);
    await svc.adminDeleteUser(mod.token, anna.profile.id);
    await expect(svc.login('anna@x.com', 'secret12')).rejects.toThrow(/Неправильна/);
    expect((await svc.adminUsers(mod.token)).some((u) => u.id === anna.profile.id)).toBe(false);
  });

  it('currency can be taken away, never below zero', async () => {
    const { svc, mod, anna } = await setup();
    const before = (await svc.me(anna.token)).gold;
    await svc.adminGrantCurrency(mod.token, anna.profile.id, 500, 0);
    expect((await svc.me(anna.token)).gold).toBe(before + 500);
    await svc.adminGrantCurrency(mod.token, anna.profile.id, -1e9, -1e9);
    const me = await svc.me(anna.token);
    expect([me.gold, me.shards]).toEqual([0, 0]);
  });
});
