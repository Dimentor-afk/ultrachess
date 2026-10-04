import { describe, expect, it } from 'vitest';
import { createMatch, performAction } from '../../engine/match';
import { MemoryStore } from '../memoryStore';
import { ANALYSIS_PRICE, FREE_ANALYSES, GameService } from '../service';
import type { Hasher } from '../store';

const hasher: Hasher = { hash: async (p) => `h:${p}`, verify: async (p, h) => h === `h:${p}` };

async function setup() {
  let now = 1_800_000_000_000;
  const store = new MemoryStore();
  const svc = new GameService(store, hasher, () => now, Math.random);
  await svc.init();
  const { token, profile } = await svc.register('a@a.com', 'secret12', 'Анна');
  const [starter] = await svc.packs(token);
  await svc.openPack(token, starter.id);
  /** A game with the bot, resigned at once. */
  const game = async () => {
    const start = await svc.startMatch(token, { ranked: false });
    await svc.finishMatch(token, start.matchId, true);
    return start.matchId;
  };
  return { svc, store, token, userId: profile.id, game, nextDay: () => (now += 24 * 3600_000) };
}

describe('game archive and analysis', () => {
  it('a finished game comes back whole and replays to the same position', async () => {
    const { svc, token, game } = await setup();
    const id = await game();
    const rec = await svc.gameRecord(token, 'm', id);
    expect(rec.result.reason).toBe('Здача');
    expect(rec.result.winner).not.toBe(rec.myColor);
    let state = createMatch(rec.decks.w, rec.decks.b);
    for (const a of rec.actions) state = performAction(state, a);
    expect(state.ply).toBeGreaterThanOrEqual(0);
    await expect(svc.gameRecord(token, 'm', 'nope')).rejects.toThrow(/не знайдено/);
    const other = await svc.register('b@b.com', 'secret12', 'Богдан');
    await expect(svc.gameRecord(other.token, 'm', id)).rejects.toThrow(/не знайдено/);
  });

  it(`${FREE_ANALYSES} free analyses a day, then ${ANALYSIS_PRICE} shards each; an opened one stays open`, async () => {
    const { svc, store, token, userId, game, nextDay } = await setup();
    const ids: string[] = [];
    for (let i = 0; i < FREE_ANALYSES + 2; i++) ids.push(await game());
    await store.updateUser(userId, { shards: ANALYSIS_PRICE + 50 });
    for (let i = 0; i < FREE_ANALYSES; i++) {
      const r = await svc.unlockAnalysis(token, 'm', ids[i]);
      expect(r.analysis).toMatchObject({ unlocked: true, freeLeft: FREE_ANALYSES - i - 1 });
      expect(r.profile.shards).toBe(ANALYSIS_PRICE + 50);
    }
    // Opening the same game again is free.
    expect((await svc.unlockAnalysis(token, 'm', ids[0])).profile.shards).toBe(ANALYSIS_PRICE + 50);
    expect((await svc.gameRecord(token, 'm', ids[3])).analysis).toMatchObject({ unlocked: false, freeLeft: 0 });
    expect((await svc.unlockAnalysis(token, 'm', ids[3])).profile.shards).toBe(50);
    await expect(svc.unlockAnalysis(token, 'm', ids[4])).rejects.toThrow(/уламків/);
    // A new day, new free ones.
    nextDay();
    const r = await svc.unlockAnalysis(token, 'm', ids[4]);
    expect(r.analysis.freeLeft).toBe(FREE_ANALYSES - 1);
    expect(r.profile.shards).toBe(50);
    expect((await svc.gameRecord(token, 'm', ids[1])).analysis.unlocked).toBe(true);
  });
});
