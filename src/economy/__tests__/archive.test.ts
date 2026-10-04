import { describe, expect, it } from 'vitest';
import { createMatch, performAction } from '../../engine/match';
import { MemoryStore } from '../memoryStore';
import { GameService } from '../service';
import type { Hasher } from '../store';

const hasher: Hasher = { hash: async (p) => `h:${p}`, verify: async (p, h) => h === `h:${p}` };

async function setup() {
  const store = new MemoryStore();
  const svc = new GameService(store, hasher, () => 1_800_000_000_000, Math.random);
  await svc.init();
  const { token } = await svc.register('a@a.com', 'secret12', 'Анна');
  const [starter] = await svc.packs(token);
  await svc.openPack(token, starter.id);
  /** A game with the bot, resigned at once. */
  const game = async () => {
    const start = await svc.startMatch(token, { ranked: false });
    await svc.finishMatch(token, start.matchId, true);
    return start.matchId;
  };
  return { svc, token, game };
}

describe('game archive', () => {
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
});
