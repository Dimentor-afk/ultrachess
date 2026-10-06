// Special moves shared by line pieces (bishops, rooks, queens).

import { NO_SQUARE, fileOf, isBoardSquare, isEdgeSquare, lastRank, offset, rankOf, sq } from '../coords';
import {
  type GenCtx,
  defaultPassOwn,
  isEmptyBoard,
  mk,
  seen,
  stepSquares,
  walk,
} from '../gen';
import { findKing } from '../position';
import type { Leg, Move, Piece, Square } from '../types';

type Dir = [number, number];

export const LEVITATION_COOLDOWN = 5;
/** Own turns before Портальний слон can use the portal again. */
export const PORTAL_COOLDOWN = 5;

/** Perpendicular directions: diagonal turns stay diagonal, straight turns 90°. */
function perpendicular([df, dr]: Dir): Dir[] {
  if (df !== 0 && dr !== 0) {
    return [
      [df, -dr],
      [-df, dr],
    ];
  }
  return [
    [dr, df],
    [-dr, -df],
  ];
}

/** Десантник / Стрибун: jump over the first piece to the square right behind it. */
export function jumpOverMoves(
  ctx: GenCtx,
  p: Piece,
  from: Square,
  dirs: Dir[],
  extra: Partial<Move>,
  /** Empty squares needed before the piece it jumps (Стрибун needs a run-up; the paratrooper does not). */
  runUp = 0,
): Move[] {
  const out: Move[] = [];
  if (ctx.attack) return out;
  for (const [df, dr] of dirs) {
    const { steps, block } = walk(ctx, from, df, dr, 9, defaultPassOwn(p));
    if (!block || block.ring || !block.piece) continue;
    if (steps.length < runUp) continue;
    const beyond = offset(block.s, df, dr);
    if (!isEmptyBoard(ctx, beyond)) continue;
    out.push(
      mk(p, from, beyond, {
        kind: 'special',
        path: [...stepSquares(steps), block.s, beyond],
        legs: [...(steps.length ? [{ to: steps[steps.length - 1].s, style: 'slide' as const }] : []), { to: beyond, style: 'hop' }],
        label: 'Перестрибнути фігуру',
        ...extra,
      }),
    );
  }
  return out;
}

/** Рикошет: reach the board edge, then bounce one more square. */
export function ricochetMoves(ctx: GenCtx, p: Piece, from: Square, dirs: Dir[]): Move[] {
  const out: Move[] = [];
  for (const dir of dirs) {
    const [df, dr] = dir;
    const { steps, block } = walk(ctx, from, df, dr, 9, defaultPassOwn(p));
    if (steps.length === 0 || (block && !block.ring)) continue;
    const last = steps[steps.length - 1];
    if (last.pass) continue;
    const L = last.s;
    const nf = fileOf(L) + df;
    const nr = rankOf(L) + dr;
    let bounces: Dir[];
    if (df !== 0 && dr !== 0) {
      const flipF = nf < 0 || nf > 7;
      const flipR = nr < 0 || nr > 7;
      if (flipF && flipR) continue; // a corner sends the piece straight back
      bounces = [[flipF ? -df : df, flipR ? -dr : dr]];
    } else {
      bounces = perpendicular(dir);
    }
    for (const [bf, br] of bounces) {
      const R = offset(L, bf, br);
      if (R === NO_SQUARE || !isBoardSquare(R)) continue;
      const q = seen(ctx, R);
      const path = [...stepSquares(steps), R];
      const legs: Leg[] = [
        { to: L, style: 'slide', stop: true },
        { to: R, style: 'slide' },
      ];
      if (!q) {
        if (!ctx.attack) out.push(mk(p, from, R, { kind: 'special', path, legs, label: 'Рикошет' }));
      } else if (q.color === ctx.enemy) {
        out.push(mk(p, from, R, { captures: [R], path, legs, label: 'Рикошет із взяттям' }));
      }
    }
  }
  return out;
}

/** Ланцюговий / Кутова тура: up to 3 squares, one turn, up to 2 more squares. */
export function turnMoves(ctx: GenCtx, p: Piece, from: Square, dirs: Dir[]): Move[] {
  const out: Move[] = [];
  for (const d1 of dirs) {
    const leg1: Square[] = [];
    let corner = from;
    for (let k = 1; k <= 3; k++) {
      corner = offset(corner, d1[0], d1[1]);
      if (!isEmptyBoard(ctx, corner)) break;
      leg1.push(corner);
      for (const [df, dr] of perpendicular(d1)) {
        let s = corner;
        const leg2: Square[] = [];
        for (let j = 1; j <= 2; j++) {
          s = offset(s, df, dr);
          if (s === NO_SQUARE || !isBoardSquare(s)) break;
          const q = seen(ctx, s);
          leg2.push(s);
          const path = [...leg1, ...leg2];
          const legs: Leg[] = [
            { to: corner, style: 'slide', stop: true },
            { to: s, style: 'slide' },
          ];
          if (!q) {
            if (!ctx.attack) out.push(mk(p, from, s, { kind: 'special', path, legs, label: 'Хід із поворотом' }));
            continue;
          }
          if (q.color === ctx.enemy) {
            out.push(mk(p, from, s, { captures: [s], path, legs, label: 'Взяття з поворотом' }));
          }
          break;
        }
      }
    }
  }
  return out;
}

/**
 * Левітація: slide along a free line past the board edge onto a platform.
 * An edge square steps straight off; from further away the whole line must
 * be clear up to the edge.
 */
export function levitateMoves(ctx: GenCtx, p: Piece, from: Square, dirs: Dir[]): Move[] {
  const out: Move[] = [];
  if (ctx.attack || !isBoardSquare(from) || (ctx.pos.cooldowns[p.id] ?? 0) > 0) return out;
  for (const [df, dr] of dirs) {
    const { steps, block } = walk(ctx, from, df, dr, 9, defaultPassOwn(p));
    if (!block || !block.ring || block.piece !== null) continue;
    out.push(
      mk(p, from, block.s, {
        kind: 'levitate',
        levitate: true,
        cooldown: LEVITATION_COOLDOWN,
        path: [...stepSquares(steps), block.s],
        label: 'Левітація на платформу',
      }),
    );
  }
  return out;
}

/** Проколювач: hit an enemy through exactly one piece; the bishop dies. */
export function pierceMoves(ctx: GenCtx, p: Piece, from: Square, dirs: Dir[]): Move[] {
  const out: Move[] = [];
  if (ctx.attack) return out;
  const passOwn = defaultPassOwn(p);
  for (const [df, dr] of dirs) {
    const w1 = walk(ctx, from, df, dr, 9, passOwn);
    if (!w1.block || w1.block.ring || !w1.block.piece) continue;
    const w2 = walk(ctx, w1.block.s, df, dr, 9, passOwn);
    const b = w2.block;
    if (!b || b.ring || !b.piece || b.piece.color !== ctx.enemy || b.piece.type === 'king') continue;
    out.push(
      mk(p, from, null, {
        kind: 'pierce',
        captures: [b.s],
        target: b.s,
        path: [...stepSquares(w1.steps), w1.block.s, ...stepSquares(w2.steps), b.s],
        label: 'Прокол (слон гине)',
      }),
    );
  }
  return out;
}

/**
 * Портальний слон: slide to the board edge, leave through it and reappear on
 * the point-mirrored square (a6 → h3), then keep moving the same way.
 * After a move through the portal it recharges for PORTAL_COOLDOWN own turns.
 */
export function portalMoves(ctx: GenCtx, p: Piece, from: Square, dirs: Dir[]): Move[] {
  const out: Move[] = [];
  if (!isBoardSquare(from) || (ctx.pos.cooldowns[p.id] ?? 0) > 0) return out;
  const passOwn = defaultPassOwn(p);
  const add = (s: Square, path: Square[], edge: Square, mirror: Square, capture: boolean) => {
    if (!capture && ctx.attack) return;
    out.push(
      mk(p, from, s, {
        kind: 'special',
        captures: capture ? [s] : [],
        cooldown: PORTAL_COOLDOWN,
        path: path.slice(),
        legs: [
          { to: edge, style: 'slide', stop: true },
          { to: mirror, style: 'warp' },
          ...(s !== mirror ? [{ to: s, style: 'slide' as const }] : []),
        ],
        label: capture ? 'Взяття через портал' : 'Через портал',
      }),
    );
  };
  for (const [df, dr] of dirs) {
    // 1. Reach the edge along a free line (at least one square of travel).
    const { steps, block } = walk(ctx, from, df, dr, 9, passOwn);
    if (steps.length === 0 || (block && !block.ring)) continue;
    const last = steps[steps.length - 1].s;
    const path = stepSquares(steps);
    // 2. Reappear on the mirrored square and continue the same direction.
    const mirror = sq(7 - fileOf(last), 7 - rankOf(last));
    let s = mirror;
    while (s !== NO_SQUARE && isBoardSquare(s) && s !== from) {
      path.push(s);
      const q = seen(ctx, s);
      if (!q) add(s, path, last, mirror, false);
      else if (q.color === ctx.enemy) {
        add(s, path, last, mirror, true);
        break;
      } else if (!passOwn?.(q)) break;
      s = offset(s, df, dr);
    }
  }
  return out;
}

/** Таранна тура: pass through one enemy piece and capture the piece behind it. */
export function batteringMoves(ctx: GenCtx, p: Piece, from: Square, dirs: Dir[]): Move[] {
  const out: Move[] = [];
  if (ctx.attack || ctx.pos.onceUsed[p.id]) return out;
  const passOwn = defaultPassOwn(p);
  for (const [df, dr] of dirs) {
    const w1 = walk(ctx, from, df, dr, 9, passOwn);
    const b1 = w1.block;
    if (!b1 || b1.ring || !b1.piece || b1.piece.color !== ctx.enemy) continue;
    const w2 = walk(ctx, b1.s, df, dr, 9, passOwn);
    const b2 = w2.block;
    if (!b2 || b2.ring || !b2.piece || b2.piece.color !== ctx.enemy || b2.piece.type === 'king') continue;
    out.push(
      mk(p, from, b2.s, {
        kind: 'special',
        once: true,
        captures: [b2.s],
        path: [...stepSquares(w1.steps), b1.s, ...stepSquares(w2.steps), b2.s],
        label: 'Таран крізь фігуру (раз за гру)',
      }),
    );
  }
  return out;
}

/** Витіснювач: take the square of an own piece, pushing it one square further. */
export function displaceMoves(ctx: GenCtx, p: Piece, from: Square, dirs: Dir[]): Move[] {
  const out: Move[] = [];
  if (ctx.attack) return out;
  for (const [df, dr] of dirs) {
    const { steps, block } = walk(ctx, from, df, dr, 9, defaultPassOwn(p));
    if (!block || block.ring) continue;
    const own = ctx.pos.board[block.s];
    if (!own || own.color !== ctx.color || own.type === 'king') continue;
    const beyond = offset(block.s, df, dr);
    if (!isEmptyBoard(ctx, beyond)) continue;
    if (own.type === 'pawn' && rankOf(beyond) === lastRank(own.color)) continue;
    out.push(
      mk(p, from, block.s, {
        kind: 'push',
        displaced: [{ from: block.s, to: beyond }],
        path: [...stepSquares(steps), block.s],
        label: 'Витіснити свою фігуру',
      }),
    );
  }
  return out;
}

/** Замкова тура: teleport next to the own king. */
export function castleTeleportMoves(ctx: GenCtx, p: Piece, from: Square): Move[] {
  const out: Move[] = [];
  if (ctx.attack || ctx.pos.onceUsed[p.id]) return out;
  const k = findKing(ctx.pos, ctx.color);
  if (k < 0) return out;
  for (let df = -1; df <= 1; df++) {
    for (let dr = -1; dr <= 1; dr++) {
      if (!df && !dr) continue;
      const t = offset(k, df, dr);
      if (t === from || !isEmptyBoard(ctx, t)) continue;
      out.push(mk(p, from, t, { kind: 'teleport', once: true, label: 'Телепорт до короля (раз за гру)' }));
    }
  }
  return out;
}

/** Фланговик: from an edge square jump two squares along that edge. */
export function flankMoves(ctx: GenCtx, p: Piece, from: Square): Move[] {
  const out: Move[] = [];
  if (!isEdgeSquare(from)) return out;
  const f = fileOf(from);
  const r = rankOf(from);
  const jumps: Dir[] = [];
  if (f === 0 || f === 7) jumps.push([0, 2], [0, -2]);
  if (r === 0 || r === 7) jumps.push([2, 0], [-2, 0]);
  for (const [df, dr] of jumps) {
    const t = offset(from, df, dr);
    if (t === NO_SQUARE || !isBoardSquare(t)) continue;
    const mid = offset(from, df / 2, dr / 2);
    const q = seen(ctx, t);
    if (!q) {
      if (!ctx.attack) out.push(mk(p, from, t, { kind: 'special', path: [mid, t], legs: [{ to: t, style: 'hop' }], label: 'Стрибок уздовж краю' }));
    } else if (q.color === ctx.enemy) {
      out.push(mk(p, from, t, { captures: [t], path: [mid, t], legs: [{ to: t, style: 'hop' }], label: 'Стрибок уздовж краю зі взяттям' }));
    }
  }
  return out;
}

/** Хамелеон: step to an orthogonally adjacent empty square (other colour). */
export function chameleonMoves(ctx: GenCtx, p: Piece, from: Square, dirs: Dir[]): Move[] {
  if (ctx.attack) return [];
  const out: Move[] = [];
  for (const [df, dr] of dirs) {
    const t = offset(from, df, dr);
    if (isEmptyBoard(ctx, t)) out.push(mk(p, from, t, { kind: 'special', label: 'Змінити колір клітинки' }));
  }
  return out;
}

