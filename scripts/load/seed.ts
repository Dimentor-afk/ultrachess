// Seed N users straight into the server's SQLite file: tokens, opened starter packs,
// a mix of bot-ladder trophies (so bot levels vary) and pairs of friends with a game.
import { writeFileSync } from 'node:fs';
import { SqliteStore } from '../../server/sqliteStore';
import { GameService } from '../../src/economy/service';
const [file, botN, pairN, specN] = [process.argv[2], +process.argv[3], +process.argv[4], +process.argv[5]];
const hasher = { hash: async (p: string) => `h:${p}`, verify: async (p: string, h: string) => h === `h:${p}` };
const store = new SqliteStore(file);
const svc = new GameService(store, hasher, Date.now, Math.random);
await svc.init();
const mk = async (i: number, kind: string) => {
  const r = await svc.register(`${kind}${i}@load.test`, 'secret-pass-1', `Гравець ${kind}${i}`);
  const [p] = await svc.packs(r.token); await svc.openPack(r.token, p.id);
  return r;
};
const out: any = { bot: [], pairs: [], spec: [] };
for (let i = 0; i < botN; i++) {
  const r = await mk(i, 'bot');
  // Spread across leagues: most players are low, some reach the strong bots.
  const t = [0, 0, 0, 100, 300, 600, 900, 1300, 1700, 2100][i % 10];
  await store.updateUser(r.profile.id, { botTrophies: t });
  out.bot.push(r.token);
}
for (let i = 0; i < pairN; i++) {
  const a = await mk(i, 'pa'), b = await mk(i, 'pb');
  await svc.addFriend(a.token, b.profile.id); await svc.addFriend(b.token, a.profile.id);
  await svc.challengeFriend(a.token, b.profile.id);
  const { incoming } = await svc.challenges(b.token);
  const { pvpId } = await svc.respondChallenge(b.token, incoming[0].id, true);
  out.pairs.push({ a: a.token, b: b.token, id: pvpId });
}
for (let i = 0; i < specN; i++) out.spec.push((await mk(i, 'sp')).token);
writeFileSync(process.argv[6], JSON.stringify(out));
console.log('seeded', out.bot.length, out.pairs.length * 2, out.spec.length);
