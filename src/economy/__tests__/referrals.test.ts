import { describe, expect, it } from 'vitest';
import { MemoryStore } from '../memoryStore';
import { REFERRAL_DAILY_CAP, REFERRAL_GAMES } from '../referrals';
import { GameService } from '../service';
import type { Hasher } from '../store';

const hasher: Hasher = { hash: async (p) => `h:${p}`, verify: async (p, h) => h === `h:${p}` };

async function setup(now = Date.UTC(2026, 9, 6)) {
  const svc = new GameService(new MemoryStore(), hasher, () => now, Math.random);
  await svc.init();
  const a = await svc.register('a@a.com', 'secret12', 'Анна');
  const epics = async (token: string) => (await svc.packs(token)).filter((p) => p.type === 'epic').length;
  const game = (id: string, moves: number) => (svc as unknown as { referralGame: (id: string, m: number) => Promise<void> }).referralGame(id, moves);
  return { svc, a, epics, game };
}

describe('invite a friend', () => {
  it('sign-up pays both, ten real games pay both again and give the inviter the plate', async () => {
    const { svc, a, epics, game } = await setup();
    const b = await svc.register('b@b.com', 'secret12', 'Богдан', undefined, undefined, `#${a.profile.tag.toLowerCase()}`);
    expect(await epics(a.token)).toBe(1);
    expect(await epics(b.token)).toBe(1);
    // A game with fewer than 5 moves does not count.
    await game(b.profile.id, 2);
    for (let i = 0; i < REFERRAL_GAMES - 1; i++) await game(b.profile.id, 20);
    expect((await svc.referrals(a.token)).friends[0]).toEqual({ name: 'Богдан', games: REFERRAL_GAMES - 1, done: false });
    await game(b.profile.id, 20);
    expect(await epics(a.token)).toBe(2);
    expect(await epics(b.token)).toBe(2);
    const me = await svc.me(a.token);
    expect(me.plates).toEqual(['founder']);
    expect(me.title).toBe('founder');
    // Only once.
    await game(b.profile.id, 20);
    expect(await epics(a.token)).toBe(2);
    expect((await svc.referrals(a.token)).friends[0].done).toBe(true);
  });

  it('a bad or own code gives nothing; the inviter is paid at most a few sign-ups a day', async () => {
    const { svc, a, epics } = await setup();
    const x = await svc.register('x@x.com', 'secret12', 'Ікс', undefined, undefined, 'ZZZZZZ');
    expect(await epics(x.token)).toBe(0);
    for (let i = 0; i < REFERRAL_DAILY_CAP + 2; i++) await svc.register(`f${i}@f.com`, 'secret12', `Друг${i}`, undefined, undefined, a.profile.tag);
    expect(await epics(a.token)).toBe(REFERRAL_DAILY_CAP);
    expect((await svc.referrals(a.token)).friends).toHaveLength(REFERRAL_DAILY_CAP + 2);
  });

  it('after the campaign the second reward still comes, the plate does not', async () => {
    const { svc, a, epics, game } = await setup();
    svc.founderPlateOpen = false;
    const b = await svc.register('b@b.com', 'secret12', 'Богдан', undefined, undefined, a.profile.tag);
    for (let i = 0; i < REFERRAL_GAMES; i++) await game(b.profile.id, 20);
    expect(await epics(a.token)).toBe(2);
    expect((await svc.me(a.token)).plates).toEqual([]);
  });
});
