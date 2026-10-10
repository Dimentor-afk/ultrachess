import { describe, expect, it } from 'vitest';
import { parseSquare } from '../../engine/coords';
import { classicDeck } from '../../engine/deck';
import { levelForElo } from '../../engine/bot/levels';
import { legalMoves } from '../../engine/legal';
import { type Action, createMatch, performAction } from '../../engine/match';
import { MemoryStore } from '../memoryStore';
import { type BotRunner, GameService } from '../service';
import type { Hasher } from '../store';
import { SKIN_DUPE_GOLD } from '../skins';
import { type WeeklyRun, weekWindow, weeklyBotElo, divisionByN, kyivMoment } from '../weekly';

const hasher: Hasher = { hash: async (p) => `h:${p}`, verify: async (p, h) => h === `h:${p}` };

function line(ucis: string[]): Action[] {
  let m = createMatch(classicDeck(), classicDeck());
  const out: Action[] = [];
  for (const u of ucis) {
    const move = legalMoves(m).find((x) => x.from === parseSquare(u.slice(0, 2)) && x.target === parseSquare(u.slice(2)))!;
    out.push({ type: 'move', move });
    m = performAction(m, out[out.length - 1]);
  }
  return out;
}
const WHITE_MATES = line(['e2e4', 'e7e5', 'f1c4', 'b8c6', 'd1h5', 'g8f6', 'h5f7']);
const BLACK_MATES = line(['f2f3', 'e7e5', 'g2g4', 'd8h4']);
const bot = { line: [] as Action[] };
const scripted: BotRunner = async (state) => ({ actions: [bot.line[state.history.length]], score: 0 });

// Tuesday 13 October 2026, noon in Kyiv: the league is open.
const TUESDAY = kyivMoment(2026, 10, 13, 12);
const SATURDAY = kyivMoment(2026, 10, 17, 12);

async function setup() {
  const clock = { now: TUESDAY };
  const store = new MemoryStore();
  let seed = 7;
  const rng = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const svc = new GameService(store, hasher, () => clock.now, rng, scripted);
  await svc.init();
  const r = await svc.register('w@w.com', 'secret12', 'Тижневик');
  const [p] = await svc.packs(r.token);
  await svc.openPack(r.token, p.id);
  return { clock, store, svc, token: r.token, id: r.profile.id };
}

/** Play one weekly game to the end: the player (white) mates or gets mated. */
async function play(svc: GameService, token: string, store: MemoryStore, win: boolean) {
  const start = await svc.startMatch(token, { ranked: false, weekly: true });
  // White moves first in these lines: make the player white.
  await store.updateMatch(start.matchId, { color: 'w', playerDeck: classicDeck(), botDeck: classicDeck() });
  bot.line = win ? WHITE_MATES : BLACK_MATES;
  let view = (await svc.matchAction(token, start.matchId, null, '')).view;
  while (!view.state.result) view = (await svc.matchAction(token, start.matchId, bot.line[view.state.history.length], view.v)).view;
  return svc.finishMatch(token, start.matchId, false);
}

describe('weekly league', () => {
  it('opens Monday 10:00 and closes Friday 22:00 in Kyiv', () => {
    const w = weekWindow(TUESDAY);
    expect(w.open).toBe(true);
    expect(w.opensAt).toBe(kyivMoment(2026, 10, 12, 10));
    expect(w.closesAt).toBe(kyivMoment(2026, 10, 16, 22));
    expect(weekWindow(SATURDAY).open).toBe(false);
    expect(weekWindow(kyivMoment(2026, 10, 12, 9)).open).toBe(false);
  });

  it('needs 500 trophies; the division is fixed by the trophies at entry, the bot never weaker', async () => {
    const { store, svc, token, id } = await setup();
    await expect(svc.startMatch(token, { ranked: false, weekly: true })).rejects.toThrow(/500/);
    await store.updateUser(id, { botTrophies: 1600 });
    const start = await svc.startMatch(token, { ranked: false, weekly: true });
    expect(start.weekly).toEqual({ division: 3, game: 1, wins: 0 });
    // Shown as level 0: the strength is a secret; the stored game has the real one.
    expect(start.botLevel).toBe(0);
    const m = (await store.getMatch(start.matchId))!;
    expect(m.mode).toBe('weekly');
    expect(m.botLevel).toBeGreaterThanOrEqual(levelForElo(1600));
    expect(m.botLevel).toBeLessThanOrEqual(levelForElo(1999));
    // Leaving and starting again resumes the same game.
    expect((await svc.startMatch(token, { ranked: false, weekly: true })).matchId).toBe(start.matchId);
    // More trophies later do not move the division this week.
    await store.updateUser(id, { botTrophies: 2600 });
    expect((await svc.weekly(token)).run).toMatchObject({ division: 3, rating: 1600 });
  });

  it('bots range from the rating to the division ceiling', () => {
    expect(weeklyBotElo(divisionByN(5), 800, 0)).toBe(800);
    expect(weeklyBotElo(divisionByN(5), 800, 1)).toBe(999);
    expect(weeklyBotElo(divisionByN(1), 2700, 1)).toBe(3000);
    expect(weeklyBotElo(divisionByN(1), 3400, 0.5)).toBe(3400);
  });

  it('settles once no higher tier is in reach and pays only that tier', async () => {
    const { store, svc, token, id } = await setup();
    await store.updateUser(id, { botTrophies: 1600 });
    for (let i = 0; i < 3; i++) await play(svc, token, store, true);
    for (let i = 0; i < 9; i++) await play(svc, token, store, false);
    // 3 wins, 12 played: 6 wins are still reachable with 3 games left.
    expect((await svc.weekly(token)).run).toMatchObject({ over: false, tier: 0 });
    await expect(svc.claimWeekly(token)).rejects.toThrow();
    const last = await play(svc, token, store, false);
    expect(last.weekly).toMatchObject({ wins: 3, played: 13, settled: true, tier: 0 });
    await expect(svc.startMatch(token, { ranked: false, weekly: true })).rejects.toThrow(/нагороду/);
    const before = await svc.me(token);
    const claim = await svc.claimWeekly(token);
    expect(claim.reward).toMatchObject({ gold: 180, packs: ['common'], skins: [], plate: null });
    expect(claim.profile.gold).toBe(before.gold + 180);
    await expect(svc.claimWeekly(token)).rejects.toThrow();
  });

  it('12 and 15 wins give the season skins (an owned one turns into gold), 15 also the plate', async () => {
    const { store, svc, token, id } = await setup();
    const run: WeeklyRun = { week: weekWindow(TUESDAY).key, season: 'berserk', division: 2, rating: 2100, results: Array(15).fill('w') };
    await store.updateUser(id, { weekly: JSON.stringify(run), skins: JSON.stringify(['berserk-1']) });
    const gold = (await svc.me(token)).gold;
    const claim = await svc.claimWeekly(token);
    expect(claim.reward.skins).toEqual(['berserk-1', 'berserk-2', 'berserk-3', 'berserk-4']);
    expect(claim.skinsNew).toEqual(['berserk-2', 'berserk-3', 'berserk-4']);
    expect(claim.skinsOwned).toEqual(['berserk-1']);
    expect(claim.profile.gold).toBe(gold + 750 + SKIN_DUPE_GOLD);
    expect(claim.profile.plates).toContain('weekly:berserk:2');
    expect(claim.packs.map((p) => p.type)).toEqual(['legendary']);
    // The skin can be worn now, and it shows in the player's games.
    await expect(svc.setSkin(token, 'knight-berserk', 'berserk-5')).rejects.toThrow();
    const p = await svc.setSkin(token, 'knight-berserk', 'berserk-4');
    expect(p.skinChoice).toEqual({ 'knight-berserk': 'berserk-4' });
    await store.updateUser(id, { botTrophies: 300 });
    const start = await svc.startMatch(token, { ranked: true });
    expect(start.skins[start.color]).toEqual({ 'knight-berserk': 'berserk-4' });
  });

  it('when the week closes, the reward of the wins so far waits for the player', async () => {
    const { clock, store, svc, token, id } = await setup();
    await store.updateUser(id, { botTrophies: 700 });
    for (let i = 0; i < 6; i++) await play(svc, token, store, true);
    expect((await svc.me(token)).weekly).toMatchObject({ wins: 6, played: 6, settled: false, claimable: false });
    clock.now = SATURDAY;
    expect((await svc.me(token)).weekly).toMatchObject({ open: false, claimable: true });
    await expect(svc.startMatch(token, { ranked: false, weekly: true })).rejects.toThrow(/понеділок/);
    // Next week: starting gives last week's reward first.
    clock.now = kyivMoment(2026, 10, 19, 11);
    const gold = (await svc.me(token)).gold;
    await svc.startMatch(token, { ranked: false, weekly: true });
    const me = await svc.me(token);
    expect(me.gold).toBe(gold + 180);
    expect(me.weekly).toMatchObject({ wins: 0, played: 0, claimable: false });
  });
});
