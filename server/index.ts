// Ultrachess server: JSON API over the game service + static site from dist/.
// Run: npm run server   (PORT, DB_FILE and DIST_DIR are optional env vars)

import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { type IncomingMessage, type ServerResponse, createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { createGzip, gzipSync } from 'node:zlib';
import { promisify } from 'node:util';
import { ADMIN_EMAILS, ApiError, GameService } from '../src/economy/service';
import type { Hasher } from '../src/economy/store';
import { BotPool } from './botPool';
import { Hub } from './hub';
import { resendMailer } from './mailer';
import { PaddlePayments, paddleConfig } from './paddle';
import { TestPayments } from '../src/economy/payments';
import { SqliteStore } from './sqliteStore';
import de from '../src/i18n/de';
import en from '../src/i18n/en';
import es from '../src/i18n/es';
import it from '../src/i18n/it';

const PORT = Number(process.env.PORT ?? 8080);
const DB_FILE = process.env.DB_FILE ?? 'ultrachess.db';
const DIST = resolve(process.env.DIST_DIR ?? 'dist');
const COOKIE = 'uc_session';

/** Sent with every response. */
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'X-Frame-Options': 'SAMEORIGIN',
  // Pages of other sites cannot frame this one or keep a handle to its window.
  'Content-Security-Policy': "frame-ancestors 'self'",
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};
/** Behind HTTPS (Fly, Render): browsers must keep using it for this site. */
const HSTS = 'max-age=31536000';

const scryptAsync = promisify(scrypt) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

const hasher: Hasher = {
  async hash(password) {
    const salt = randomBytes(16);
    const key = await scryptAsync(password, salt, 64);
    return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
  },
  async verify(password, stored) {
    const [kind, salt, hash] = stored.split('$');
    if (kind !== 'scrypt') return false;
    const key = await scryptAsync(password, Buffer.from(salt, 'hex'), 64);
    const want = Buffer.from(hash, 'hex');
    return want.length === key.length && timingSafeEqual(want, key);
  },
};

// ── Rate limits ──
// A fixed window per key and bucket: enough to stop password guessing and
// someone keeping the bot threads busy, invisible to normal play. Signed-in
// requests count per session, not per address: a whole class on one school
// Wi-Fi shares an IP.

const LIMITS = {
  /** Login/registration attempts for one e-mail from one address. */
  auth: { max: 10, windowMs: 10 * 60_000 },
  /** All login/registration attempts from one address. */
  authIp: { max: 300, windowMs: 10 * 60_000 },
  /** Moves in bot games (each one may start a bot search). */
  bot: { max: 60, windowMs: 60_000 },
  /** Letters asked for from one address (password reset, confirmation, new e-mail). */
  mail: { max: 10, windowMs: 60 * 60_000 },
  /** Actions that check a password while signed in (change password or e-mail, delete). */
  password: { max: 10, windowMs: 10 * 60_000 },
  /** Everything else. */
  api: { max: 1200, windowMs: 60_000 },
};
const hits = new Map<string, { n: number; until: number }>();

function clientIp(req: IncomingMessage): string {
  // Fly.io and Render put the visitor's address in these headers.
  const fwd = String(req.headers['fly-client-ip'] ?? req.headers['x-forwarded-for'] ?? '').split(',')[0].trim();
  return fwd || req.socket.remoteAddress || '?';
}

/** False when `who` used up the bucket's window. */
function allow(bucket: keyof typeof LIMITS, who: string): boolean {
  const { max, windowMs } = LIMITS[bucket];
  const key = `${bucket}:${who}`;
  const now = Date.now();
  const h = hits.get(key);
  if (!h || h.until < now) {
    hits.set(key, { n: 1, until: now + windowMs });
    return true;
  }
  return ++h.n <= max;
}

setInterval(() => {
  const now = Date.now();
  for (const [k, h] of hits) if (h.until < now) hits.delete(k);
}, 60_000).unref();

const store = new SqliteStore(DB_FILE);
const bots = new BotPool();
// ADMIN_EMAILS="a@x.com,b@y.com" overrides the built-in list. A seeded admin account is
// claimed by its first registration: register it right after the first deploy.
const admins = process.env.ADMIN_EMAILS ? process.env.ADMIN_EMAILS.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean) : ADMIN_EMAILS;
const svc = new GameService(store, hasher, Date.now, Math.random, bots.run, admins);
svc.mailer = resendMailer();
if (!svc.mailer) console.log('No RESEND_API_KEY: links from letters (password reset, confirmation) go to this log.');
// PUBLIC_URL="https://ultrachess.app" — where links in letters point. Without it, the
// request's Host is used; set it in production so a forged Host cannot redirect the links.
const PUBLIC_URL = process.env.PUBLIC_URL ? process.env.PUBLIC_URL.replace(/\/*$/, '/') : null;
if (!PUBLIC_URL && svc.mailer) console.warn('PUBLIC_URL is not set: links in letters use the Host of each request.');

// Letters go out in the language the player uses the site in (the client sends X-Lang).
const DICTS: Record<string, Record<string, string>> = { en, de, it, es };
svc.localize = (lang) => {
  const d = DICTS[lang];
  return d ? (text, ...args) => (d[text] ?? text).replace(/\{(\d+)\}/g, (m, i) => (i < args.length ? String(args[+i]) : m)) : null;
};

function langOf(req: IncomingMessage): string {
  return String(req.headers['x-lang'] ?? '').slice(0, 5);
}

// Payments: PADDLE_* → Paddle (Merchant of Record); PAYMENTS=test → test payments
// (no money: never in production, anyone could "pay"); neither → shards are not on sale.
const paddleCfg = paddleConfig(process.env);
const paddle = paddleCfg ? new PaddlePayments(paddleCfg) : null;
svc.payments = paddle ?? (process.env.PAYMENTS === 'test' ? new TestPayments() : null);
if (svc.payments?.id === 'test') console.warn('PAYMENTS=test: purchases need no money. Never use this in production.');
else if (paddle) console.log(`Payments: Paddle${paddleCfg!.sandbox ? ' (sandbox)' : ''}.`);
else console.log('No PADDLE_* settings: shards are not on sale.');
// Until the payment service has approved the site, only admins see and buy shards for money.
// PAYMENTS_PUBLIC=1 opens the sale to everyone.
svc.paymentsAdminOnly = !!paddle && process.env.PAYMENTS_PUBLIC !== '1';
if (svc.paymentsAdminOnly) console.log('Shards for money: admins only (set PAYMENTS_PUBLIC=1 to open the sale).');

/** Paddle's notice: the raw body is needed to check its signature. */
async function paddleWebhook(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > 256 * 1024) return void res.writeHead(413).end();
    chunks.push(c as Buffer);
  }
  const raw = Buffer.concat(chunks);
  if (!paddle || !paddle.signed(raw, String(req.headers['paddle-signature'] ?? ''))) {
    console.warn('Paddle webhook with a bad or missing signature, ignored.');
    return void res.writeHead(400).end();
  }
  // Signed but about something else (another event, a partial refund): nothing to do.
  const notice = await paddle.notice(raw);
  if (notice) await svc.paymentNotice('paddle', notice.purchaseId, notice.transactionId, notice.state);
  // 200 tells Paddle the notice arrived; anything else and it tries again later.
  res.writeHead(200).end();
}

/** The site's address for links in letters. */
function siteBase(req: IncomingMessage): string {
  return PUBLIC_URL ?? `${isSecure(req) ? 'https' : 'http'}://${req.headers.host ?? 'localhost'}/`;
}

function tokenOf(req: IncomingMessage): string | null {
  const m = /(?:^|;\s*)uc_session=([a-f0-9]+)/.exec(req.headers.cookie ?? '');
  return m ? m[1] : null;
}

function setCookie(res: ServerResponse, token: string | null, secure: boolean): void {
  const attrs = ['Path=/', 'HttpOnly', 'SameSite=Lax', secure ? 'Secure' : ''].filter(Boolean).join('; ');
  res.setHeader('Set-Cookie', token ? `${COOKIE}=${token}; Max-Age=${30 * 86400}; ${attrs}` : `${COOKIE}=; Max-Age=0; ${attrs}`);
}

function send(res: ServerResponse, status: number, data?: unknown, req?: IncomingMessage): void {
  if (data === undefined) {
    res.writeHead(status === 200 ? 204 : status, SECURITY_HEADERS).end();
    return;
  }
  const json = JSON.stringify(data);
  const headers: Record<string, string> = { ...SECURITY_HEADERS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', Vary: 'Accept-Encoding' };
  // Game records grow with every move: compress the bigger answers.
  if (json.length > 1024 && req && /\bgzip\b/.test(String(req.headers['accept-encoding'] ?? ''))) {
    res.writeHead(status, { ...headers, 'Content-Encoding': 'gzip' }).end(gzipSync(json));
    return;
  }
  res.writeHead(status, headers).end(json);
}

/**
 * Requests that change something must come from this site (a second line of
 * defence after the SameSite cookie): a browser always sends Origin on them.
 */
function sameOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > 2_000_000) throw new ApiError(413, 'Запит завеликий.');
    chunks.push(chunk as Buffer);
  }
  if (!chunks.length) return {};
  let data: unknown;
  try {
    data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new ApiError(400, 'Некоректний JSON.');
  }
  // Handlers read fields of an object: `null`, a number or an array would crash them.
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new ApiError(400, 'Очікується JSON-об’єкт.');
  return data as Record<string, unknown>;
}

type Handler = (ctx: { req: IncomingMessage; res: ServerResponse; token: string; body: Record<string, unknown>; params: string[] }) => Promise<unknown>;

const routes: [string, RegExp, Handler][] = [
  ['GET', /^health$/, async () => ({ ok: true })],
  [
    'POST',
    /^auth\/register$/,
    async ({ req, res, body }) => {
      const r = await svc.register(String(body.email ?? ''), String(body.password ?? ''), String(body.name ?? ''), siteBase(req), langOf(req), body.ref ? String(body.ref).slice(0, 12) : undefined);
      setCookie(res, r.token, isSecure(req));
      return r.profile;
    },
  ],
  [
    'POST',
    /^auth\/login$/,
    async ({ req, res, body }) => {
      const r = await svc.login(String(body.email ?? ''), String(body.password ?? ''));
      setCookie(res, r.token, isSecure(req));
      return r.profile;
    },
  ],
  [
    'POST',
    /^auth\/logout$/,
    async ({ req, res, token }) => {
      await svc.logout(token);
      setCookie(res, null, isSecure(req));
    },
  ],
  ['POST', /^auth\/logout-others$/, ({ token }) => svc.logoutOthers(token)],
  ['POST', /^auth\/forgot$/, ({ req, body }) => svc.requestPasswordReset(String(body.email ?? ''), siteBase(req), langOf(req))],
  [
    'POST',
    /^auth\/reset$/,
    async ({ req, res, body }) => {
      const r = await svc.resetPassword(String(body.token ?? ''), String(body.password ?? ''));
      setCookie(res, r.token, isSecure(req));
      return r.profile;
    },
  ],
  ['POST', /^auth\/verify$/, ({ body }) => svc.verifyEmail(String(body.token ?? ''))],
  ['POST', /^account\/verify$/, ({ req, token }) => svc.sendVerification(token, siteBase(req), langOf(req))],
  ['POST', /^account\/password$/, ({ token, body }) => svc.changePassword(token, String(body.current ?? ''), String(body.password ?? ''))],
  ['POST', /^account\/email$/, ({ req, token, body }) => svc.changeEmail(token, String(body.password ?? ''), String(body.email ?? ''), siteBase(req), langOf(req))],
  [
    'POST',
    /^account\/delete$/,
    async ({ req, res, token, body }) => {
      await svc.deleteAccount(token, String(body.password ?? ''));
      setCookie(res, null, isSecure(req));
    },
  ],
  // Signed-out visitors get null instead of a 401, so the console stays clean.
  ['GET', /^me$/, ({ token }) => svc.me(token).catch(() => null)],
  ['GET', /^collection$/, ({ token }) => svc.collection(token)],
  ['GET', /^packs$/, ({ token }) => svc.packs(token)],
  ['POST', /^packs\/(\w+)\/open$/, ({ token, params }) => svc.openPack(token, params[0])],
  ['GET', /^shop$/, ({ token }) => svc.shop(token)],
  ['GET', /^shop\/shards$/, ({ token }) => svc.shardOffer(token)],
  ['POST', /^shop\/shards$/, ({ req, token, body }) => svc.buyShards(token, String(body.product ?? ''), siteBase(req))],
  ['GET', /^purchases$/, ({ token }) => svc.purchases(token)],
  ['GET', /^purchases\/(\w+)$/, ({ token, params }) => svc.purchase(token, params[0])],
  ['POST', /^payments\/test\/(\w+)$/, ({ token, params, body }) => svc.completeTestPayment(token, params[0], !!body.ok)],
  ['GET', /^games\/([mp])\/(\w+)$/, ({ token, params }) => svc.gameRecord(token, params[0], params[1])],
  ['GET', /^admin\/purchases$/, ({ token }) => svc.adminPurchases(token)],
  ['POST', /^admin\/purchases\/(\w+)\/delete$/, ({ token, params }) => svc.adminDeletePurchase(token, params[0])],
  ['POST', /^shop\/pack$/, ({ token, body }) => svc.buyPack(token, String(body.type) as never)],
  ['POST', /^shop\/free-pack$/, ({ token }) => svc.claimFreePack(token)],
  ['POST', /^shop\/theme$/, ({ token, body }) => svc.buyTheme(token, String(body.id ?? ''))],
  ['POST', /^profile\/theme$/, ({ token, body }) => svc.setBoardTheme(token, String(body.id ?? ''))],
  ['POST', /^shop\/fx$/, ({ token, body }) => svc.buyCaptureFx(token, String(body.id ?? ''))],
  ['POST', /^profile\/fx$/, ({ token, body }) => svc.setCaptureFx(token, String(body.id ?? ''))],
  ['GET', /^decks$/, ({ token }) => svc.decks(token)],
  ['PUT', /^decks$/, ({ token, body }) => svc.saveDeck(token, body as never)],
  ['POST', /^decks\/active$/, ({ token, body }) => svc.setActiveDeck(token, String(body.id ?? ''))],
  ['DELETE', /^decks\/([\w-]+)$/, ({ token, params }) => svc.deleteDeck(token, params[0])],
  [
    'POST',
    /^matches$/,
    ({ token, body }) =>
      svc.startMatch(token, {
        deckId: body.deckId ? String(body.deckId) : undefined,
        ranked: !!body.ranked,
        level: body.level !== undefined ? Number(body.level) : undefined,
        trial: body.trial ? String(body.trial) : undefined,
      }),
  ],
  [
    'POST',
    /^matches\/(\w+)\/action$/,
    ({ token, params, body }) =>
      svc.matchAction(token, params[0], body.action && typeof body.action === 'object' ? (body.action as never) : null, String(body.v ?? '')),
  ],
  ['POST', /^matches\/(\w+)\/finish$/, ({ token, params, body }) => svc.finishMatch(token, params[0], !!body.resigned)],
  ['GET', /^leaderboard$/, () => svc.leaderboard()],
  ['POST', /^profile$/, ({ token, body }) =>
    svc.updateProfile(token, {
      name: body.name !== undefined ? String(body.name) : undefined,
      avatar: body.avatar !== undefined ? String(body.avatar) : undefined,
    })],
  ['GET', /^players\/(\w+)$/, ({ token, params }) => svc.playerProfile(token, params[0])],
  ['GET', /^history$/, ({ token }) => svc.history(token)],
  ['GET', /^inbox$/, ({ token }) => svc.inbox(token)],
  ['POST', /^admin\/bot$/, ({ token, body }) => svc.setBotOverride(token, body.level === null || body.level === undefined ? null : Number(body.level))],
  ['GET', /^achievements$/, ({ token }) => svc.achievements(token)],
  ['POST', /^achievements\/seen$/, ({ token, body }) => svc.seeAchievements(token, Array.isArray(body.ids) ? body.ids.map(String).slice(0, 100) : [])],
  ['POST', /^achievements\/showcase$/, ({ token, body }) => svc.setShowcase(token, Array.isArray(body.ids) ? body.ids.map(String).slice(0, 10) : [])],
  ['GET', /^referrals$/, ({ token }) => svc.referrals(token)],
  ['POST', /^profile\/title$/, ({ token, body }) => svc.setTitle(token, body.id ? String(body.id) : null)],
  ['POST', /^quests\/(\w+)\/claim$/, ({ token, params }) => svc.claimQuest(token, params[0])],
  ['GET', /^friends$/, ({ token }) => svc.friends(token)],
  ['POST', /^friends\/search$/, ({ token, body }) => svc.searchPlayers(token, String(body.query ?? ''))],
  ['POST', /^friends$/, ({ token, body }) => svc.addFriend(token, String(body.userId ?? ''))],
  ['POST', /^friends\/(\w+)\/respond$/, ({ token, params, body }) => svc.respondFriend(token, params[0], !!body.accept)],
  ['DELETE', /^friends\/(\w+)$/, ({ token, params }) => svc.removeFriend(token, params[0])],
  ['GET', /^challenges$/, ({ token }) => svc.challenges(token)],
  ['POST', /^challenges$/, ({ token, body }) =>
    svc.challengeFriend(token, String(body.friendId ?? ''), body.deckId ? String(body.deckId) : undefined)],
  ['POST', /^challenges\/(\w+)\/respond$/, ({ token, params, body }) =>
    svc.respondChallenge(token, params[0], !!body.accept, body.deckId ? String(body.deckId) : undefined)],
  ['GET', /^pvp\/(\w+)$/, ({ token, params }) => svc.pvpState(token, params[0])],
  ['POST', /^pvp\/(\w+)\/action$/, ({ token, params, body }) => svc.pvpAction(token, params[0], body.action as never, String(body.v ?? ''))],
  ['POST', /^pvp\/(\w+)\/resign$/, ({ token, params }) => svc.pvpResign(token, params[0])],
  ['POST', /^pvp\/(\w+)\/claim$/, ({ token, params }) => svc.pvpClaim(token, params[0])],
  ['POST', /^seek$/, ({ token, body }) => svc.seek(token, body.deckId ? String(body.deckId) : undefined)],
  ['DELETE', /^seek$/, ({ token }) => svc.cancelSeek(token)],
  ['POST', /^trials\/(\w+)\/enter$/, ({ token, params }) => svc.enterTrial(token, params[0])],
  ['GET', /^admin\/users$/, ({ token }) => svc.adminUsers(token)],
  ['POST', /^admin\/users\/(\w+)\/pack$/, ({ token, params, body }) => svc.adminGrantPack(token, params[0], String(body.type) as never)],
  ['POST', /^admin\/users\/(\w+)\/all-cards$/, ({ token, params }) => svc.adminGrantAllCards(token, params[0])],
  ['POST', /^admin\/users\/(\w+)\/trophies$/, ({ token, params, body }) => svc.adminSetTrophies(token, params[0], Number(body.trophies), body.ladder === 'bot' ? 'bot' : 'pvp')],
  [
    'POST',
    /^admin\/users\/(\w+)\/role$/,
    ({ token, params, body }) => svc.adminSetRole(token, params[0], body.role === 'admin' ? 'admin' : 'player'),
  ],
  [
    'POST',
    /^admin\/users\/(\w+)\/currency$/,
    ({ token, params, body }) => svc.adminGrantCurrency(token, params[0], Number(body.gold ?? 0), Number(body.shards ?? 0)),
  ],
  [
    'POST',
    /^admin\/users\/(\w+)\/ban$/,
    ({ token, params, body }) => svc.adminBan(token, params[0], body.hours === null || body.hours === undefined ? null : Number(body.hours), String(body.reason ?? '')),
  ],
  ['POST', /^admin\/users\/(\w+)\/rename$/, ({ token, params, body }) => svc.adminRename(token, params[0], String(body.name ?? ''), String(body.reason ?? ''))],
  ['POST', /^profile\/notice$/, ({ token }) => svc.dismissNotice(token)],
  ['POST', /^admin\/users\/(\w+)\/unban$/, ({ token, params }) => svc.adminUnban(token, params[0])],
  ['POST', /^admin\/users\/(\w+)\/logout$/, ({ token, params }) => svc.adminLogout(token, params[0])],
  ['POST', /^admin\/users\/(\w+)\/delete$/, ({ token, params }) => svc.adminDeleteUser(token, params[0])],
];

function isSecure(req: IncomingMessage): boolean {
  return req.headers['x-forwarded-proto'] === 'https';
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
};

/** Text files are gzipped on the way out (the app bundle shrinks about 3×). */
const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.svg', '.json', '.webmanifest', '.txt', '.xml']);

function serveStatic(req: IncomingMessage, res: ServerResponse): void {
  let url: string;
  try {
    url = decodeURIComponent((req.url ?? '/').split('?')[0]);
  } catch {
    return void res.writeHead(400).end();
  }
  // A game's address typed or shared without the # (example.com/game/<id>): the app routes by hash.
  const room = /^\/game\/([\w-]+)\/?$/.exec(url);
  if (room) return void res.writeHead(302, { Location: `/#/game/${room[1]}` }).end();
  // Plain addresses of the public pages (the payment service asks for them): the app routes by hash.
  const page = /^\/(terms|privacy|refunds|pricing)\/?$/.exec(url);
  if (page) return void res.writeHead(302, { Location: `/#/${page[1]}` }).end();
  let file = normalize(join(DIST, url));
  if (file !== DIST && !file.startsWith(DIST + sep)) return void res.writeHead(403).end();
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html');
  if (!existsSync(file)) return void res.writeHead(404).end('Run `npm run build` first.');
  if (req.method !== 'GET' && req.method !== 'HEAD') return void res.writeHead(405, { Allow: 'GET, HEAD' }).end();
  // Hashed bundles never change; sprites and the page itself are revalidated.
  const cache = /[\\/]assets[\\/][\w.]+-[\w-]{8}\.(js|css)$/.test(file);
  const ext = extname(file);
  const gzip = COMPRESSIBLE.has(ext) && /\bgzip\b/.test(String(req.headers['accept-encoding'] ?? ''));
  res.writeHead(200, {
    ...SECURITY_HEADERS,
    'Content-Type': MIME[ext] ?? 'application/octet-stream',
    'Cache-Control': cache ? 'public, max-age=31536000, immutable' : 'no-cache',
    Vary: 'Accept-Encoding',
    ...(gzip ? { 'Content-Encoding': 'gzip' } : {}),
  });
  if (req.method === 'HEAD') return void res.end();
  const stream = createReadStream(file);
  // A file removed mid-read (a deploy) must not crash the server.
  stream.on('error', () => res.destroy());
  if (gzip) stream.pipe(createGzip()).pipe(res);
  else stream.pipe(res);
}

const server = createServer(async (req, res) => {
  if (isSecure(req)) res.setHeader('Strict-Transport-Security', HSTS);
  const path = (req.url ?? '/').split('?')[0];
  // The site lives on its own domain: pages opened on <app>.fly.dev move there for good.
  // The API stays reachable (webhooks and open tabs do not follow redirects).
  if (PUBLIC_URL && !path.startsWith('/api/') && String(req.headers.host ?? '').endsWith('.fly.dev') && (req.method === 'GET' || req.method === 'HEAD')) {
    return void res.writeHead(301, { Location: PUBLIC_URL + (req.url ?? '/').slice(1) }).end();
  }
  if (!path.startsWith('/api/')) return serveStatic(req, res);
  if (path === '/api/payments/paddle/webhook' && req.method === 'POST') {
    if (!allow('api', clientIp(req))) return void res.writeHead(429).end();
    return void paddleWebhook(req, res).catch((e) => {
      console.error('Paddle webhook failed:', e);
      if (!res.headersSent) res.writeHead(500).end();
    });
  }
  const sub = path.slice(5);
  const route = routes.find(([m, re]) => m === req.method && re.test(sub));
  if (!route) return send(res, 404, { error: 'Не знайдено.' });
  if (req.method !== 'GET' && !sameOrigin(req)) return send(res, 403, { error: 'Запит з іншого сайту.' });
  const token = tokenOf(req) ?? '';
  const ip = clientIp(req);
  const who = token || ip;
  const tooMany = () => send(res, 429, { error: 'Забагато запитів. Спробуйте трохи згодом.' });
  if (!allow('api', who)) return tooMany();
  if (sub.startsWith('matches/') && sub.endsWith('/action') && !allow('bot', who)) return tooMany();
  try {
    const body = req.method === 'GET' || req.method === 'DELETE' ? {} : await readBody(req);
    if (sub === 'auth/login' || sub === 'auth/register' || sub === 'auth/reset') {
      const email = String(body.email ?? body.token ?? '').trim().toLowerCase();
      if (!allow('authIp', ip) || !allow('auth', `${ip}|${email}`)) return tooMany();
    }
    if ((sub === 'auth/forgot' || sub === 'account/verify' || sub === 'account/email') && !allow('mail', ip)) return tooMany();
    if (sub.startsWith('account/') && sub !== 'account/verify' && !allow('password', who)) return tooMany();
    const params = route[1].exec(sub)!.slice(1);
    const out = await route[2]({ req, res, token, body, params });
    send(res, 200, out === undefined ? undefined : out, req);
  } catch (e) {
    if (e instanceof ApiError) return send(res, e.status, { error: e.message });
    console.error(e);
    send(res, 500, { error: 'Внутрішня помилка сервера.' });
  }
});

// Live games: WebSocket on the same port (/api/ws).
const hub = new Hub(server, svc, tokenOf, sameOrigin);

await svc.init();
// Expired sessions pile up otherwise: clean them at start and once a day.
await store.purgeSessions(Date.now());
setInterval(() => void store.purgeSessions(Date.now()), 864e5).unref();
server.listen(PORT, () => {
  console.log(`Ultrachess: http://localhost:${PORT}  (db: ${DB_FILE})`);
});

// Hosts stop containers with SIGTERM: finish open requests, then exit.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    hub.close();
    server.close(() => void bots.close().finally(() => process.exit(0)));
    setTimeout(() => process.exit(0), 5000).unref();
  });
}
