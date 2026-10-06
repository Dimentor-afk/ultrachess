// Translations. The Ukrainian text in the code is the key: t('Колода') looks
// it up in the dictionary of the chosen language and falls back to Ukrainian.
// Placeholders are numbered: t('Потрібно {0} уламків', n).
//
// Text that comes from the server or the engine (errors, move history, card
// and league names) stays Ukrainian on the wire; tr() translates it where it
// is shown, matching it against the dictionary's templates.

export type Lang = 'uk' | 'en' | 'de' | 'it' | 'es';

export const LANGS: { id: Lang; name: string }[] = [
  { id: 'uk', name: 'Українська' },
  { id: 'en', name: 'English' },
  { id: 'de', name: 'Deutsch' },
  { id: 'it', name: 'Italiano' },
  { id: 'es', name: 'Español' },
];

const KEY = 'ultrachess.lang';

let lang: Lang = 'uk';
let dict: Record<string, string> = {};

export function getLang(): Lang {
  return lang;
}

/** The saved language, else the browser's (Ukrainian and Russian speakers get Ukrainian, others English). */
export function detectLang(): Lang {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved && LANGS.some((l) => l.id === saved)) return saved as Lang;
  } catch {
    // Storage blocked: go by the browser.
  }
  const nav = (typeof navigator !== 'undefined' ? navigator.language : 'uk').slice(0, 2).toLowerCase();
  if (nav === 'uk' || nav === 'ru') return 'uk';
  return LANGS.some((l) => l.id === nav) ? (nav as Lang) : 'en';
}

const LOADERS: Record<Exclude<Lang, 'uk'>, () => Promise<{ default: Record<string, string> }>> = {
  en: () => import('./en'),
  de: () => import('./de'),
  it: () => import('./it'),
  es: () => import('./es'),
};

/** Load the dictionary before the app starts (module-level texts are translated as they load). */
export async function loadLang(next: Lang = detectLang()): Promise<void> {
  lang = next;
  dict = next === 'uk' ? {} : (await LOADERS[next]()).default;
  templates = null;
  if (typeof document !== 'undefined') document.documentElement.lang = next;
}

/** Remember the language and restart the app in it. */
export function setLang(next: Lang): void {
  try {
    localStorage.setItem(KEY, next);
  } catch {
    // Storage blocked: the choice lasts until the tab closes.
  }
  location.reload();
}

const fill = (s: string, args: unknown[]) => (args.length ? s.replace(/\{(\d+)\}/g, (m, i) => (i < args.length ? String(args[+i]) : m)) : s);

/** The text in the chosen language. */
export function t(src: string, ...args: unknown[]): string {
  return fill(dict[src] ?? src, args);
}

// ── Text from the server and the engine ──

let templates: { re: RegExp; key: string }[] | null = null;

/** Dictionary keys with placeholders, most specific first, as patterns that match the filled-in text. */
function patterns(): { re: RegExp; key: string }[] {
  if (templates) return templates;
  templates = Object.keys(dict)
    .filter((k) => /\{\d+\}/.test(k) && k.replace(/\{\d+\}/g, '').trim().length >= 2)
    .sort((a, b) => b.replace(/\{\d+\}/g, '').length - a.replace(/\{\d+\}/g, '').length)
    .map((key) => {
      const re = key
        .split(/(\{\d+\})/)
        .map((part) => (/^\{\d+\}$/.test(part) ? '(.+?)' : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
        .join('');
      return { re: new RegExp(`^${re}$`, 's'), key };
    });
  return templates;
}

const PIECES = '\\S+';
/** A board square, or a levitation platform past the edge ("c↑", "→5"). */
const SQ = '[a-h][1-8]|[a-h][↑↓]|[←→][1-8]';
/** "Кінь e2–e4 (Тихий крок) = Ферзь" and "Король: рокіровка e1–g1": the engine's move lines. */
const MOVE = new RegExp(`^(${PIECES}) (${SQ})([–×])(${SQ})(?: \\((.+)\\))?(?: = (${PIECES}))?$`);
const CASTLE = new RegExp(`^(${PIECES}): рокіровка (${SQ})–(${SQ})$`);
/** A move label with the promotion piece: "Хід по діагоналі → ферзь". */
const PROMO = /^(.+) → (ферзь|тура|слон|кінь)$/;

/**
 * Translate text made by the server or the engine: an exact entry, a move
 * line, a template with its parts translated in turn, or "a; b" piece by piece.
 */
export function tr(text: string | null | undefined): string {
  if (!text || lang === 'uk') return text ?? '';
  const exact = dict[text];
  if (exact !== undefined) return exact;
  const mv = MOVE.exec(text);
  // Only a piece name starts a move line ("Діагональ a3–f8" is an ability choice).
  if (mv && dict[mv[1]] !== undefined) {
    let s = `${t(mv[1])} ${mv[2]}${mv[3]}${mv[4]}`;
    if (mv[5]) s += ` (${tr(mv[5])})`;
    if (mv[6]) s += ` = ${t(mv[6])}`;
    return s;
  }
  const promo = PROMO.exec(text);
  if (promo) return `${tr(promo[1])} → ${t(promo[2])}`;
  const castle = CASTLE.exec(text);
  if (castle) return t('{0}: рокіровка {1}–{2}', t(castle[1]), castle[2], castle[3]);
  if (text.includes('; ')) return text.split('; ').map(tr).join('; ');
  for (const { re, key } of patterns()) {
    const m = re.exec(text);
    if (m) return t(key, ...m.slice(1).map((a) => (/^[\d\s.,+−-]+$/.test(a) ? a : tr(a))));
  }
  return text;
}

/** Locale for dates and numbers in the chosen language. */
export function locale(): string {
  return { uk: 'uk-UA', en: 'en-GB', de: 'de-DE', it: 'it-IT', es: 'es-ES' }[lang];
}
