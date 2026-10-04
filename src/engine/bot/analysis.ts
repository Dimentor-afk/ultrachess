// Game review, like chess.com's: replay a finished game, search every
// position with the bot's engine and judge each turn by how much winning
// chance it gave away compared with the best move.
//
// Scores are centipawns for the side to move. They are turned into a
// winning chance (0–100) with the same curve lichess uses, so a 300-point
// slip in an even position counts for much more than in a won one.

import { opposite } from '../coords';
import { attackingMoves } from '../attack';
import { type Action, type MatchState, createMatch, performAction } from '../match';
import type { Color, Deck, Move } from '../types';
import { cardValue } from './evaluate';
import { MATE, reviewRoot, reviewScore } from './search';

export type MoveClass =
  | 'brilliant' // !!  the best move, and it gives up a piece
  | 'great' //     !   the only good move: everything else loses a lot
  | 'best'
  | 'excellent'
  | 'good'
  | 'inaccuracy' // ?!
  | 'mistake' //  ?
  | 'miss' //     a mate was there and slipped away
  | 'blunder' //  ??
  | 'forced'; //  the only legal move

export const MOVE_CLASSES: MoveClass[] = ['brilliant', 'great', 'best', 'excellent', 'good', 'inaccuracy', 'mistake', 'miss', 'blunder', 'forced'];

export interface TurnReview {
  /** Actions of this turn: actions[from] … actions[to - 1] (an ability press and a move, or a choice). */
  from: number;
  to: number;
  color: Color;
  cls: MoveClass;
  /** White's score before and after the turn (centipawns, ±MATE_CP for mate). */
  before: number;
  after: number;
  /** Winning chance the turn gave away (0–100). */
  loss: number;
  /** What the engine would have played (null when the played move was the best). */
  best: Move | null;
}

export interface GameReview {
  turns: TurnReview[];
  /** 0–100 for each side. */
  accuracy: Record<Color, number>;
  counts: Record<Color, Record<MoveClass, number>>;
}

export interface ReviewOptions {
  depth: number;
  /** Time budget per position (ms). */
  timeMs: number;
}

export const REVIEW_OPTIONS: ReviewOptions = { depth: 3, timeMs: 600 };

/** A mate shown as this many centipawns (the chance curve is flat there anyway). */
export const MATE_CP = 10_000;

export function toCp(score: number): number {
  if (score > MATE / 2) return MATE_CP;
  if (score < -MATE / 2) return -MATE_CP;
  return Math.round(score);
}

/** Winning chance (0–100) of a centipawn score, lichess's curve. */
export function winChance(cp: number): number {
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

/** Accuracy of one move from the winning chance it lost, lichess's formula (with its +1 for uncertainty). */
export function moveAccuracy(loss: number): number {
  return Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * loss) - 3.1669 + 1));
}

/**
 * How bad a move was, on the winning-chance scale. In a decided position the
 * chance hardly moves whatever is played, so material thrown away counts too:
 * every 40 centipawns lost weigh like one point of winning chance (a hung
 * knight 7.5, a queen 22: a blunder even when the game is already won).
 */
export function moveLoss(bestCp: number, playedCp: number): { loss: number; cp: number } {
  const played = Math.min(bestCp, playedCp);
  const cp = Math.min(1000, Math.max(0, bestCp - played));
  return { loss: Math.max(winChance(bestCp) - winChance(played), cp / 40), cp };
}

/**
 * Game accuracy as lichess computes it: the mean of a volatility-weighted
 * mean (moves in sharp positions count more) and a harmonic mean (one big
 * blunder pulls the whole game down, as it should).
 */
export function gameAccuracy(whiteChances: number[], moves: { color: Color; acc: number }[]): Record<Color, number> {
  const size = Math.max(2, Math.min(8, Math.floor(moves.length / 10)));
  const windows: number[][] = [];
  for (let i = 0; i < moves.length; i++) {
    const start = Math.max(0, Math.min(i + 1 - size + 1, whiteChances.length - size));
    windows.push(whiteChances.slice(Math.max(0, start), Math.max(0, start) + size));
  }
  const weight = (xs: number[]) => {
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
    const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
    return Math.max(0.5, Math.min(12, sd));
  };
  const out = { w: 100, b: 100 };
  for (const c of ['w', 'b'] as Color[]) {
    const mine = moves.map((m, i) => ({ ...m, w: weight(windows[i]) })).filter((m) => m.color === c);
    if (!mine.length) continue;
    const weighted = mine.reduce((a, m) => a + m.acc * m.w, 0) / mine.reduce((a, m) => a + m.w, 0);
    const harmonic = mine.length / mine.reduce((a, m) => a + 1 / Math.max(1, m.acc), 0);
    out[c] = Math.round(((weighted + harmonic) / 2) * 10) / 10;
  }
  return out;
}

/** Turns of the game: consecutive actions of the same side. */
export function splitTurns(decks: Record<Color, Deck>, actions: Action[]): { from: number; to: number; color: Color; state: MatchState }[] {
  const turns: { from: number; to: number; color: Color; state: MatchState }[] = [];
  let state = createMatch(decks.w, decks.b);
  for (let i = 0; i < actions.length; i++) {
    const color = state.turn;
    const last = turns.at(-1);
    if (last && last.color === color && last.to === i) last.to = i + 1;
    else turns.push({ from: i, to: i + 1, color, state });
    state = performAction(state, actions[i]);
  }
  return turns;
}

/**
 * Gives up material on purpose: the moved piece (not a pawn) stands where
 * the opponent can take it at a profit — a cheaper piece attacks it, or
 * nothing guards it — and it did not just win as much.
 */
function isSacrifice(before: MatchState, after: MatchState, move: Move): boolean {
  const piece = before.board[move.from];
  if (!piece || piece.type === 'pawn' || piece.type === 'king' || move.to === null) return false;
  const value = cardValue(piece.cardId);
  const won = move.captures.reduce((sum, s) => sum + (before.board[s] ? cardValue(before.board[s]!.cardId) : 0), 0);
  if (won + 50 >= value) return false;
  const at = move.to;
  if (after.board[at]?.id !== piece.id) return false;
  const enemy = opposite(piece.color);
  const attackers = attackingMoves(after, at, enemy).filter((a) => a.piece.type !== 'king');
  const kingAttacks = attackingMoves(after, at, enemy).some((a) => a.piece.type === 'king');
  if (!attackers.length && !kingAttacks) return false;
  // Who guards the square: pretend the piece there is the enemy's and ask who could take it.
  const board = after.board.slice();
  board[at] = { ...piece, color: enemy };
  const guarded = attackingMoves({ ...after, board }, at, piece.color).length > 0;
  if (!guarded) return true;
  return attackers.some((a) => cardValue(a.piece.cardId) + 50 < value);
}

function classify(loss: number, cp: number): MoveClass {
  if (loss < 1 && cp <= 10) return 'best';
  if (loss < 1) return 'excellent';
  if (loss < 3) return 'excellent';
  if (loss < 6) return 'good';
  if (loss < 12) return 'inaccuracy';
  if (loss < 22) return 'mistake';
  return 'blunder';
}

/**
 * Review a finished game. Synchronous and slow (a few hundred ms per
 * position): run it in a worker; `onProgress` gets the share done (0–1).
 */
export function reviewGame(
  decks: Record<Color, Deck>,
  actions: Action[],
  opts: ReviewOptions = REVIEW_OPTIONS,
  onProgress?: (done: number) => void,
): GameReview {
  const turns = splitTurns(decks, actions);
  // Score (for the side to move) of the position at the start of each turn, and after the last one.
  const states = [...turns.map((t) => t.state)];
  let end = turns.length ? turns.at(-1)!.state : createMatch(decks.w, decks.b);
  for (let i = turns.at(-1)?.from ?? 0; i < actions.length; i++) end = performAction(end, actions[i]);
  states.push(end);

  const roots = states.map((state, i) => {
    const r = scoreOf(state, turns[i], actions, opts);
    onProgress?.((i + 1) / states.length);
    return r;
  });

  const out: TurnReview[] = [];
  const counts = { w: emptyCounts(), b: emptyCounts() };
  const accs: { color: Color; acc: number }[] = [];
  turns.forEach((t, i) => {
    const r = roots[i];
    const next = roots[i + 1];
    const sign = t.color === 'w' ? 1 : -1;
    const bestCp = toCp(r.score);
    // The played move scored at the same depth when it was a plain move; otherwise the next position's score.
    const playedCp = r.played !== null ? toCp(r.played) : -toCp(next.score);
    const { loss, cp } = moveLoss(bestCp, playedCp);
    let cls: MoveClass = classify(loss, cp);
    const move = singleMove(actions, t);
    if (r.moves === 1 && t.to - t.from === 1) cls = 'forced';
    else if (cls === 'best' || cls === 'excellent') {
      const after = performAction(t.state, actions[t.to - 1]);
      if (move && cls === 'best' && winChance(playedCp) >= 30 && winChance(bestCp) < 97 && isSacrifice(t.state, after, move)) cls = 'brilliant';
      else if (cls === 'best' && r.second !== null && winChance(bestCp) - winChance(toCp(r.second)) >= 15 && winChance(bestCp) >= 25) cls = 'great';
    } else if (bestCp === MATE_CP && playedCp < MATE_CP && (cls === 'inaccuracy' || cls === 'mistake' || cls === 'good')) cls = 'miss';
    counts[t.color][cls]++;
    accs.push({ color: t.color, acc: cls === 'forced' ? 100 : moveAccuracy(loss) });
    out.push({
      from: t.from,
      to: t.to,
      color: t.color,
      cls,
      before: sign * bestCp,
      after: -sign * toCp(next.score),
      loss: Math.round(loss * 10) / 10,
      best: r.best && (!move || !sameTarget(r.best, move)) && cls !== 'best' && cls !== 'brilliant' && cls !== 'great' && cls !== 'forced' ? r.best : null,
    });
  });
  const chances = [winChance(out[0]?.before ?? 0), ...out.map((x) => winChance(x.after))];
  return { turns: out, accuracy: gameAccuracy(chances, accs), counts };
}

function emptyCounts(): Record<MoveClass, number> {
  return Object.fromEntries(MOVE_CLASSES.map((c) => [c, 0])) as Record<MoveClass, number>;
}

const sameTarget = (a: Move, b: Move) => a.from === b.from && a.target === b.target;

/** The turn's move when the turn is just one move (no ability, no choice). */
function singleMove(actions: Action[], t: { from: number; to: number }): Move | null {
  const a = actions[t.from];
  return t.to - t.from === 1 && a.type === 'move' ? a.move : null;
}

interface Root {
  score: number;
  best: Move | null;
  second: number | null;
  played: number | null;
  moves: number;
}

function scoreOf(state: MatchState, turn: { from: number; to: number } | undefined, actions: Action[], opts: ReviewOptions): Root {
  if (state.result) {
    const w = state.result.winner;
    return { score: w === null ? 0 : w === state.turn ? MATE : -MATE, best: null, second: null, played: null, moves: 0 };
  }
  if (state.pending.some((p) => p.color === state.turn)) {
    return { score: reviewScore(state, Math.min(2, opts.depth)), best: null, second: null, played: null, moves: 2 };
  }
  const move = turn ? singleMove(actions, turn) : null;
  const r = reviewRoot(state, opts.depth, opts.timeMs, move ?? undefined);
  return { score: r.bestScore, best: r.best, second: r.second, played: r.playedScore, moves: r.moves };
}
