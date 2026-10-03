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

// Latin letters (and digits) that look like Cyrillic ones: "xyй" is caught like "хуй".
const LOOKALIKE: Record<string, string> = {
  a: 'а', b: 'в', c: 'с', e: 'е', h: 'н', i: 'і', k: 'к', m: 'м', n: 'п', o: 'о', p: 'р', t: 'т', u: 'у', x: 'х', y: 'у',
  '0': 'о', '3': 'з', '4': 'ч', '6': 'б', '@': 'а', ë: 'е', ё: 'е', ї: 'і', є: 'е', ы: 'и', ъ: 'ь',
};
// Digits written for Latin letters: "p1zda", "sh1t", "a55".
const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '@': 'a', $: 's' };

/**
 * Roots not allowed anywhere in a name (Ukrainian and Russian swearing, slurs,
 * Nazi names). A filter, not a moderator: whatever slips through, an admin
 * renames (GameService.adminRename).
 */
const BANNED_CYR = [
  'хуй', 'хуе', 'хуя', 'хуї', 'хую', 'хуіл', 'хуил', 'пизд', 'пізд', 'ебат', 'ебан', 'ебал', 'еблан', 'ебло', 'ебуч', 'ебну', 'ебись',
  'їбат', 'йоба', 'йобан', 'йобн', 'уеб', 'заеб', 'наеб', 'выеб', 'виеб', 'долбо', 'бляд', 'блят', 'мудак', 'мудил', 'гандон',
  'підар', 'пидор', 'пидар', 'підор', 'пидр', 'педик', 'педер', 'залуп', 'шлюх', 'шалав', 'курва', 'дроч', 'сучар', 'мразь',
  'ублюд', 'гнида', 'уебок', 'гітлер', 'гитлер', 'нацист', 'зигхайл',
];
/** Short words that would catch ordinary names as roots ("Сукня", "Херсон"): only as a whole word. */
const BANNED_CYR_WORDS = ['сука', 'суки', 'сучка', 'лох', 'чмо', 'жопа', 'хер', 'нахер', 'дебіл', 'дебил', 'даун', 'тварь', 'срака', 'гівно', 'говно'];
// Only roots that do not hide inside ordinary names (no "dick": Dickens; no "rape": grapefruit;
// no "ebat": rebate; no "fuk": Fukuda).
// English, transliterated Ukrainian/Russian, German, Italian, Spanish.
const BANNED_LAT = [
  'fuck', 'shit', 'bitch', 'nigg', 'nigga', 'fagg', 'whore', 'porn', 'hitler', 'cunt', 'pussy', 'slut', 'retard', 'motherf',
  'pizd', 'pyzd', 'blyat', 'blyad', 'bliad', 'yebat', 'yeban', 'mudak', 'mudil', 'pidor', 'pidar', 'pidr',
  'gandon', 'zalup', 'huesos', 'huila', 'dolboeb', 'dolboyob', 'shluh', 'shlyuh',
  'scheiss', 'hurensohn', 'wichser', 'fotze', 'arschloch', 'cazzo', 'vaffanculo', 'stronzo', 'puttana', 'mierda', 'cabron',
  'pendejo', 'gilipollas', 'maricon', 'hijoputa', 'siegheil',
];
/** The same for Latin: only whole words ("Nazim", "Hitchcock", "Essex", "Diputado" stay fine). */
const BANNED_LAT_WORDS = ['nazi', 'cock', 'dick', 'ass', 'fag', 'rape', 'cum', 'sex', 'hui', 'huy', 'khuy', 'suka', 'puta', 'troia', 'coglione', 'joder', 'coño', 'cono'];
/** Names that pretend to be the game, its staff or a bot. */
const RESERVED = ['admin', 'адмін', 'админ', 'адміністратор', 'администратор', 'moderator', 'модератор', 'mod', 'support', 'підтримка', 'system', 'система', 'ultrachess', 'bot', 'бот'];

/** Letters only, Latin look-alikes made Cyrillic. */
function squash(s: string): string {
  return [...s.toLowerCase()].map((ch) => LOOKALIKE[ch] ?? ch).join('').replace(/[^\p{L}]/gu, '');
}
/** Latin letters only, digits read as the letters they stand for. */
function latinOf(s: string): string {
  return [...s.toLowerCase()].map((ch) => LEET[ch] ?? ch).join('').replace(/[^a-zñ]/g, '');
}
/** "хууууй", "fuuuck": one of each letter in a row. */
const single = (s: string) => s.replace(/(.)\1+/gu, '$1');

/** True when the name, in any of its spellings, holds a banned root or word. */
function isOffensive(name: string): boolean {
  const lower = name.toLowerCase();
  if (lower.replace(/\D/g, '').includes('1488')) return true;
  const words = lower.split(/[\s_.'-]+/).filter(Boolean);
  const cyr = [squash(name), single(squash(name))];
  const lat = [latinOf(name), single(latinOf(name))];
  const cyrWords = words.flatMap((w) => [squash(w), single(squash(w))]);
  const latWords = words.flatMap((w) => [latinOf(w), single(latinOf(w))]);
  return (
    cyr.some((c) => BANNED_CYR.some((r) => c.includes(r))) ||
    lat.some((l) => BANNED_LAT.some((r) => l.includes(r))) ||
    cyrWords.some((w) => BANNED_CYR_WORDS.includes(w)) ||
    latWords.some((w) => BANNED_LAT_WORDS.includes(w)) ||
    // The whole name as one word too: "Su ka", "a s s".
    BANNED_CYR_WORDS.includes(cyr[0]) ||
    BANNED_LAT_WORDS.includes(lat[0])
  );
}

/** What is wrong with a nickname, or null when it is fine. */
export function nameProblem(name: string): string | null {
  if (name.length < NAME_MIN || name.length > NAME_MAX) return `Нікнейм — від ${NAME_MIN} до ${NAME_MAX} символів.`;
  if (!/^[\p{L}\p{N} _.'-]+$/u.test(name)) return 'У нікнеймі можна лише літери, цифри, пробіл і знаки _ . - ’';
  if (!/\p{L}/u.test(name)) return 'У нікнеймі має бути хоча б одна літера.';
  const words = name.toLowerCase().split(/[\s_.'-]+/).filter(Boolean);
  if (words.some((w) => RESERVED.includes(w)) || words.map(squash).some((w) => RESERVED.includes(w))) {
    return 'Такий нікнейм зарезервовано: оберіть інший.';
  }
  if (isOffensive(name)) return 'Такий нікнейм не можна використати.';
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
