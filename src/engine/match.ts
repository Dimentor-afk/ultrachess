// Match layer: history, draw rules, game status and the single entry point
// `performAction` used by both the player UI and the bot.

import { ABILITY_DEFS, type AbilityEvent, applyAbility } from './abilities';
import { type GameEvent, applyChoice, applyMoveWithEvents } from './apply';
import { type MatchFx, computeFx } from './fx';
import { PIECE_NAMES, getCard } from './cards';
import { CELLS, opposite, squareName } from './coords';
import { legalMoves } from './legal';
import { setupPosition } from './position';
import { hasAnyLegalTurn, inCheck } from './status';
import type { Color, Deck, Move, Position, Square, Status } from './types';

export type Action =
  | { type: 'move'; move: Move }
  | { type: 'ability'; pieceId: string; key: string }
  | { type: 'choose'; square: Square };

export interface HistoryEntry {
  ply: number;
  color: Color;
  /** What the opponent sees. Null when the action is fully hidden. */
  text: string | null;
  /** What the acting player sees (defaults to `text`). */
  ownText?: string;
}

export interface MatchResult {
  winner: Color | null;
  reason: string;
  moves: number;
}

export interface LastMove {
  color: Color;
  from: Square;
  to: Square | null;
  target: Square;
  /**
   * Міраж: every square a knight landed on (the real one and the illusions),
   * sorted. The opponent sees all of them and not which one is real.
   */
  spread?: Square[];
}

export interface MatchState extends Position {
  decks: Record<Color, Deck>;
  history: HistoryEntry[];
  repetition: Record<string, number>;
  status: Status;
  result: MatchResult | null;
  lastMove: LastMove | null;
  /** How the last action looked (animations and effects). */
  fx: MatchFx | null;
  /**
   * The same as the opponent (and a spectator) sees it: after a hidden
   * action (Безсмертна, Підказка) the last action they could see; after
   * Міраж every knight hopping out of the start square at once.
   */
  fxPublic?: MatchFx | null;
}

export function positionKey(pos: Position): string {
  let key = pos.turn;
  for (let s = 0; s < CELLS; s++) {
    const p = pos.board[s];
    if (p) key += `${s}${p.color}${p.cardId};`;
  }
  return key;
}

function onlyKings(pos: Position): boolean {
  return pos.board.every((p) => !p || p.type === 'king');
}

export function createMatch(white: Deck, black: Deck): MatchState {
  const pos = setupPosition(white, black);
  const state: MatchState = {
    ...pos,
    decks: { w: white, b: black },
    history: [],
    repetition: { [positionKey(pos)]: 1 },
    status: 'playing',
    result: null,
    lastMove: null,
    fx: null,
  };
  return withStatus(state);
}

export function fullMoves(ply: number): number {
  return Math.ceil(ply / 2);
}

function withStatus(state: MatchState): MatchState {
  const color = state.turn;
  const check = inCheck(state, color);
  const moves = fullMoves(state.ply);
  if (!hasAnyLegalTurn(state)) {
    if (check) {
      return { ...state, status: 'checkmate', result: { winner: opposite(color), reason: 'Мат', moves } };
    }
    return { ...state, status: 'stalemate', result: { winner: null, reason: 'Пат', moves } };
  }
  if (state.halfmoveClock >= 100) {
    return { ...state, status: 'draw', result: { winner: null, reason: '50 ходів без взяття й ходу пішака', moves } };
  }
  if ((state.repetition[positionKey(state)] ?? 0) >= 3) {
    return { ...state, status: 'draw', result: { winner: null, reason: 'Триразове повторення позиції', moves } };
  }
  if (onlyKings(state)) {
    return { ...state, status: 'draw', result: { winner: null, reason: 'Лишились тільки королі', moves } };
  }
  return { ...state, status: check ? 'check' : 'playing', result: null };
}

export function sameMove(a: Move, b: Move): boolean {
  return (
    a.pieceId === b.pieceId &&
    a.from === b.from &&
    a.target === b.target &&
    a.to === b.to &&
    a.kind === b.kind &&
    a.promotion === b.promotion &&
    a.label === b.label &&
    a.captures.join(',') === b.captures.join(',') &&
    // The same run can start from different wall landings (Стінобіг); games
    // recorded before moves had legs still match.
    (!a.legs || !b.legs || a.legs.map((l) => l.to).join(',') === b.legs.map((l) => l.to).join(','))
  );
}

/**
 * The action as the engine itself would write it: a move becomes the legal
 * move it matches, the other kinds keep only their own fields. The server
 * stores this, not what the client sent (extra fields would bloat the record).
 * Throws when the action is malformed or the move is not legal.
 */
export function canonicalAction(state: MatchState, action: unknown): Action {
  const a = (action && typeof action === 'object' ? action : {}) as Record<string, unknown>;
  if (a.type === 'move') {
    const move = a.move as Move | undefined;
    const from = move?.from;
    const legal = typeof from === 'number' && Array.isArray(move?.captures) ? legalMoves(state, false, { from }).find((m) => sameMove(m, move!)) : undefined;
    if (!legal) throw new Error('Нелегальний хід');
    return { type: 'move', move: legal };
  }
  if (a.type === 'ability' && typeof a.pieceId === 'string' && typeof a.key === 'string') return { type: 'ability', pieceId: a.pieceId, key: a.key };
  if (a.type === 'choose' && Number.isInteger(a.square)) return { type: 'choose', square: a.square as Square };
  throw new Error('Некоректна дія');
}

const PLAIN_LABELS = new Set(['Хід', 'Взяти', 'Хід на 2']);

export function moveText(pos: Position, m: Move): string {
  const p = pos.board[m.from]!;
  const name = PIECE_NAMES[p.type];
  const sep = m.captures.length ? '×' : '–';
  const dest = m.to === null || m.to === m.from ? m.target : m.to;
  let text = `${name} ${squareName(m.from)}${sep}${squareName(dest)}`;
  if (m.kind === 'castle') text = `${name}: рокіровка ${squareName(m.from)}–${squareName(m.to!)}`;
  else if (m.kind !== 'move' && m.kind !== 'capture' && m.kind !== 'mirage') text += ` (${m.label})`;
  else if (!PLAIN_LABELS.has(m.label) && m.kind !== 'mirage' && !m.promotion) text += ` (${m.label})`;
  if (m.promotion) text += ` = ${PIECE_NAMES[m.promotion]}`;
  return text;
}

function eventText(e: GameEvent): string | null {
  switch (e.type) {
    case 'illusionDispelled':
      return `на ${squareName(e.square)} була ілюзія — вона зникла`;
    case 'kamikaze':
      return `Смертник забрав із собою: ${PIECE_NAMES[e.attacker.type]}`;
    case 'martyr':
      return 'Мученик: нападник завмер на 2 ходи';
    case 'shield':
      return `Щитоносець вистояв і відступив на ${squareName(e.to)}`;
    case 'fortress':
      return `Фортечна тура вистояла й відійшла на ${squareName(e.to)}`;
    case 'immortal':
      return `Безсмертна повернулась на ${squareName(e.to)}`;
    case 'riderShield':
      return 'Вершник втратив пішака-пасажира';
    case 'riderLanding':
      return `Вершник відстрибнув на ${squareName(e.to)}`;
    case 'ambush':
      return `Засідник атакував на ${squareName(e.square)} і загинув`;
    case 'fell':
      return `${getCard(e.piece.cardId).name} впав із платформи`;
    case 'platformReturn':
      return `${getCard(e.piece.cardId).name} повернувся з платформи на ${squareName(e.to)}`;
    case 'barricade':
      return `Барикада! Пішак на ${squareName(e.square)} перекрив мат`;
    case 'captured':
      return null;
  }
}

function withEvents(base: string, events: GameEvent[]): string {
  const extra = events.map(eventText).filter((t): t is string => !!t);
  return extra.length ? `${base}; ${extra.join('; ')}` : base;
}

function abilityText(e: AbilityEvent): string {
  switch (e.type) {
    case 'eclipse':
      return `Затемнювач: бар'єр ${squareName(e.squares[0])}–${squareName(e.squares[e.squares.length - 1])}`;
    case 'earthquake':
      return `Землетрус: ${e.label}`;
    case 'immortal':
      return 'Безсмертна: захист на хід суперника';
    case 'hint':
      return 'Підказка';
  }
}

function record(
  state: MatchState,
  next: Position,
  entry: HistoryEntry,
  lastMove: LastMove | null,
  moved: boolean,
  fx: Parameters<typeof computeFx>[3],
): MatchState {
  const repetition = moved ? { ...state.repetition } : state.repetition;
  if (moved) {
    const key = positionKey(next);
    repetition[key] = (repetition[key] ?? 0) + 1;
  }
  const shown = computeFx(state.history.length + 1, state, next, fx);
  let fxPublic: MatchFx | null = entry.text === null ? (state.fxPublic ?? null) : shown;
  if (lastMove?.spread) {
    // Міраж: the opponent sees the knight split and every copy hop to its square.
    const from = lastMove.from;
    const hops = lastMove.spread.map((to) => ({ from, to, legs: [{ to, style: 'hop' as const }] }));
    fxPublic = { ...shown, moves: [...hops, ...shown.moves.filter((m) => m.from !== from)] };
  }
  return withStatus({
    ...state,
    ...next,
    history: [...state.history, entry],
    repetition,
    lastMove: lastMove ?? state.lastMove,
    fx: shown,
    fxPublic,
  });
}

export function isOver(state: MatchState): boolean {
  return state.result !== null;
}

export function performAction(state: MatchState, action: Action): MatchState {
  if (isOver(state)) throw new Error('Партію завершено');
  const color = state.turn;
  switch (action.type) {
    case 'move': {
      // Only the moving piece's moves need generating to check the chosen one.
      const from = action.move?.from;
      const legal = typeof from === 'number' ? legalMoves(state, false, { from }).find((m) => sameMove(m, action.move)) : undefined;
      if (!legal) throw new Error('Нелегальний хід');
      const { pos, events } = applyMoveWithEvents(state, legal);
      const realText = moveText(state, legal);
      const last: LastMove = { color, from: legal.from, to: legal.to, target: legal.target };
      let publicBase = realText;
      let ownBase = realText;
      if (legal.kind === 'mirage' && legal.to !== null) {
        // Where the real knight went is the whole point: the opponent only learns where it came from.
        const copies = pos.hiddenState[color].illusions.filter((i) => legal.mirage?.includes(i.square)).map((i) => i.square);
        last.spread = [legal.to, ...copies].sort((a, b) => a - b);
        publicBase = `${PIECE_NAMES[state.board[legal.from]!.type]} ${squareName(legal.from)} — Міраж`;
        ownBase = `${realText} (Міраж)`;
      }
      return record(
        state,
        pos,
        { ply: state.ply, color, text: withEvents(publicBase, events), ownText: withEvents(ownBase, events) },
        last,
        true,
        { move: legal, events },
      );
    }
    case 'ability': {
      const piece = state.board.find((p) => p?.id === action.pieceId);
      const def = piece ? ABILITY_DEFS[piece.cardId] : undefined;
      const { pos, events } = applyAbility(state, action.pieceId, action.key);
      const text = events.map(abilityText).join('; ');
      return record(state, pos, { ply: state.ply, color, text: def?.hidden ? null : text, ownText: text }, null, false, {
        ability: { pieceId: action.pieceId, events },
      });
    }
    case 'choose': {
      const { pos, events } = applyChoice(state, action.square);
      const text = events.map(eventText).filter((t): t is string => !!t).join('; ');
      return record(state, pos, { ply: state.ply, color, text }, null, false, { events });
    }
  }
}


/** Store a "Підказка" result in its owner's hidden state. */
export function withHint(state: MatchState, color: Color, move: Move | null): MatchState {
  return { ...state, hiddenState: { ...state.hiddenState, [color]: { ...state.hiddenState[color], hint: move } } };
}

/** The given side gives up. */
export function resign(state: MatchState, color: Color): MatchState {
  if (state.result) return state;
  return { ...state, result: { winner: opposite(color), reason: 'Здача', moves: fullMoves(state.ply) } };
}
