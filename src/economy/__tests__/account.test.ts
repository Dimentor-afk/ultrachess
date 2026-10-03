import { describe, expect, it } from 'vitest';
import { nameProblem, passwordProblem } from '../account';
import { MemoryStore } from '../memoryStore';
import { GameService, type Mail } from '../service';
import type { Hasher } from '../store';

const hasher: Hasher = { hash: async (p) => `h:${p}`, verify: async (p, h) => h === `h:${p}` };
const BASE = 'https://ultrachess.test/';

async function setup() {
  let now = 1_800_000_000_000;
  const clock = { tick: (ms: number) => (now += ms) };
  const store = new MemoryStore();
  const svc = new GameService(store, hasher, () => now, Math.random);
  await svc.init();
  const sent: Mail[] = [];
  svc.mailer = async (m) => void sent.push(m);
  const linkIn = (m: Mail) => /#\/(?:reset|verify)\/([a-f0-9]{64})/.exec(m.text)![1];
  const a = await svc.register('anna@x.com', 'secret12', 'Анна', BASE);
  return { svc, store, sent, linkIn, clock, a };
}

describe('nicknames and passwords', () => {
  it('nicknames: length, characters, reserved names and a basic filter', () => {
    for (const ok of ['Анна', 'Dmytro_99', "О'Браєн", 'Ботан', 'Сукня', 'Grapefruit', 'Майстер Йода']) expect(nameProblem(ok)).toBeNull();
    for (const bad of ['Ан', 'x'.repeat(25), 'Анна😀', '123', '<b>Анна</b>', 'Admin', 'адмін', 'Бот Мартін', 'Ultrachess', 'xyйло', 'Х у й', 'FuckYou', 'бля дь']) {
      expect(nameProblem(bad), bad).not.toBeNull();
    }
  });

  it('the swearing filter: repeated letters, digits for letters, transliteration, other languages', () => {
    for (const bad of ['хууууй', 'Fuuuck', 'p1zda', 'Pizdets', 'Blyat_99', 'Сука', 'su ka', 'ПиДоР', 'долбойоб', 'Єбанько', 'yebat', 'Cazzo', 'Hurensohn', 'Puta', 'big ass', 'Wolf 1488', 'Гітлер', 'xyйня', 'shiiit']) {
      expect(nameProblem(bad), bad).toMatch(/не можна/);
    }
    // Ordinary names with a bad root inside them stay allowed.
    for (const ok of ['Херсонець', 'Dickens', 'Hitchcock', 'Essex', 'Nazim', 'Lebanon', 'Rebate', 'Fukuda', 'Сучков', 'Bassist', 'Diputado', 'Онлайн', 'Анна']) {
      expect(nameProblem(ok), ok).toBeNull();
    }
  });

  it('passwords: long enough, not a common one, not the e-mail', () => {
    expect(passwordProblem('secret12')).toBeNull();
    expect(passwordProblem('short1')).toMatch(/8/);
    expect(passwordProblem('12345678')).toMatch(/простий/);
    expect(passwordProblem('aaaaaaaaaa')).toMatch(/простий/);
    expect(passwordProblem('dmytro2024!', 'dmytro@x.com')).toMatch(/пошту/);
    expect(passwordProblem('x'.repeat(200))).toMatch(/128/);
  });

  it('registration checks both; an empty nickname comes from the e-mail', async () => {
    const { svc } = await setup();
    await expect(svc.register('b@x.com', '1234567', 'Богдан')).rejects.toThrow(/8 символів/);
    await expect(svc.register('b@x.com', 'secret12', 'Адмін')).rejects.toThrow(/зарезервовано/);
    expect((await svc.register('bohdan.k@x.com', 'secret12', '  ')).profile.name).toBe('bohdan.k');
    expect((await svc.register('b@x.com', 'secret12', '')).profile.name).toBe('Гравець');
  });

  it('a nickname can be changed once a week', async () => {
    const { svc, a, clock } = await setup();
    const p = await svc.updateProfile(a.token, { name: '  Анна   Ко ' });
    expect(p.name).toBe('Анна Ко');
    expect(p.nameChangeAt).toBeGreaterThan(0);
    await expect(svc.updateProfile(a.token, { name: 'Анна К' })).rejects.toThrow(/раз на 7 днів/);
    // The same name or only the avatar is not a change.
    await expect(svc.updateProfile(a.token, { name: 'Анна Ко' })).resolves.toBeTruthy();
    clock.tick(7 * 864e5 + 1);
    expect((await svc.updateProfile(a.token, { name: 'Анна К' })).name).toBe('Анна К');
  });
});

describe('e-mail links', () => {
  it('registration sends a confirmation link; it confirms the address once', async () => {
    const { svc, sent, linkIn, a } = await setup();
    expect(a.profile.emailVerified).toBe(false);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: 'anna@x.com', subject: expect.stringMatching(/підтвердіть/) });
    expect(sent[0].html).toContain(BASE);
    const link = linkIn(sent[0]);
    await expect(svc.verifyEmail(link)).resolves.toEqual({ email: 'anna@x.com' });
    expect((await svc.me(a.token)).emailVerified).toBe(true);
    await expect(svc.verifyEmail(link)).rejects.toThrow(/недійсне/);
    await expect(svc.sendVerification(a.token, BASE)).rejects.toThrow(/вже підтверджено/);
  });

  it('password reset: same answer for unknown e-mails, one-time link, everyone else signed out', async () => {
    const { svc, store, sent, linkIn, clock, a } = await setup();
    // The letter goes out in the background: wait for it after asking.
    const ask = async (email: string) => {
      const r = await svc.requestPasswordReset(email, BASE);
      await new Promise((ok) => setTimeout(ok, 20));
      return r;
    };
    sent.length = 0;
    expect(await ask('nobody@x.com')).toEqual({ sent: true });
    expect(sent).toHaveLength(0);
    expect(await ask(' ANNA@x.com ')).toEqual({ sent: true });
    expect(sent).toHaveLength(1);
    // Asking again at once sends nothing new (and says the same).
    expect(await ask('anna@x.com')).toEqual({ sent: true });
    expect(sent).toHaveLength(1);
    // Only a hash of the link is stored.
    expect(JSON.stringify(store.data.tokens)).not.toContain(linkIn(sent[0]));

    const other = await svc.login('anna@x.com', 'secret12');
    await expect(svc.resetPassword(linkIn(sent[0]), 'short')).rejects.toThrow(/8 символів/);
    const r = await svc.resetPassword(linkIn(sent[0]), 'brand-new-1');
    expect(r.profile.emailVerified).toBe(true);
    await expect(svc.me(a.token)).rejects.toThrow();
    await expect(svc.me(other.token)).rejects.toThrow();
    await expect(svc.me(r.token)).resolves.toBeTruthy();
    await expect(svc.login('anna@x.com', 'secret12')).rejects.toThrow(/Неправильна/);
    await svc.login('anna@x.com', 'brand-new-1');
    await expect(svc.resetPassword(linkIn(sent[0]), 'another-pw-2')).rejects.toThrow(/недійсне/);

    // A link works for an hour.
    clock.tick(61_000);
    await ask('anna@x.com');
    clock.tick(60 * 60_000 + 1);
    await expect(svc.resetPassword(linkIn(sent[1]), 'another-pw-2')).rejects.toThrow(/застаріло/);
  });

  it('the demo answers with the link instead of a letter', async () => {
    const { svc } = await setup();
    svc.mailer = null;
    svc.showLinks = true;
    const r = await svc.requestPasswordReset('anna@x.com', BASE);
    expect(r.link).toMatch(/^https:\/\/ultrachess\.test\/#\/reset\/[a-f0-9]{64}$/);
    expect((await svc.requestPasswordReset('nobody@x.com', BASE)).link).toBeUndefined();
  });
});

describe('account settings', () => {
  it('changing the password needs the current one and signs out the other devices', async () => {
    const { svc, a } = await setup();
    const phone = await svc.login('anna@x.com', 'secret12');
    await expect(svc.changePassword(a.token, 'wrong-pw', 'brand-new-1')).rejects.toThrow(/поточний пароль/);
    await expect(svc.changePassword(a.token, 'secret12', '12345678')).rejects.toThrow(/простий/);
    await svc.changePassword(a.token, 'secret12', 'brand-new-1');
    await expect(svc.me(a.token)).resolves.toBeTruthy();
    await expect(svc.me(phone.token)).rejects.toThrow();
    await svc.login('anna@x.com', 'brand-new-1');
  });

  it('changing the e-mail: password, a free address, confirmation again, and a note to the old one', async () => {
    const { svc, sent, linkIn, a } = await setup();
    const oldLink = linkIn(sent[0]);
    await svc.register('taken@x.com', 'secret12', 'Богдан');
    await expect(svc.changeEmail(a.token, 'wrong-pw', 'new@x.com', BASE)).rejects.toThrow(/поточний пароль/);
    await expect(svc.changeEmail(a.token, 'secret12', 'taken@x.com', BASE)).rejects.toThrow(/зайнята/);
    sent.length = 0;
    const r = await svc.changeEmail(a.token, 'secret12', 'New@X.com', BASE);
    expect(r.profile).toMatchObject({ email: 'new@x.com', emailVerified: false });
    expect(sent.map((m) => m.to)).toEqual(['new@x.com', 'anna@x.com']);
    // The link sent to the old address no longer confirms anything.
    await expect(svc.verifyEmail(oldLink)).rejects.toThrow(/недійсне/);
    await svc.verifyEmail(linkIn(sent[0]));
    await expect(svc.login('anna@x.com', 'secret12')).rejects.toThrow();
    await svc.login('new@x.com', 'secret12');
  });

  it('sign out everywhere else', async () => {
    const { svc, a } = await setup();
    const phone = await svc.login('anna@x.com', 'secret12');
    await svc.logoutOthers(a.token);
    await expect(svc.me(phone.token)).rejects.toThrow();
    await expect(svc.me(a.token)).resolves.toBeTruthy();
  });

  it('deleting the account: games resigned, friends gone, nothing left to find, the e-mail free again', async () => {
    const { svc, a } = await setup();
    const b = await svc.register('bohdan@x.com', 'secret12', 'Богдан');
    for (const t of [a.token, b.token]) {
      const [p] = await svc.packs(t);
      await svc.openPack(t, p.id);
    }
    await svc.addFriend(a.token, b.profile.id);
    await svc.addFriend(b.token, a.profile.id);
    await svc.challengeFriend(a.token, b.profile.id);
    const { incoming } = await svc.challenges(b.token);
    const { pvpId } = await svc.respondChallenge(b.token, incoming[0].id, true);

    await expect(svc.deleteAccount(a.token, 'wrong-pw')).rejects.toThrow(/поточний пароль/);
    await svc.deleteAccount(a.token, 'secret12');
    await expect(svc.me(a.token)).rejects.toThrow();
    await expect(svc.login('anna@x.com', 'secret12')).rejects.toThrow();
    const game = await svc.pvpState(b.token, pvpId!);
    expect(game.status).toBe('finished');
    expect(game.white.id === a.profile.id ? game.white.name : game.black.name).toBe('Видалений гравець');
    expect((await svc.friends(b.token)).friends).toHaveLength(0);
    expect(await svc.searchPlayers(b.token, 'Анна')).toHaveLength(0);
    expect((await svc.leaderboard()).some((r) => r.id === a.profile.id)).toBe(false);
    await expect(svc.playerProfile(b.token, a.profile.id)).rejects.toThrow(/не знайдено/);
    // The address can start a new account (a fresh one, not the deleted).
    const again = await svc.register('anna@x.com', 'secret12', 'Анна');
    expect(again.profile.id).not.toBe(a.profile.id);
  });
});
