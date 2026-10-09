import { describe, expect, it } from 'vitest';
import { MemoryStore } from '../memoryStore';
import { PATCH_ID } from '../patch';
import { GameService } from '../service';
import type { Hasher } from '../store';

const hasher: Hasher = { hash: async (p) => `h:${p}`, verify: async (p, h) => h === `h:${p}` };

describe('patch notes', () => {
  it('a player from before the patch sees the notes once; a new player does not', async () => {
    const store = new MemoryStore();
    const svc = new GameService(store, hasher, () => 1_800_000_000_000, Math.random);
    await svc.init();
    const old = await svc.register('old@x.com', 'secret12', 'Старий');
    const fresh = await svc.register('new@x.com', 'secret12', 'Новий');
    expect(fresh.profile.newPatch).toBe(false);
    // An account made before this patch has not seen it.
    await store.updateUser(old.profile.id, { patchSeen: '' });
    expect((await svc.me(old.token)).newPatch).toBe(true);
    expect((await svc.seePatch(old.token)).newPatch).toBe(false);
    expect((await store.getUser(old.profile.id))!.patchSeen).toBe(PATCH_ID);
  });
});
