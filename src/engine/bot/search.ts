// Minimax with alpha-beta pruning (spec §7) on top of the same legal move
// generator the player uses. Iterative deepening keeps each turn within a
// time budget: if a depth does not finish in time, the last finished depth
// decides. A transposition table, killer and history move ordering, principal
// variation search and late move reductions let the strong levels see deeper;
// quiescence resolves captures past the horizon.

import { abilityOptions, abilityPieces, abilityReady, applyAbility } from '../abilities';
import { applyChoice, applyMove } from '../apply';
import { beliefFor, candidateMoves, isLegalCandidate, legalMoves, mobility } from '../legal';
import { opposite } from '../coords';
import type { Action, MatchState } from '../match';
import { sameMove } from '../match';
import { inCheck } from '../status';
import type { Color, Move, Position, Square } from '../types';
import { MOBILITY_WEIGHT, cardValue, evaluate, material } from './evaluate';

export const MATE = 1_000_000;

export interface BotOptions {
  /** Deepest search in plies (iterative deepening stops earlier when time runs out). */
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

/** No search goes deeper than this, however much time is left. */
const MAX_DEPTH = 32;

class Timeout extends Error {}

/** What a finished search learnt about a position, to reuse when it comes up again. */
interface TTEntry {
  depth: number;
  score: number;
  /** 0: exact score, 1: at least `score` (a cutoff), 2: at most `score` (nothing beat alpha). */
  flag: 0 | 1 | 2;
  move: Move | null;
}

/** Positions kept per turn (a few hundred thousand strings is a few tens of MB). */
const TT_MAX = 300_000;

interface SearchState {
  deadline: number;
  nodes: number;
  /** Capture plies searched past the horizon. */
  qDepth: number;
  noise: number;
  tt: Map<string, TTEntry>;
  /** Two quiet moves per ply that caused a cutoff (killer moves). */
  killers: (Move | null)[][];
  /** How often a quiet move caused a cutoff anywhere (history heuristic). */
  history: Map<string, number>;
}

function newSearch(deadline: number, style: Style, tt: Map<string, TTEntry>): SearchState {
  return { deadline, nodes: 0, qDepth: style.qDepth, noise: style.noise, tt, killers: [], history: new Map() };
}

function tick(sc: SearchState): void {
  if (++sc.nodes % 64 === 0 && Date.now() > sc.deadline) throw new Timeout();
}

/**
 * Everything that decides what can happen next: the pieces (with their ids, cooldowns
 * and first-move state), whose turn it is, and the time-limited effects counted from
 * now. Two positions with the same key play the same from here on.
 */
function ttKey(pos: Position): string {
  const ply = pos.ply;
  let k = pos.turn;
  for (let s = 0; s < pos.board.length; s++) {
    const p = pos.board[s];
    if (!p) continue;
    k += `|${s}${p.color}${p.id}${p.cardId}${p.moveCount}`;
    const cd = pos.cooldowns[p.id];
    if (cd) k += `c${cd}`;
    if (pos.onceUsed[p.id]) k += 'o';
    const fr = (pos.frozenUntil[p.id] ?? -1) - ply;
    if (fr >= 0) k += `f${fr}`;
    if (pos.noPromote[p.id]) k += 'n';
    if (pos.lastWasSwap[p.id]) k += 'w';
    if (pos.castlingLost[p.id]) k += 'l';
    const pas = pos.passengers[p.id];
    if (pas) k += `p${pas.id}${pas.cardId}`;
  }
  for (const pl of pos.platforms) k += `#P${pl.square}${pl.pieceId}${pl.expiresAfterPly - ply}${pl.returnTo ?? ''}`;
  for (const b of pos.barriers) k += `#B${b.orientation}${b.c}${b.againstColor}${b.ply - ply}`;
  for (const c of ['w', 'b'] as const) {
    const h = pos.hiddenState[c];
    if (h.immortalPly !== null) k += `#I${c}${h.immortalPly - ply}`;
    for (const il of h.illusions) k += `#L${il.square}${il.color}${il.cardId}${il.expiresAfterPly - ply}`;
  }
  for (const pc of pos.pending) k += `#C${pc.color}${pc.piece.id}${pc.options.join(',')}`;
  return k;
}

/** Mate scores are stored relative to the position, not the root. */
function toTT(score: number, ply: number): number {
  return score > MATE / 2 ? score + ply : score < -MATE / 2 ? score - ply : score;
}
function fromTT(score: number, ply: number): number {
  return score > MATE / 2 ? score - ply : score < -MATE / 2 ? score + ply : score;
}

function store(sc: SearchState, key: string, e: TTEntry): void {
  if (sc.tt.size >= TT_MAX && !sc.tt.has(key)) sc.tt.clear();
  sc.tt.set(key, e);
}

const isQuiet = (m: Move) => !m.captures.length && !m.promotion;
const historyKey = (m: Move) => `${m.pieceId}>${m.target}${m.kind}`;

function gain(pos: Position, m: Move): number {
  let v = m.promotion ? 800 : 0;
  for (const c of m.captures) {
    const p = pos.board[c];
    if (p) v += cardValue(p.cardId);
  }
  return v;
}

/** Captures first (most valuable victim, least valuable attacker), then killers, then by history. */
function moveOrderScore(pos: Position, m: Move, sc: SearchState | null, ply: number): number {
  if (!isQuiet(m)) {
    const mover = pos.board[m.from];
    return 1_000_000 + 10 * gain(pos, m) - (m.captures.length && mover ? cardValue(mover.cardId) : 0);
  }
  if (!sc) return 0;
  const k = sc.killers[ply];
  if (k?.[0] && sameMove(k[0], m)) return 900_000;
  if (k?.[1] && sameMove(k[1], m)) return 800_000;
  return sc.history.get(historyKey(m)) ?? 0;
}

function ordered(pos: Position, moves: Move[], first?: Move | null, sc: SearchState | null = null, ply = 0): Move[] {
  const scored = moves.map((m) => ({ m, s: first && sameMove(m, first) ? Infinity : moveOrderScore(pos, m, sc, ply) }));
  scored.sort((a, b) => b.s - a.s);
  return scored.map((x) => x.m);
}

function rememberCutoff(sc: SearchState, m: Move, depth: number, ply: number): void {
  const k = (sc.killers[ply] ??= [null, null]);
  if (!k[0] || !sameMove(k[0], m)) {
    k[1] = k[0];
    k[0] = m;
  }
  const hk = historyKey(m);
  sc.history.set(hk, Math.min(700_000, (sc.history.get(hk) ?? 0) + depth * depth));
}

/** Per ply of depth left: how far material must be from the window to prune near the horizon. */
const FUTILITY_MARGIN = 150;

/** Checks extend the search a ply, up to this far from the root. */
const EXTEND_UNTIL = 16;

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

  const key = ttKey(pos);
  const hit = sc.tt.get(key);
  if (hit && hit.depth >= depth) {
    const v = fromTT(hit.score, fromRoot);
    if (hit.flag === 0) return v;
    if (hit.flag === 1 && v >= beta) return v;
    if (hit.flag === 2 && v <= alpha) return v;
  }

  const check = inCheck(pos);
  const next = depth - 1 + (check && fromRoot < EXTEND_UNTIL ? 1 : 0);

  // Near the horizon a position far ahead (or far behind) on material does not need
  // every quiet move searched: reverse futility and futility pruning.
  let futile = false;
  if (!check && depth <= 3 && Math.abs(alpha) < MATE / 2 && Math.abs(beta) < MATE / 2) {
    const stat = material(pos, pos.turn) - material(pos, opposite(pos.turn));
    if (stat - FUTILITY_MARGIN * depth >= beta) return stat;
    futile = depth <= 2 && stat + FUTILITY_MARGIN * depth <= alpha;
  }

  const alpha0 = alpha;
  let best = -Infinity;
  let bestMove: Move | null = null;
  let i = 0;
  // Legality (king safety) is checked only for the moves actually searched.
  for (const m of ordered(pos, candidateMoves(pos), hit?.move, sc, fromRoot)) {
    if (futile && i > 0 && isQuiet(m)) continue;
    if (!isLegalCandidate(pos, m)) continue;
    const child = applyMove(pos, m);
    let v: number;
    if (i === 0) {
      v = -negamax(child, next, -beta, -alpha, sc, fromRoot + 1);
    } else {
      // Late quiet moves are rarely best: look at them shallower first (late move
      // reductions), with a null window (principal variation search), and only search
      // them properly when they surprise.
      const r = depth >= 3 && i >= 3 && !check && isQuiet(m) ? (i >= 10 ? 2 : 1) : 0;
      v = -negamax(child, next - r, -alpha - 1, -alpha, sc, fromRoot + 1);
      if (v > alpha && (r > 0 || v < beta)) v = -negamax(child, next, -beta, -alpha, sc, fromRoot + 1);
    }
    if (v > best) {
      best = v;
      bestMove = m;
    }
    if (v > alpha) alpha = v;
    if (alpha >= beta) {
      if (isQuiet(m)) rememberCutoff(sc, m, depth, fromRoot);
      break;
    }
    i++;
  }
  if (i === 0 && bestMove === null) return check ? -MATE + fromRoot : 0;
  store(sc, key, { depth, score: toTT(best, fromRoot), flag: best <= alpha0 ? 2 : best >= beta ? 1 : 0, move: bestMove });
  return best;
}

const QUIESCENCE_DEPTH = 4;
/** A capture that cannot bring the score near alpha even with this much extra is skipped. */
const DELTA_MARGIN = 200;
/** Mobility moves the score by less than this: far outside the window, material decides. */
const LAZY_MARGIN = 160;

/** The static score, without counting moves when material alone is far outside the window. */
function staticScore(pos: Position, alpha: number, beta: number): number {
  const color = pos.turn;
  const enemy = opposite(color);
  const mat = material(pos, color) - material(pos, enemy);
  if (mat - LAZY_MARGIN >= beta || mat + LAZY_MARGIN <= alpha) return mat;
  return mat + MOBILITY_WEIGHT * (mobility(pos, color) - mobility(pos, enemy));
}

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
  const stand = staticScore(pos, alpha, beta);
  if (stand >= beta || q <= 0) return stand;
  if (stand > alpha) alpha = stand;
  let best = stand;
  for (const m of ordered(pos, candidateMoves(pos, true))) {
    // Delta pruning: even winning this outright would not reach alpha.
    if (stand + gain(pos, m) + DELTA_MARGIN <= alpha) continue;
    if (!isLegalCandidate(pos, m)) continue;
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
  /** Deepest finished iteration. */
  depth: number;
}

function searchRoot(pos: Position, depth: number, sc: SearchState, first: Move | null): RootResult {
  const moves = legalMoves(pos);
  if (moves.length === 0) return { move: null, score: inCheck(pos) ? -MATE : 0, depth };
  let best = -Infinity; // noisy score of the chosen move
  let bestRaw = -Infinity;
  let bestMove: Move | null = null;
  let i = 0;
  for (const m of ordered(pos, moves, first, sc, 0)) {
    // A little noise keeps the bot from replaying the same game. The window
    // is widened by twice the noise, so a move that only returned a bound can
    // never overtake the best one by luck.
    const child = applyMove(pos, m);
    const floor = bestRaw - 2 * sc.noise;
    let raw: number;
    if (i === 0) raw = -negamax(child, depth - 1, -Infinity, Infinity, sc, 1);
    else {
      // Other root moves: first only "is it better?", then the real score.
      raw = -negamax(child, depth - 1, -floor - 1, -floor, sc, 1);
      if (raw > floor) raw = -negamax(child, depth - 1, -Infinity, -floor, sc, 1);
    }
    const v = raw + (Math.random() * 2 - 1) * sc.noise;
    if (bestMove === null || v > best) {
      best = v;
      bestRaw = raw;
      bestMove = m;
    }
    i++;
  }
  return { move: bestMove, score: bestRaw, depth };
}

interface Style {
  qDepth: number;
  noise: number;
}

const STRONG: Style = { qDepth: QUIESCENCE_DEPTH, noise: 3 };

const styleOf = (o: BotOptions): Style => ({ qDepth: o.quiescence === false ? 0 : QUIESCENCE_DEPTH, noise: o.noise ?? 3 });

let lastNodes = 0;
let lastDepth = 0;
/** Nodes and depth of the last turn (benchmarks). */
export function lastStats(): { nodes: number; depth: number } {
  return { nodes: lastNodes, depth: lastDepth };
}

/** Iterative deepening; always returns at least a depth-1 answer. */
function iterative(pos: Position, maxDepth: number, deadline: number, style: Style = STRONG, tt: Map<string, TTEntry> = new Map()): RootResult {
  let result: RootResult = { move: null, score: -Infinity, depth: 0 };
  for (let d = 1; d <= maxDepth; d++) {
    const began = Date.now();
    const sc = newSearch(d === 1 ? Infinity : deadline, style, tt);
    try {
      result = searchRoot(pos, d, sc, result.move);
    } catch (e) {
      if (e instanceof Timeout) break;
      throw e;
    } finally {
      lastNodes += sc.nodes;
    }
    if (Math.abs(result.score) > MATE / 2) break;
    // The next depth takes a few times longer: do not start one that cannot finish.
    if (d >= 3 && Date.now() + (Date.now() - began) * 2 > deadline) break;
  }
  lastDepth = Math.max(lastDepth, result.depth);
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
  lastNodes = 0;
  lastDepth = 0;
  const depth = Math.max(1, Math.min(MAX_DEPTH, opts.depth));
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
  const res = iterative(belief, Math.max(1, Math.min(MAX_DEPTH, opts.depth)), Date.now() + opts.timeMs);
  return res.move ? toRealMove(state, res.move) : null;
}
