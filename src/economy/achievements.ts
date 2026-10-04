// Achievements: tiers that grow with play (wins, packs, the collection,
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
  icon: string;
  /** 1 bronze … 4 legend: the frame. */
  tier: 1 | 2 | 3 | 4;
  /** Counted achievements: reached when `stat` >= `target`. Feats have no stat (target 1). */
  stat?: AchStat;
  target: number;
  reward: { gold?: number; shards?: number };
}

const count = (id: string, stat: AchStat, target: number, tier: AchievementDef['tier'], icon: string, name: string, text: string, reward: AchievementDef['reward']): AchievementDef => ({
  id,
  stat,
  target,
  tier,
  icon,
  name,
  text,
  reward,
});
const feat = (id: string, tier: AchievementDef['tier'], icon: string, name: string, text: string, shards: number): AchievementDef => ({
  id,
  tier,
  icon,
  name,
  text,
  target: 1,
  reward: { shards },
});

export const ACHIEVEMENTS: AchievementDef[] = [
  // ── Progress ──
  count('wins-1', 'wins', 1, 1, '⚔️', 'Перша кров', 'Виграйте першу партію.', { gold: 50 }),
  count('wins-10', 'wins', 10, 1, '⚔️', 'Розігрівся', 'Виграйте 10 партій.', { gold: 150 }),
  count('wins-50', 'wins', 50, 2, '⚔️', 'Ветеран', 'Виграйте 50 партій.', { shards: 100 }),
  count('wins-100', 'wins', 100, 3, '⚔️', 'Чемпіон', 'Виграйте 100 партій.', { shards: 250 }),
  count('wins-500', 'wins', 500, 4, '⚔️', 'Жива легенда', 'Виграйте 500 партій.', { shards: 600 }),
  count('pvp-1', 'pvpWins', 1, 1, '🤝', 'Не бот', 'Переможіть живого гравця.', { shards: 50 }),
  count('pvp-10', 'pvpWins', 10, 2, '🤝', 'Гроза арени', 'Переможіть 10 живих гравців.', { shards: 150 }),
  count('pvp-50', 'pvpWins', 50, 3, '🤝', 'Гладіатор', 'Переможіть 50 живих гравців.', { shards: 400 }),
  count('games-10', 'games', 10, 1, '♟️', 'Новобранець', 'Зіграйте 10 партій.', { gold: 50 }),
  count('games-100', 'games', 100, 2, '♟️', 'Шахоголік', 'Зіграйте 100 партій.', { gold: 300 }),
  count('packs-10', 'packs', 10, 1, '🎁', 'Розпаковка', 'Відкрийте 10 паків.', { gold: 100 }),
  count('packs-50', 'packs', 50, 2, '🎁', 'Пакоголік', 'Відкрийте 50 паків.', { shards: 150 }),
  count('cards-20', 'cards', 20, 1, '🃏', 'Збирач', 'Зберіть 20 різних карток.', { gold: 100 }),
  count('cards-40', 'cards', 40, 2, '🃏', 'Знавець', 'Зберіть 40 різних карток.', { shards: 200 }),
  count('cards-all', 'cards', CARDS.filter((c) => !c.trialOnly).length, 4, '🃏', 'Ходяча енциклопедія', 'Зберіть усі картки з паків.', { shards: 1000 }),
  count('bot-league-4', 'botLeague', 4, 2, '🤖', 'Срібло ботів', 'Дійдіть до Срібної ліги ботів.', { shards: 100 }),
  count('bot-league-7', 'botLeague', 7, 3, '🤖', 'Перемагач машин', 'Дійдіть до Міфічної ліги ботів.', { shards: 300 }),
  count('pvp-league-2', 'pvpLeague', 2, 2, '🏟️', 'Срібна арена', 'Дійдіть до Срібної арени в лізі гравців.', { shards: 150 }),
  count('pvp-league-4', 'pvpLeague', 4, 4, '🏟️', 'Бог арени', 'Дійдіть до Міфічної арени в лізі гравців.', { shards: 500 }),
  count('trials-1', 'trials', 1, 2, '🏅', 'Випробуваний', 'Пройдіть будь-яке випробування.', { shards: 100 }),

  // ── Feats in a game ──
  feat('double-strike', 1, '💥', 'Два зайці', 'Візьміть 2 фігури одним ходом.', 50),
  feat('berserk-rage', 4, '🐺', 'Лють Берсерка', 'Візьміть Берсерком по 2 фігури двома його ходами поспіль.', 200),
  feat('pawn-mate', 3, '♙', 'Пішак-кат', 'Поставте мат ходом пішака.', 150),
  feat('mate-20', 1, '⏱️', 'Без зайвих розмов', 'Поставте мат до 20-го ходу.', 60),
  feat('mate-15', 2, '⚡', 'Бліцкриг', 'Поставте мат до 15-го ходу.', 100),
  feat('mate-10', 4, '🍼', 'Дитячий мат', 'Поставте мат до 10-го ходу.', 250),
  feat('flawless', 3, '🛡️', 'Без жодної подряпини', 'Поставте мат, не втративши жодної фігури.', 150),
  feat('comeback', 3, '🔥', 'Фенікс', 'Виграйте партію, в якій відставали на 10 очок матеріалу (пішак 1, кінь і слон 3, тура 5, ферзь 9).', 150),
  feat('coronation', 2, '👑', 'Дві корони', 'Перетворіть двох пішаків за одну партію.', 80),
  feat('immortal-return', 2, '♾️', 'З того світу', 'Безсмертна воскресає після удару.', 80),
  feat('kamikaze', 2, '💣', 'Разом на дно', 'Смертник забирає з собою фігуру, що його взяла.', 80),
  feat('portal-strike', 1, '🌀', 'Крізь портал', 'Візьміть фігуру через портал.', 60),
  feat('comet-strike', 3, '☄️', 'Падіння Комети', 'Візьміть фігуру ривком Комети.', 100),
  feat('comet-path', 4, '🌠', 'Шлях Комети', 'Пройдіть випробування «Шлях Комети».', 300),
];

export const ACHIEVEMENT_BY_ID: Record<string, AchievementDef> = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));

/** What the service stores for the player (users.achievements, JSON). */
export interface AchievementState {
  stats: Partial<Record<CountedStat, number>>;
  feats: string[];
  claimed: string[];
}

export function parseAchievements(raw: string | null | undefined): AchievementState {
  try {
    const a = JSON.parse(raw || '{}') as Partial<AchievementState>;
    return { stats: a.stats ?? {}, feats: a.feats ?? [], claimed: a.claimed ?? [] };
  } catch {
    return { stats: {}, feats: [], claimed: [] };
  }
}

export interface AchievementView extends AchievementDef {
  progress: number;
  done: boolean;
  claimed: boolean;
}

export function achievementViews(state: AchievementState, computed: Record<ComputedStat, number>): AchievementView[] {
  return ACHIEVEMENTS.map((a) => {
    const value = !a.stat ? (state.feats.includes(a.id) ? 1 : 0) : a.stat in computed ? computed[a.stat as ComputedStat] : (state.stats[a.stat as CountedStat] ?? 0);
    const done = value >= a.target;
    return { ...a, progress: Math.min(value, a.target), done, claimed: state.claimed.includes(a.id) };
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
