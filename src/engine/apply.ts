// Executes moves, choices and the automatic effects they trigger
// (defensive card hooks, Засідник, Барикада, platform and illusion expiry).

import { attackPly, attackingMoves } from './attack';
import { CLASSIC_CARD } from './cards';
import {
  CELLS,
  KNIGHT_LEAPS,
  NO_SQUARE,
  fileOf,
  forward,
  homeRank,
  isBoardSquare,
  offset,
  opposite,
  rankOf,
  sq,
} from './coords';
import { makeCtx } from './gen';
import { generatorFor } from './modifiers';
import {
  cleanupIllusions,
  clonePosition,
  findKing,
  forgetPiece,
  freezeOwnTurns,
  illusionAt,
  isFrozen,
  newId,
  removeIllusionAt,
  removeIllusionsOf,
} from './position';
import { hasAnyLegalTurn } from './status';
import type { Color, Move, Piece, PieceType, Platform, Position, Square } from './types';

export const ILLUSION_LIFETIME_PLIES = 5; // 3 opponent turns
export const PLATFORM_LIFETIME_PLIES = 5; // 3 opponent turns

const ILLUSIONISTS = new Set(['bishop-illusionist', 'rook-illusionist', 'knight-illusionist']);

export type GameEvent =
  | { type: 'illusionDispelled'; square: Square; owner: Color }
  | { type: 'captured'; piece: Piece; square: Square }
  | { type: 'kamikaze'; attacker: Piece }
  | { type: 'martyr'; attackerId: string }
  | { type: 'shield'; piece: Piece; to: Square }
  | { type: 'fortress'; piece: Piece; to: Square }
  | { type: 'immortal'; piece: Piece; to: Square }
  | { type: 'riderShield'; piece: Piece; passenger: Piece }
  | { type: 'riderLanding'; piece: Piece; to: Square }
  | { type: 'ambush'; ambusher: Piece; square: Square }
  | { type: 'fell'; piece: Piece }
  | { type: 'platformReturn'; piece: Piece; to: Square }
  | { type: 'barricade'; square: Square; color: Color };

export interface ApplyOpts {
  /** Legality simulation: skip Барикада's mate test and auto-pick choices. */
  lite?: boolean;
}

interface Attacker {
  id: string;
  color: Color;
  type: PieceType;
  alive: boolean;
}

function enemyIllusionAt(pos: Position, owner: Color, s: Square): boolean {
  return !!illusionAt(pos, opposite(owner), s);
}

/** Free board square for a relocating piece of `owner` (enemy illusions look occupied). */
function freeFor(pos: Position, owner: Color, s: Square): boolean {
  return s !== NO_SQUARE && isBoardSquare(s) && pos.board[s] === null && !enemyIllusionAt(pos, owner, s);
}

function attacksSquare(pos: Position, piece: Piece, from: Square, target: Square): boolean {
  const ctx = makeCtx(pos, piece.color, attackPly(pos, piece.color), true);
  return generatorFor(piece.cardId)(ctx, piece, from).some((m) => m.captures.includes(target));
}

/** Безсмертна: home square, else the nearest free square on its first rank. */
function immortalRespawn(pos: Position, queen: Piece): Square {
  const rank = homeRank(queen.color);
  const homeFile = fileOf(queen.homeSquare);
  const files = [0, 1, 2, 3, 4, 5, 6, 7].sort((a, b) => Math.abs(a - homeFile) - Math.abs(b - homeFile) || a - b);
  const enemyKing = findKing(pos, opposite(queen.color));
  for (const f of files) {
    const s = sq(f, rank);
    if (!freeFor(pos, queen.color, s)) continue;
    // The queen may not reappear giving check during the opponent's own turn.
    if (enemyKing >= 0) {
      pos.board[s] = queen;
      const checks = attacksSquare(pos, queen, s, enemyKing);
      pos.board[s] = null;
      if (checks) continue;
    }
    return s;
  }
  return NO_SQUARE;
}

function resolveVictim(
  next: Position,
  victim: Piece,
  at: Square,
  attacker: Attacker,
  events: GameEvent[],
  ply: number,
  auto: boolean,
): void {
  const owner = victim.color;

  const passenger = next.passengers[victim.id];
  if (victim.cardId === 'knight-rider' && passenger) {
    delete next.passengers[victim.id];
    events.push({ type: 'riderShield', piece: victim, passenger });
    const options = KNIGHT_LEAPS.map(([df, dr]) => offset(at, df, dr)).filter((t) => freeFor(next, owner, t));
    if (options.length > 0) {
      freezeOwnTurns(next, victim, 1, ply);
      if (auto || owner !== opposite(next.turn)) {
        next.board[options[0]] = victim;
        events.push({ type: 'riderLanding', piece: victim, to: options[0] });
      } else {
        next.pending.push({ kind: 'riderLanding', color: owner, piece: victim, origin: at, options });
      }
      return;
    }
  }

  if (victim.cardId === 'queen-immortal' && next.hiddenState[owner].immortalPly === ply && !next.onceUsed[victim.id]) {
    const dest = immortalRespawn(next, victim);
    if (dest !== NO_SQUARE) {
      next.board[dest] = victim;
      next.onceUsed[victim.id] = true;
      events.push({ type: 'immortal', piece: victim, to: dest });
      return;
    }
  }

  if (victim.cardId === 'pawn-shieldbearer' && !next.onceUsed[victim.id] && attacker.type === 'pawn') {
    next.onceUsed[victim.id] = true;
    const back = offset(at, 0, -forward(owner));
    if (freeFor(next, owner, back)) {
      next.board[back] = victim;
      events.push({ type: 'shield', piece: victim, to: back });
      return;
    }
  }

  if (
    victim.cardId === 'rook-fortress' &&
    !next.onceUsed[victim.id] &&
    attacker.type !== 'rook' &&
    attacker.type !== 'queen'
  ) {
    next.onceUsed[victim.id] = true;
    const back = -forward(owner);
    for (const [df, dr] of [
      [0, back],
      [-1, 0],
      [1, 0],
    ]) {
      const t = offset(at, df, dr);
      if (!freeFor(next, owner, t)) continue;
      next.board[t] = victim;
      freezeOwnTurns(next, victim, 1, ply);
      events.push({ type: 'fortress', piece: victim, to: t });
      return;
    }
  }

  forgetPiece(next, victim);
  events.push({ type: 'captured', piece: victim, square: at });

  if (victim.cardId === 'bishop-martyr' && attacker.alive) {
    freezeOwnTurns(next, { id: attacker.id, color: attacker.color } as Piece, 2, ply);
    events.push({ type: 'martyr', attackerId: attacker.id });
  }
}

function ambush(next: Position, s: Square, moverColor: Color, events: GameEvent[], ply: number): void {
  const E = opposite(moverColor);
  for (const df of [-1, 1]) {
    const a = offset(s, df, -forward(E));
    if (a === NO_SQUARE || !isBoardSquare(a)) continue;
    const amb = next.board[a];
    if (!amb || amb.color !== E || amb.cardId !== 'pawn-ambusher' || isFrozen(next, amb.id, ply)) continue;
    const victim = next.board[s];
    if (!victim || victim.type === 'king') return;
    next.board[a] = null;
    forgetPiece(next, amb);
    next.board[s] = null;
    events.push({ type: 'ambush', ambusher: amb, square: s });
    resolveVictim(next, victim, s, { id: amb.id, color: E, type: 'pawn', alive: false }, events, ply, true);
    return;
  }
}

function makeIllusion(next: Position, src: Piece, s: Square, ply: number): void {
  const h = next.hiddenState[src.color];
  next.hiddenState[src.color] = {
    ...h,
    illusions: [
      ...h.illusions.filter((i) => i.square !== s),
      {
        id: newId(next, `ill-${src.color}-`),
        sourceId: src.id,
        color: src.color,
        type: src.type,
        cardId: src.cardId,
        square: s,
        expiresAfterPly: ply + ILLUSION_LIFETIME_PLIES,
      },
    ],
  };
}

export function applyMoveWithEvents(
  pos: Position,
  move: Move,
  opts: ApplyOpts = {},
): { pos: Position; events: GameEvent[] } {
  let m = move;
  const next = clonePosition(pos);
  const events: GameEvent[] = [];
  const mover = next.board[m.from];
  if (!mover || mover.id !== m.pieceId) throw new Error(`No piece ${m.pieceId} on ${m.from}`);
  const color = mover.color;
  const enemy = opposite(color);
  const ply = next.ply;
  let resetClock = mover.type === 'pawn';

  // An attempt to take an illusion: it vanishes. A piece that was going to
  // land there simply steps onto the empty square; otherwise the turn is spent.
  const touch = m.touch ?? m.captures[0];
  if (touch !== undefined && next.board[touch] === null && illusionAt(next, enemy, touch)) {
    removeIllusionAt(next, enemy, touch);
    events.push({ type: 'illusionDispelled', square: touch, owner: enemy });
    if (m.to === touch && isBoardSquare(touch) && m.captures.length === 1) {
      m = { ...m, captures: [], steps: undefined };
    } else {
      endPly(next, color, events, opts, false);
      return { pos: next, events };
    }
  }

  next.board[m.from] = null;
  if (!isBoardSquare(m.from)) next.platforms = next.platforms.filter((pl) => pl.pieceId !== mover.id);

  const lifted = (m.displaced ?? []).map((d) => {
    const p = next.board[d.from];
    next.board[d.from] = null;
    return { d, p };
  });

  let passenger: Piece | null = null;
  if (m.mount && m.to !== null) {
    passenger = next.board[m.to];
    next.board[m.to] = null;
  }

  let alive = m.to !== null;
  let finalTo = m.to;
  let skip = m.skip ?? 0;
  const victims: { piece: Piece; square: Square }[] = [];
  // Taking a piece on a platform: the attacker holds the platform until it expires.
  let heldPlatform: Platform | null = null;
  for (let i = 0; i < m.captures.length; i++) {
    const c = m.captures[i];
    const victim = next.board[c];
    if (!victim) {
      if (illusionAt(next, enemy, c)) {
        // A chain hit an illusion: it vanishes and the chain stops here.
        removeIllusionAt(next, enemy, c);
        events.push({ type: 'illusionDispelled', square: c, owner: enemy });
        finalTo = m.steps ? m.steps[i - 1] : finalTo;
        skip = 0;
      }
      break;
    }
    next.board[c] = null;
    if (!isBoardSquare(c)) {
      heldPlatform = next.platforms.find((pl) => pl.pieceId === victim.id) ?? null;
      next.platforms = next.platforms.filter((pl) => pl.pieceId !== victim.id);
    }
    resetClock = true;
    victims.push({ piece: victim, square: c });
    if (alive && victim.cardId === 'rook-kamikaze' && mover.type !== 'rook' && mover.type !== 'queen') {
      alive = false;
      events.push({ type: 'kamikaze', attacker: mover });
      break;
    }
  }

  if (alive && finalTo !== null) {
    let placed: Piece = { ...mover, moveCount: mover.moveCount + 1 };
    if (m.promotion && finalTo === m.to) {
      placed = { ...placed, type: m.promotion, cardId: CLASSIC_CARD[m.promotion] };
    }
    next.board[finalTo] = placed;
  } else {
    forgetPiece(next, mover);
  }

  for (const { d, p } of lifted) if (p) next.board[d.to] = p;

  const attacker: Attacker = { id: mover.id, color, type: mover.type, alive };
  for (const v of victims) resolveVictim(next, v.piece, v.square, attacker, events, ply, !!opts.lite);

  if (alive && finalTo !== null) {
    if (m.once) next.onceUsed[mover.id] = true;
    if (m.cooldown) next.cooldowns[mover.id] = m.cooldown;
    if (skip) freezeOwnTurns(next, mover, skip, ply);
    if (m.noPromote) next.noPromote[mover.id] = true;
    if (mover.cardId === 'knight-rotator') next.lastWasSwap[mover.id] = !!m.swap;
    if (m.loseCastling) next.castlingLost[mover.id] = true;
    if (m.levitate) {
      next.platforms.push({ square: finalTo, pieceId: mover.id, expiresAfterPly: ply + PLATFORM_LIFETIME_PLIES });
    }
    if (heldPlatform && !isBoardSquare(finalTo)) {
      const back = isBoardSquare(m.from) ? m.from : undefined;
      next.platforms.push({ square: finalTo, pieceId: mover.id, expiresAfterPly: heldPlatform.expiresAfterPly, returnTo: back });
    }
    if (passenger) next.passengers[mover.id] = passenger;
    removeIllusionsOf(next, mover.id);
    if (ILLUSIONISTS.has(mover.cardId) && finalTo !== m.from && isBoardSquare(m.from) && next.board[m.from] === null) {
      makeIllusion(next, mover, m.from, ply);
    }
    for (const s of m.mirage ?? []) if (next.board[s] === null) makeIllusion(next, mover, s, ply);

    const placed = next.board[finalTo];
    if (placed && placed.type !== 'king' && isBoardSquare(finalTo)) {
      const before = events.length;
      ambush(next, finalTo, color, events, ply);
      if (events.length > before) resetClock = true;
    }
  }

  endPly(next, color, events, opts, resetClock);
  return { pos: next, events };
}

export function applyMove(pos: Position, m: Move, opts: ApplyOpts = {}): Position {
  return applyMoveWithEvents(pos, m, opts).pos;
}

function endPly(next: Position, color: Color, events: GameEvent[], opts: ApplyOpts, resetClock: boolean): void {
  const ply = next.ply;
  for (const c of ['w', 'b'] as Color[]) {
    const h = next.hiddenState[c];
    const illusions = h.illusions.filter((i) => i.expiresAfterPly > ply);
    const immortalPly = h.immortalPly !== null && h.immortalPly <= ply ? null : h.immortalPly;
    const hint = c === color ? null : h.hint;
    if (illusions.length !== h.illusions.length || immortalPly !== h.immortalPly || hint !== h.hint) {
      next.hiddenState[c] = { illusions, immortalPly, hint };
    }
  }
  for (const pl of next.platforms) {
    if (pl.expiresAfterPly > ply) continue;
    const p = next.board[pl.square];
    if (p && p.id === pl.pieceId) {
      next.board[pl.square] = null;
      if (pl.returnTo !== undefined && next.board[pl.returnTo] === null) {
        // It took the platform by capture: it steps back where it attacked from.
        next.board[pl.returnTo] = p;
        events.push({ type: 'platformReturn', piece: p, to: pl.returnTo });
      } else {
        forgetPiece(next, p);
        events.push({ type: 'fell', piece: p });
      }
    }
  }
  next.platforms = next.platforms.filter((pl) => pl.expiresAfterPly > ply);
  next.barriers = next.barriers.filter((b) => b.ply > ply);
  cleanupIllusions(next);

  next.halfmoveClock = resetClock ? 0 : next.halfmoveClock + 1;
  next.ply = ply + 1;
  next.turn = opposite(color);
  for (let s = 0; s < CELLS; s++) {
    const p = next.board[s];
    if (p && p.color === next.turn && (next.cooldowns[p.id] ?? 0) > 0) next.cooldowns[p.id] -= 1;
  }

  if (!opts.lite) barricadeCheck(next, events);
}

/** Барикада: a single line checkmate is blocked by a new pawn next to the king. */
function barricadeCheck(next: Position, events: GameEvent[]): void {
  const D = next.turn;
  const k = findKing(next, D);
  if (k < 0 || next.pending.length) return;
  const king = next.board[k]!;
  if (king.cardId !== 'king-barricade' || next.onceUsed[king.id]) return;
  const attacks = attackingMoves(next, k, opposite(D));
  const attackerSquares = new Set(attacks.map((a) => a.square));
  if (attackerSquares.size !== 1) return;
  const { square: as, piece: ap } = attacks[0];
  if (ap.type === 'knight' || ap.type === 'pawn') return;
  const fa = fileOf(as);
  const ra = rankOf(as);
  const fk = fileOf(k);
  const rk = rankOf(k);
  const dfa = fk - fa;
  const dra = rk - ra;
  if (!(dfa === 0 || dra === 0 || Math.abs(dfa) === Math.abs(dra))) return;
  const dist = Math.max(Math.abs(dfa), Math.abs(dra));
  if (dist < 2) return;
  const df = Math.sign(dfa);
  const dr = Math.sign(dra);
  const line: Square[] = [];
  for (let i = 1; i <= dist; i++) line.push(sq(fa + i * df, ra + i * dr));
  for (let i = 0; i < dist - 1; i++) if (next.board[line[i]] !== null) return;
  const straight = attacks.some((a) => a.move.path.length === dist && a.move.path.every((s, i) => s === line[i]));
  if (!straight) return;
  if (hasAnyLegalTurn(next)) return;
  const block = sq(fk - df, rk - dr);
  next.board[block] = {
    id: newId(next, `${D}-bp`),
    color: D,
    type: 'pawn',
    cardId: 'pawn-classic',
    moveCount: 1,
    homeSquare: block,
  };
  next.onceUsed[king.id] = true;
  cleanupIllusions(next);
  events.push({ type: 'barricade', square: block, color: D });
}

/** Вершник's owner picks the landing square. Does not end the turn. */
export function applyChoice(pos: Position, square: Square): { pos: Position; events: GameEvent[] } {
  const pc = pos.pending[0];
  if (!pc || pc.color !== pos.turn || !pc.options.includes(square)) throw new Error('Illegal choice');
  const next = clonePosition(pos);
  next.pending = next.pending.slice(1);
  next.board[square] = pc.piece;
  cleanupIllusions(next);
  return { pos: next, events: [{ type: 'riderLanding', piece: pc.piece, to: square }] };
}
