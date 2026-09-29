// Minimax with alpha-beta pruning (spec §7) on top of the same legal move
// generator the player uses. Iterative deepening keeps each turn within a
// time budget: if a depth does not finish in time, the last finished depth
// decides.

import { abilityOptions, abilityPieces, abilityReady, applyAbility } from '../abilities';
import { applyChoice, applyMove } from '../apply';
import { legalMoves, beliefFor } from '../legal';
import type { Action, MatchState } from '../match';
import { sameMove } from '../match';
import { inCheck } from '../status';
import type { Color, Move, Position, Square } from '../types';
import { cardValue, evaluate } from './evaluate';

export const MATE = 1_000_000;

export interface BotOptions {
  /** Search depth in plies (1–3). */
  depth: number;
  /** Time budget per turn in milliseconds. */
  timeMs: number;
  /** Random spread added to root scores, in centipawns (default 3). */
  noise?: number;
  /** Chance to play a random legal move instead (weak levels). */
  blunder?: number;
  /** Resolve captures after the horizon (default true); off = hangs pieces. */
  quiescence?: boolean;
}

export const DEFAULT_BOT: BotOptions = { depth: 2, timeMs: 1500 };

class Timeout extends Error {}

interface SearchState {
  deadline: number;
  nodes: number;
  /** Capture plies searched past the horizon. */
  qDepth: number;
  noise: number;
}

function tick(sc: SearchState): void {
  if (++sc.nodes % 64 === 0 && Date.now() > sc.deadline) throw new Timeout();
}

function moveOrderScore(pos: Position, m: Move): number {
  let score = 0;
  for (const c of m.captures) {
    const v = pos.board[c];
    if (v) score += 10 * cardValue(v.cardId);
  }
  if (m.promotion) score += 8000;
  const mover = pos.board[m.from];
  if (m.captures.length && mover) score -= cardValue(mover.cardId);
  return score;
}

function ordered(pos: Position, moves: Move[], first?: Move | null): Move[] {
  const scored = moves.map((m) => ({ m, s: first && sameMove(m, first) ? Infinity : moveOrderScore(pos, m) }));
  scored.sort((a, b) => b.s - a.s);
  return scored.map((x) => x.m);
}

function negamax(pos: Position, depth: number, alpha: number, beta: number, sc: SearchState, fromRoot: number): number {
  tick(sc);
  const pc = pos.pending.find((p) => p.color === pos.turn);
  if (pc) {
    let best = -Infinity;
    for (const o of pc.options) {
      const v = negamax(applyChoice(pos, o).pos, depth, alpha, beta, sc, fromRoot);
      if (v > best) best = v;
      if (v > alpha) alpha = v;
      if (alpha >= beta) break;
    }
    return best;
  }
  if (depth <= 0) return quiesce(pos, alpha, beta, sc, fromRoot, sc.qDepth);
  const moves = legalMoves(pos);
  if (moves.length === 0) return inCheck(pos) ? -MATE + fromRoot : 0;
  let best = -Infinity;
  for (const m of ordered(pos, moves)) {
    const v = -negamax(applyMove(pos, m), depth - 1, -beta, -alpha, sc, fromRoot + 1);
    if (v > best) best = v;
    if (v > alpha) alpha = v;
    if (alpha >= beta) break;
  }
  return best;
}

const QUIESCENCE_DEPTH = 4;

/**
 * Resolve captures before judging a position, so the bot does not stop
 * its search in the middle of an exchange and hang pieces.
 */
function quiesce(pos: Position, alpha: number, beta: number, sc: SearchState, fromRoot: number, q: number): number {
  tick(sc);
  if (pos.pending.some((p) => p.color === pos.turn)) return evaluate(pos, pos.turn);
  if (inCheck(pos)) {
    const moves = legalMoves(pos);
    if (moves.length === 0) return -MATE + fromRoot;
    if (q <= 0) return evaluate(pos, pos.turn);
    let best = -Infinity;
    for (const m of ordered(pos, moves)) {
      const v = -quiesce(applyMove(pos, m), -beta, -alpha, sc, fromRoot + 1, q - 1);
      if (v > best) best = v;
      if (v > alpha) alpha = v;
      if (alpha >= beta) break;
    }
    return best;
  }
  // Fail-soft: return real scores, not the window edge, so root moves that
  // merely touch the bound are never mistaken for equally good ones.
  const stand = evaluate(pos, pos.turn);
  if (stand >= beta || q <= 0) return stand;
  if (stand > alpha) alpha = stand;
  let best = stand;
  for (const m of ordered(pos, legalMoves(pos, true))) {
    const v = -quiesce(applyMove(pos, m), -beta, -alpha, sc, fromRoot + 1, q - 1);
    if (v > best) best = v;
    if (v > alpha) alpha = v;
    if (alpha >= beta) break;
  }
  return best;
}

interface RootResult {
  move: Move | null;
  score: number;
}

function searchRoot(pos: Position, depth: number, sc: SearchState, first: Move | null): RootResult {
  const moves = legalMoves(pos);
  if (moves.length === 0) return { move: null, score: inCheck(pos) ? -MATE : 0 };
  let best = -Infinity; // noisy score of the chosen move
  let bestRaw = -Infinity;
  let bestMove: Move | null = null;
  for (const m of ordered(pos, moves, first)) {
    // A little noise keeps the bot from replaying the same game. The window
    // is widened by twice the noise, so a move that only returned a bound can
    // never overtake the best one by luck.
    const raw = -negamax(applyMove(pos, m), depth - 1, -Infinity, -(bestRaw - 2 * sc.noise), sc, 1);
    const v = raw + (Math.random() * 2 - 1) * sc.noise;
    if (bestMove === null || v > best) {
      best = v;
      bestRaw = raw;
      bestMove = m;
    }
  }
  return { move: bestMove, score: bestRaw };
}

interface Style {
  qDepth: number;
  noise: number;
}

const STRONG: Style = { qDepth: QUIESCENCE_DEPTH, noise: 3 };

const styleOf = (o: BotOptions): Style => ({ qDepth: o.quiescence === false ? 0 : QUIESCENCE_DEPTH, noise: o.noise ?? 3 });

/** Iterative deepening; always returns at least a depth-1 answer. */
function iterative(pos: Position, maxDepth: number, deadline: number, style: Style = STRONG): RootResult {
  let result: RootResult = { move: null, score: -Infinity };
  for (let d = 1; d <= maxDepth; d++) {
    const sc: SearchState = { deadline: d === 1 ? Infinity : deadline, nodes: 0, qDepth: style.qDepth, noise: style.noise };
    try {
      result = searchRoot(pos, d, sc, result.move);
    } catch (e) {
      if (e instanceof Timeout) break;
      throw e;
    }
    if (Math.abs(result.score) > MATE / 2) break;
  }
  return result;
}

/** Map a move found on the believed position to the real legal move. */
function toRealMove(pos: Position, m: Move): Move {
  const legal = legalMoves(pos);
  return (
    legal.find((x) => sameMove(x, m)) ??
    legal.find((x) => x.pieceId === m.pieceId && x.target === m.target && x.kind === m.kind) ??
    legal.find((x) => x.pieceId === m.pieceId && x.target === m.target) ??
    legal[0]
  );
}

export interface BotTurn {
  actions: Action[];
  score: number;
}

const ABILITY_MARGIN = 60;

/**
 * The bot's full turn: an optional ability press or pending choice followed
 * by a move. Searches only what `color` is allowed to know (§4.5).
 */
export function chooseTurn(state: MatchState, color: Color, opts: BotOptions = DEFAULT_BOT): BotTurn {
  const start = Date.now();
  const deadline = start + opts.timeMs;
  const depth = Math.max(1, Math.min(3, opts.depth));
  const belief = beliefFor(state, color);
  const style = styleOf(opts);

  const pc = belief.pending.find((p) => p.color === color);
  if (pc) {
    let best: { square: Square; res: RootResult } | null = null;
    const perOption = Math.max(50, opts.timeMs / pc.options.length);
    for (const o of pc.options) {
      const res = iterative(applyChoice(belief, o).pos, depth, Math.min(deadline, Date.now() + perOption), style);
      if (!best || res.score > best.res.score) best = { square: o, res };
    }
    const actions: Action[] = [{ type: 'choose', square: best!.square }];
    const realAfter = applyChoice(state, best!.square).pos;
    if (best!.res.move) actions.push({ type: 'move', move: toRealMove(realAfter, best!.res.move) });
    return { actions, score: best!.res.score };
  }

  // Weak levels sometimes just play anything.
  if (opts.blunder && Math.random() < opts.blunder) {
    const real = legalMoves(state);
    if (real.length) return { actions: [{ type: 'move', move: real[Math.floor(Math.random() * real.length)] }], score: 0 };
  }
  const base = iterative(belief, depth, deadline, style);
  let chosen: { pieceId: string; key: string; res: RootResult } | null = null;

  for (const { piece, def } of abilityPieces(belief, color)) {
    if (def.id === 'hint' || def.viaMove || !abilityReady(belief, piece.id)) continue;
    const options = abilityOptions(belief, piece.id);
    // Abilities only get the time left over from the main search, unless a
    // button is the only way to make a move at all.
    const stuck = !base.move;
    if (!options.length || (!stuck && deadline - Date.now() < opts.timeMs * 0.4)) continue;
    // Cheap screening first, then a full search on the two best options.
    const screened: { o: (typeof options)[number]; s: number }[] = [];
    for (const o of options) {
      if (!stuck && Date.now() > deadline) break;
      screened.push({ o, s: iterative(applyAbility(belief, piece.id, o.key).pos, 1, Infinity, style).score });
    }
    const shallow = screened.sort((a, b) => b.s - a.s).slice(0, 2);
    for (const { o } of shallow) {
      if (!stuck && Date.now() > deadline) break;
      const res = iterative(applyAbility(belief, piece.id, o.key).pos, depth, deadline, style);
      const bar = stuck && !chosen ? -Infinity : (chosen?.res.score ?? base.score) + ABILITY_MARGIN;
      if (res.move && res.score > bar) chosen = { pieceId: piece.id, key: o.key, res };
    }
  }

  if (chosen) {
    const realAfter = applyAbility(state, chosen.pieceId, chosen.key).pos;
    return {
      actions: [
        { type: 'ability', pieceId: chosen.pieceId, key: chosen.key },
        { type: 'move', move: toRealMove(realAfter, chosen.res.move!) },
      ],
      score: chosen.res.score,
    };
  }
  if (!base.move) {
    // The believed position (with the opponent's illusions as real pieces)
    // can have no moves while the real one does: play any real legal move.
    const real = legalMoves(state);
    return { actions: real.length ? [{ type: 'move', move: real[0] }] : [], score: base.score };
  }
  return { actions: [{ type: 'move', move: toRealMove(state, base.move) }], score: base.score };
}

/** Best move for `color` on the position it can see (Підказка). */
export function bestMove(state: MatchState, color: Color, opts: BotOptions = DEFAULT_BOT): Move | null {
  const belief = beliefFor(state, color);
  if (belief.pending.some((p) => p.color === color)) return null;
  const res = iterative(belief, Math.max(1, Math.min(3, opts.depth)), Date.now() + opts.timeMs);
  return res.move ? toRealMove(state, res.move) : null;
}
