// Achievements (no rewards: trophies to collect, as on PlayStation or Steam):
// tiers that grow with play (wins, packs, the collection,
// leagues) and feats found in the record of a finished game (Берсерк taking
// two pieces twice in a row, mate with a pawn, …). The server works the
// feats out from the game it kept, so a client cannot claim one it did not play.

import { createMatch, performAction, type Action, type MatchState } from '../engine/match';
import { opposite } from '../engine/coords';
import { CARDS } from '../engine/cards';
import type { Color, Deck, PieceType } from '../engine/types';

/** Counters the service keeps for the player. */
export type CountedStat = 'wins' | 'pvpWins' | 'games' | 'packs' | 'trials';
/** Worked out from the player's data when shown. */
export type ComputedStat = 'cards' | 'botLeague' | 'pvpLeague';
export type AchStat = CountedStat | ComputedStat;

export interface AchievementDef {
  id: string;
  name: string;
  text: string;
  /** Emoji on the medal when it has no piece art. */
  icon: string;
  /** Card whose pixel sprite sits on the medal ('pack:<type>': a pack's art). */
  art?: string;
  /** Medal colour (hue, 0–360). */
  hue: number;
  /** 1 bronze … 4 legend: the medal's rim. */
  tier: 1 | 2 | 3 | 4;
  /** Counted achievements: reached when `stat` >= `target`. Feats have no stat (target 1). */
  stat?: AchStat;
  target: number;
}

type Look = { icon?: string; art?: string; hue: number };

const count = (id: string, stat: AchStat, target: number, tier: AchievementDef['tier'], look: Look, name: string, text: string): AchievementDef => ({
  id,
  stat,
  target,
  tier,
  icon: look.icon ?? '',
  art: look.art,
  hue: look.hue,
  name,
  text,
});
const feat = (id: string, tier: AchievementDef['tier'], look: Look, name: string, text: string): AchievementDef => ({
  id,
  tier,
  icon: look.icon ?? '',
  art: look.art,
  hue: look.hue,
  name,
  text,
  target: 1,
});

const WIN: Look = { art: 'king-classic', hue: 45 };
const PVP: Look = { art: 'knight-galloper', hue: 15 };
const GAMES: Look = { art: 'pawn-classic', hue: 200 };
const CARDS_LOOK: Look = { art: 'bishop-illusionist', hue: 260 };

export const ACHIEVEMENTS: AchievementDef[] = [
  // ── Progress ──
  count('wins-1', 'wins', 1, 1, WIN, 'Перша кров', 'Виграйте першу партію.'),
  count('wins-10', 'wins', 10, 1, WIN, 'Розігрівся', 'Виграйте 10 партій.'),
  count('wins-50', 'wins', 50, 2, WIN, 'Ветеран', 'Виграйте 50 партій.'),
  count('wins-100', 'wins', 100, 3, WIN, 'Чемпіон', 'Виграйте 100 партій.'),
  count('wins-500', 'wins', 500, 4, WIN, 'Жива легенда', 'Виграйте 500 партій.'),
  count('pvp-1', 'pvpWins', 1, 1, PVP, 'Не бот', 'Переможіть живого гравця.'),
  count('pvp-10', 'pvpWins', 10, 2, PVP, 'Гроза арени', 'Переможіть 10 живих гравців.'),
  count('pvp-50', 'pvpWins', 50, 3, PVP, 'Гладіатор', 'Переможіть 50 живих гравців.'),
  count('games-10', 'games', 10, 1, GAMES, 'Новобранець', 'Зіграйте 10 партій.'),
  count('games-100', 'games', 100, 2, GAMES, 'Шахоголік', 'Зіграйте 100 партій.'),
  count('packs-10', 'packs', 10, 1, { art: 'pack:rare', hue: 200 }, 'Розпаковка', 'Відкрийте 10 паків.'),
  count('packs-50', 'packs', 50, 2, { art: 'pack:legendary', hue: 35 }, 'Пакоголік', 'Відкрийте 50 паків.'),
  count('cards-20', 'cards', 20, 1, CARDS_LOOK, 'Збирач', 'Зберіть 20 різних карток.'),
  count('cards-40', 'cards', 40, 2, CARDS_LOOK, 'Знавець', 'Зберіть 40 різних карток.'),
  count('cards-all', 'cards', CARDS.filter((c) => !c.trialOnly).length, 4, CARDS_LOOK, 'Ходяча енциклопедія', 'Зберіть усі картки з паків.'),
  count('bot-league-4', 'botLeague', 4, 2, { icon: '🤖', hue: 190 }, 'Срібло ботів', 'Дійдіть до Срібної ліги ботів.'),
  count('bot-league-7', 'botLeague', 7, 3, { icon: '🤖', hue: 320 }, 'Перемагач машин', 'Дійдіть до Міфічної ліги ботів.'),
  count('pvp-league-2', 'pvpLeague', 2, 2, { art: 'rook-castle', hue: 210 }, 'Срібна арена', 'Дійдіть до Срібної арени в лізі гравців.'),
  count('pvp-league-4', 'pvpLeague', 4, 4, { art: 'rook-castle', hue: 340 }, 'Бог арени', 'Дійдіть до Міфічної арени в лізі гравців.'),
  count('trials-1', 'trials', 1, 2, { art: 'king-hint', hue: 170 }, 'Випробуваний', 'Пройдіть будь-яке випробування.'),

  // ── Feats in a game ──
  feat('double-strike', 1, { art: 'knight-classic', hue: 25 }, 'Два зайці', 'Візьміть 2 фігури одним ходом.'),
  feat('berserk-rage', 4, { art: 'knight-berserk', hue: 0 }, 'Лють Берсерка', 'Візьміть Берсерком по 2 фігури двома його ходами поспіль.'),
  feat('pawn-mate', 3, { art: 'pawn-stormer', hue: 100 }, 'Пішак-кат', 'Поставте мат ходом пішака.'),
  feat('mate-20', 1, { icon: '⏱️', hue: 180 }, 'Без зайвих розмов', 'Поставте мат до 20-го ходу.'),
  feat('mate-15', 2, { icon: '⚡', hue: 55 }, 'Бліцкриг', 'Поставте мат до 15-го ходу.'),
  feat('mate-10', 4, { icon: '🍼', hue: 330 }, 'Дитячий мат', 'Поставте мат до 10-го ходу.'),
  feat('flawless', 3, { art: 'rook-fortress', hue: 150 }, 'Без жодної подряпини', 'Поставте мат, не втративши жодної фігури.'),
  feat('comeback', 3, { icon: '🔥', hue: 20 }, 'Фенікс', 'Виграйте партію, в якій відставали на 10 очок матеріалу (пішак 1, кінь і слон 3, тура 5, ферзь 9).'),
  feat('coronation', 2, { art: 'queen-classic', hue: 48 }, 'Дві корони', 'Перетворіть двох пішаків за одну партію.'),
  feat('immortal-return', 2, { art: 'queen-immortal', hue: 275 }, 'З того світу', 'Безсмертна воскресає після удару.'),
  feat('kamikaze', 2, { art: 'rook-kamikaze', hue: 5 }, 'Разом на дно', 'Смертник забирає з собою фігуру, що його взяла.'),
  feat('portal-strike', 1, { art: 'bishop-portal', hue: 235 }, 'Крізь портал', 'Візьміть фігуру через портал.'),
  feat('comet-strike', 3, { art: 'king-comet', hue: 30 }, 'Падіння Комети', 'Візьміть фігуру ривком Комети.'),
  feat('comet-path', 4, { art: 'king-comet', hue: 265 }, 'Шлях Комети', 'Пройдіть випробування «Шлях Комети».'),
];

export const ACHIEVEMENT_BY_ID: Record<string, AchievementDef> = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));

/** What the service stores for the player (users.achievements, JSON). */
export interface AchievementState {
  stats: Partial<Record<CountedStat, number>>;
  feats: string[];
}

export function parseAchievements(raw: string | null | undefined): AchievementState {
  try {
    const a = JSON.parse(raw || '{}') as Partial<AchievementState>;
    return { stats: a.stats ?? {}, feats: a.feats ?? [] };
  } catch {
    return { stats: {}, feats: [] };
  }
}

export interface AchievementView extends AchievementDef {
  progress: number;
  done: boolean;
}

export function achievementViews(state: AchievementState, computed: Record<ComputedStat, number>): AchievementView[] {
  return ACHIEVEMENTS.map((a) => {
    const value = !a.stat ? (state.feats.includes(a.id) ? 1 : 0) : a.stat in computed ? computed[a.stat as ComputedStat] : (state.stats[a.stat as CountedStat] ?? 0);
    const done = value >= a.target;
    return { ...a, progress: Math.min(value, a.target), done };
  });
}

const VALUE: Record<PieceType, number> = { pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9, king: 0 };

function material(st: MatchState, c: Color): number {
  let n = 0;
  for (const p of st.board) if (p && p.color === c) n += VALUE[p.type];
  return n;
}

function pieces(st: MatchState, c: Color): number {
  return st.board.filter((p) => p?.color === c).length;
}

/**
 * The feats `me` achieved in a finished game, worked out by replaying its
 * record. A record that does not replay (rules changed since) gives none.
 */
export function gameFeats(decks: Record<Color, Deck>, actions: Action[], me: Color, won: boolean): string[] {
  try {
    return featsFrom(createMatch(decks.w, decks.b), actions, me, won);
  } catch {
    return [];
  }
}

/** The same from any starting state (tests start from a set-up position). */
export function featsFrom(first: MatchState, actions: Action[], me: Color, won: boolean): string[] {
  const out = new Set<string>();
  try {
    const them = opposite(me);
    let st = first;
    const start = pieces(st, me);
    // Берсерк sits out a turn after a chain: "in a row" counts that knight's own moves.
    const streak = new Map<string, number>();
    let promotions = 0;
    let worst = 0;
    for (const a of actions) {
      const before = st;
      st = performAction(st, a);
      if (a.type === 'move') {
        const m = a.move;
        const mover = before.board[m.from];
        const takes = m.captures.filter((s) => before.board[s]?.color === (mover ? opposite(mover.color) : them)).length;
        if (mover?.color === me) {
          if (takes >= 2) out.add('double-strike');
          if (mover.cardId === 'knight-berserk') {
            const n = takes >= 2 ? (streak.get(mover.id) ?? 0) + 1 : 0;
            streak.set(mover.id, n);
            if (n >= 2) out.add('berserk-rage');
          }
          if (m.kind === 'dash' && takes) out.add('comet-strike');
          if (takes && /портал/i.test(m.label)) out.add('portal-strike');
          if (m.promotion && ++promotions >= 2) out.add('coronation');
          if (st.result?.winner === me && st.result.reason === 'Мат' && mover.type === 'pawn') out.add('pawn-mate');
        } else if (mover) {
          for (const s of m.captures) {
            const v = before.board[s];
            if (v?.color !== me) continue;
            const alive = (id: string) => st.board.some((p) => p?.id === id);
            if (v.cardId === 'queen-immortal' && alive(v.id)) out.add('immortal-return');
            if (v.cardId === 'rook-kamikaze' && !alive(mover.id)) out.add('kamikaze');
          }
        }
      }
      worst = Math.min(worst, material(st, me) - material(st, them));
    }
    const mate = won && st.result?.winner === me && st.result.reason === 'Мат';
    for (const n of [20, 15, 10]) if (mate && st.result!.moves <= n) out.add(`mate-${n}`);
    if (mate && pieces(st, me) >= start) out.add('flawless');
    if (won && worst <= -10) out.add('comeback');
  } catch {
    // An old record the engine no longer plays: no feats from it.
  }
  return [...out];
}
