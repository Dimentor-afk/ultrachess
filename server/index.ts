// Ultrachess server: JSON API over the game service + static site from dist/.
// Run: npm run server   (PORT, DB_FILE and DIST_DIR are optional env vars)

import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { type IncomingMessage, type ServerResponse, createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { promisify } from 'node:util';
import { ApiError, GameService } from '../src/economy/service';
import type { Hasher } from '../src/economy/store';
import { SqliteStore } from './sqliteStore';

const PORT = Number(process.env.PORT ?? 8080);
const DB_FILE = process.env.DB_FILE ?? 'ultrachess.db';
const DIST = resolve(process.env.DIST_DIR ?? 'dist');
const COOKIE = 'uc_session';

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

const store = new SqliteStore(DB_FILE);
const svc = new GameService(store, hasher);

function tokenOf(req: IncomingMessage): string | null {
  const m = /(?:^|;\s*)uc_session=([a-f0-9]+)/.exec(req.headers.cookie ?? '');
  return m ? m[1] : null;
}

function setCookie(res: ServerResponse, token: string | null, secure: boolean): void {
  const attrs = ['Path=/', 'HttpOnly', 'SameSite=Lax', secure ? 'Secure' : ''].filter(Boolean).join('; ');
  res.setHeader('Set-Cookie', token ? `${COOKIE}=${token}; Max-Age=${30 * 86400}; ${attrs}` : `${COOKIE}=; Max-Age=0; ${attrs}`);
}

function send(res: ServerResponse, status: number, data?: unknown): void {
  if (data === undefined) {
    res.writeHead(status === 200 ? 204 : status).end();
    return;
  }
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }).end(body);
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
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new ApiError(400, 'Некоректний JSON.');
  }
}

type Handler = (ctx: { req: IncomingMessage; res: ServerResponse; token: string; body: Record<string, unknown>; params: string[] }) => Promise<unknown>;

const routes: [string, RegExp, Handler][] = [
  ['GET', /^health$/, async () => ({ ok: true })],
  [
    'POST',
    /^auth\/register$/,
    async ({ req, res, body }) => {
      const r = await svc.register(String(body.email ?? ''), String(body.password ?? ''), String(body.name ?? ''));
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
  // Signed-out visitors get null instead of a 401, so the console stays clean.
  ['GET', /^me$/, ({ token }) => svc.me(token).catch(() => null)],
  ['GET', /^collection$/, ({ token }) => svc.collection(token)],
  ['GET', /^packs$/, ({ token }) => svc.packs(token)],
  ['POST', /^packs\/(\w+)\/open$/, ({ token, params }) => svc.openPack(token, params[0])],
  ['POST', /^shop\/pack$/, ({ token, body }) => svc.buyPack(token, String(body.type) as never)],
  ['POST', /^shop\/theme$/, ({ token, body }) => svc.buyTheme(token, String(body.id ?? ''))],
  ['POST', /^profile\/theme$/, ({ token, body }) => svc.setBoardTheme(token, String(body.id ?? ''))],
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
      }),
  ],
  [
    'POST',
    /^matches\/(\w+)\/finish$/,
    ({ token, params, body }) => svc.finishMatch(token, params[0], Array.isArray(body.actions) ? body.actions : [], !!body.resigned),
  ],
  ['GET', /^leaderboard$/, () => svc.leaderboard()],
  ['GET', /^admin\/users$/, ({ token }) => svc.adminUsers(token)],
  ['POST', /^admin\/users\/(\w+)\/pack$/, ({ token, params, body }) => svc.adminGrantPack(token, params[0], String(body.type) as never)],
  ['POST', /^admin\/users\/(\w+)\/all-cards$/, ({ token, params }) => svc.adminGrantAllCards(token, params[0])],
  ['POST', /^admin\/users\/(\w+)\/trophies$/, ({ token, params, body }) => svc.adminSetTrophies(token, params[0], Number(body.trophies))],
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
  '.ico': 'image/x-icon',
};

function serveStatic(req: IncomingMessage, res: ServerResponse): void {
  const url = decodeURIComponent((req.url ?? '/').split('?')[0]);
  let file = normalize(join(DIST, url));
  if (!file.startsWith(DIST)) return void res.writeHead(403).end();
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html');
  if (!existsSync(file)) return void res.writeHead(404).end('Run `npm run build` first.');
  const cache = file.includes(`${join(DIST, 'assets')}`) && !file.includes('assets/pieces') && !file.includes('assets/packs');
  res.writeHead(200, {
    'Content-Type': MIME[extname(file)] ?? 'application/octet-stream',
    'Cache-Control': cache ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  createReadStream(file).pipe(res);
}

const server = createServer(async (req, res) => {
  const path = (req.url ?? '/').split('?')[0];
  if (!path.startsWith('/api/')) return serveStatic(req, res);
  const sub = path.slice(5);
  const route = routes.find(([m, re]) => m === req.method && re.test(sub));
  if (!route) return send(res, 404, { error: 'Не знайдено.' });
  try {
    const body = req.method === 'GET' || req.method === 'DELETE' ? {} : await readBody(req);
    const params = route[1].exec(sub)!.slice(1);
    const out = await route[2]({ req, res, token: tokenOf(req) ?? '', body, params });
    send(res, 200, out === undefined ? undefined : out);
  } catch (e) {
    if (e instanceof ApiError) return send(res, e.status, { error: e.message });
    console.error(e);
    send(res, 500, { error: 'Внутрішня помилка сервера.' });
  }
});

await svc.init();
server.listen(PORT, () => {
  console.log(`Ultrachess: http://localhost:${PORT}  (db: ${DB_FILE})`);
});
