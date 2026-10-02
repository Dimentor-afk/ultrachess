// Rules for what players type in: nicknames and passwords. Pure functions,
// shared by the server and the browser demo (and the forms, for early hints).

export const NAME_MIN = 3;
export const NAME_MAX = 24;
/** A nickname can be changed once in this long (the first name is free). */
export const NAME_CHANGE_MS = 7 * 864e5;
export const PASSWORD_MIN = 8;
/** scrypt on a megabyte of "password" would be a cheap way to load the server. */
export const PASSWORD_MAX = 128;

/** Trimmed, one space between words, one Unicode form (so "й" is always the same letter). */
export function cleanName(raw: string): string {
  return raw.normalize('NFC').replace(/\s+/g, ' ').trim();
}

// Latin letters that look like Cyrillic ones: "xyй" is caught like "хуй".
const LOOKALIKE: Record<string, string> = {
  a: 'а', b: 'в', c: 'с', e: 'е', h: 'н', i: 'і', k: 'к', m: 'м', o: 'о', p: 'р', t: 'т', x: 'х', y: 'у',
  '0': 'о', '3': 'з', '4': 'ч', '6': 'б', '@': 'а', ë: 'е', ё: 'е', ї: 'і', є: 'е', ы: 'и',
};

/** Roots that are not allowed anywhere in a name (a basic filter, not a moderator). */
const BANNED_CYR = ['хуй', 'хуе', 'хуя', 'хуї', 'пизд', 'пізд', 'ебат', 'ебан', 'ебал', 'еблан', 'їбат', 'йоба', 'бляд', 'блят', 'мудак', 'мудил', 'гандон', 'підар', 'пидор', 'пидар', 'підор', 'залуп', 'шлюх', 'курва', 'дроч', 'гітлер', 'гитлер'];
// Only roots that do not hide inside ordinary names (no "dick": Dickens; no "rape": grapefruit).
const BANNED_LAT = ['fuck', 'shit', 'bitch', 'nigg', 'fagg', 'whore', 'porn', 'hitler'];
/** Names that pretend to be the game, its staff or a bot. */
const RESERVED = ['admin', 'адмін', 'админ', 'адміністратор', 'администратор', 'moderator', 'модератор', 'mod', 'support', 'підтримка', 'system', 'система', 'ultrachess', 'bot', 'бот'];

function squash(s: string): string {
  return [...s.toLowerCase()].map((ch) => LOOKALIKE[ch] ?? ch).join('').replace(/[^\p{L}]/gu, '');
}

/** What is wrong with a nickname, or null when it is fine. */
export function nameProblem(name: string): string | null {
  if (name.length < NAME_MIN || name.length > NAME_MAX) return `Нікнейм — від ${NAME_MIN} до ${NAME_MAX} символів.`;
  if (!/^[\p{L}\p{N} _.'-]+$/u.test(name)) return 'У нікнеймі можна лише літери, цифри, пробіл і знаки _ . - ’';
  if (!/\p{L}/u.test(name)) return 'У нікнеймі має бути хоча б одна літера.';
  const lower = name.toLowerCase();
  const words = lower.split(/[\s_.'-]+/).filter(Boolean);
  const squashedWords = words.map(squash);
  if (words.some((w) => RESERVED.includes(w)) || squashedWords.some((w) => RESERVED.includes(w))) {
    return 'Такий нікнейм зарезервовано: оберіть інший.';
  }
  const latin = lower.replace(/[^a-z]/g, '');
  const cyr = squash(name);
  if (BANNED_LAT.some((r) => latin.includes(r)) || BANNED_CYR.some((r) => cyr.includes(r))) {
    return 'Такий нікнейм не можна використати.';
  }
  return null;
}

/** The most common passwords: the first ones anyone tries. */
const COMMON = new Set([
  '12345678', '123456789', '1234567890', '12341234', '87654321', '11111111', '00000000', '88888888', '11223344', '123123123',
  'password', 'password1', 'password123', 'qwerty123', 'qwertyui', 'qwertyuiop', 'qwerty12', '1q2w3e4r', '1qaz2wsx', 'asdfghjk',
  'zxcvbnm1', 'iloveyou', 'abcd1234', 'admin123', 'ultrachess', 'йцукенгш', 'пароль123', 'chess123', 'шахи1234',
]);

/** What is wrong with a new password, or null when it is fine. */
export function passwordProblem(password: string, email = ''): string | null {
  if (password.length < PASSWORD_MIN) return `Пароль має містити щонайменше ${PASSWORD_MIN} символів.`;
  if (password.length > PASSWORD_MAX) return `Пароль — до ${PASSWORD_MAX} символів.`;
  const lower = password.toLowerCase();
  if (COMMON.has(lower) || /^(.)\1+$/.test(password)) return 'Цей пароль надто простий: його вгадують першим.';
  const local = email.split('@')[0]?.toLowerCase();
  if (local && local.length >= 4 && lower.includes(local)) return 'Пароль не повинен містити вашу пошту.';
  return null;
}

/** SHA-256 in hex (Web Crypto: the same in Node and in the browser). */
export async function sha256(text: string): Promise<string> {
  const buf = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
