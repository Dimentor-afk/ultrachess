import { describe, expect, it } from 'vitest';
import { parseSquare } from '../../engine/coords';
import { classicDeck } from '../../engine/deck';
import { legalMoves } from '../../engine/legal';
import { type Action, createMatch, performAction } from '../../engine/match';
import { MemoryStore } from '../memoryStore';
import { GameService } from '../service';
import type { Hasher } from '../store';

const hasher: Hasher = { hash: async (p) => `h:${p}`, verify: async (p, h) => h === `h:${p}` };

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

async function twoPlayers() {
  const store = new MemoryStore();
  const svc = new GameService(store, hasher, Date.now, seeded(5));
  await svc.init();
  const a = await svc.register('a@a.com', 'secret1', 'Анна');
  const b = await svc.register('b@b.com', 'secret1', 'Богдан');
  // Open the starter packs so both have a deck.
  for (const t of [a.token, b.token]) {
    const [p] = await svc.packs(t);
    await svc.openPack(t, p.id);
  }
  return { svc, store, a, b };
}

describe('friends', () => {
  it('search, request, accept, remove', async () => {
    const { svc, a, b } = await twoPlayers();
    const found = await svc.searchPlayers(a.token, 'бог');
    expect(found.map((p) => p.id)).toEqual([b.profile.id]);
    expect(await svc.searchPlayers(a.token, `#${b.profile.tag}`)).toHaveLength(1);

    await svc.addFriend(a.token, b.profile.id);
    expect((await svc.inbox(b.token)).friendRequests).toBe(1);
    const view = await svc.friends(b.token);
    expect(view.incoming).toHaveLength(1);
    const accepted = await svc.respondFriend(b.token, view.incoming[0].linkId, true);
    expect(accepted.friends.map((f) => f.id)).toEqual([a.profile.id]);
    expect((await svc.playerProfile(a.token, b.profile.id)).relation).toBe('friend');

    await svc.removeFriend(a.token, accepted.friends[0].linkId);
    expect((await svc.friends(a.token)).friends).toHaveLength(0);
  });

  it('adding someone who already asked you accepts their request', async () => {
    const { svc, a, b } = await twoPlayers();
    await svc.addFriend(a.token, b.profile.id);
    const v = await svc.addFriend(b.token, a.profile.id);
    expect(v.friends).toHaveLength(1);
  });
});

describe('friend matches', () => {
  it('challenge → accept → turn-by-turn play verified by the engine', async () => {
    const { svc, a, b } = await twoPlayers();
    await expect(svc.challengeFriend(a.token, b.profile.id)).rejects.toThrow(/друзів/);
    await svc.addFriend(a.token, b.profile.id);
    await svc.addFriend(b.token, a.profile.id);
    await svc.challengeFriend(a.token, b.profile.id);
    const { incoming } = await svc.challenges(b.token);
    expect(incoming).toHaveLength(1);
    const { pvpId } = await svc.respondChallenge(b.token, incoming[0].id, true);
    expect(pvpId).toBeTruthy();

    const sa = await svc.pvpState(a.token, pvpId!);
    const white = sa.color === 'w' ? a : b;
    const black = sa.color === 'w' ? b : a;
    let m = createMatch(sa.whiteDeck, sa.blackDeck);
    const first = legalMoves(m)[0];
    // Black may not move first; an out-of-date count is refused.
    await expect(svc.pvpAction(black.token, pvpId!, { type: 'move', move: first }, 0)).rejects.toThrow(/суперника/);
    await svc.pvpAction(white.token, pvpId!, { type: 'move', move: first }, 0);
    await expect(svc.pvpAction(white.token, pvpId!, { type: 'move', move: first }, 0)).rejects.toThrow();
    m = performAction(m, { type: 'move', move: first });
    expect((await svc.inbox(black.token)).yourTurn).toBe(1);

    // An illegal action is rejected by the replay.
    const bogus: Action = { type: 'move', move: { ...legalMoves(m)[0], target: parseSquare('e4'), to: parseSquare('e4') } };
    await expect(svc.pvpAction(black.token, pvpId!, bogus, 1)).rejects.toThrow();

    const state = await svc.pvpResign(black.token, pvpId!);
    expect(state.status).toBe('finished');
    const hist = await svc.history(white.token);
    expect(hist[0]).toMatchObject({ kind: 'friend', outcome: 'win' });
    const games = (await svc.challenges(white.token)).games;
    expect(games[0]).toMatchObject({ status: 'finished', outcome: 'win' });
  });

  it('a checkmate finishes the game on the server', async () => {
    const { svc, store, a, b } = await twoPlayers();
    for (const pl of [a, b]) {
      for (const id of ['pawn-classic', 'knight-classic', 'bishop-classic', 'rook-classic', 'queen-classic', 'king-classic']) {
        await store.addCard(pl.profile.id, id);
      }
      await svc.saveDeck(pl.token, classicDeck('classic', 'Класика'));
      await svc.setActiveDeck(pl.token, 'classic');
    }
    await svc.addFriend(a.token, b.profile.id);
    await svc.addFriend(b.token, a.profile.id);
    await svc.challengeFriend(a.token, b.profile.id);
    const { pvpId } = await svc.respondChallenge(b.token, (await svc.challenges(b.token)).incoming[0].id, true);
    const sa = await svc.pvpState(a.token, pvpId!);
    // Fool's mate for black: f3 e5 g4 Qh4#.
    let m = createMatch(sa.whiteDeck, sa.blackDeck);
    const tokenOf = (c: 'w' | 'b') => ((sa.color === c ? a : b).token);
    let n = 0;
    for (const uci of ['f2f3', 'e7e5', 'g2g4', 'd8h4']) {
      const mv = legalMoves(m).find((x) => x.from === parseSquare(uci.slice(0, 2)) && x.target === parseSquare(uci.slice(2)))!;
      await svc.pvpAction(tokenOf(m.turn), pvpId!, { type: 'move', move: mv }, n++);
      m = performAction(m, { type: 'move', move: mv });
    }
    expect(m.result?.winner).toBe('b');
    expect((await svc.pvpState(a.token, pvpId!)).status).toBe('finished');
  });
});

describe('profile', () => {
  it('nickname and avatar from owned cards', async () => {
    const { svc, a } = await twoPlayers();
    const owned = Object.keys((await svc.collection(a.token)).owned);
    const p = await svc.updateProfile(a.token, { name: 'Анна К', avatar: owned[0] });
    expect(p).toMatchObject({ name: 'Анна К', avatar: owned[0] });
    await expect(svc.updateProfile(a.token, { avatar: 'queen-immortal' })).rejects.toThrow();
    expect(p.tag).toMatch(/^[0-9A-F]{6}$/);
  });
});
