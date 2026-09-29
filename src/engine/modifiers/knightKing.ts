import {
  ALL_DIRS,
  CAMEL_LEAPS,
  KNIGHT_LEAPS,
  NO_SQUARE,
  ORTHO,
  fileOf,
  forward,
  homeRank,
  isBoardSquare,
  offset,
  rankOf,
  sq,
  squareName,
} from '../coords';
import { type GenCtx, enemyAt, isEmptyBoard, leapMoves, mk, seen } from '../gen';
import { isFrozen } from '../position';
import type { Move, Piece, Square } from '../types';
import type { Generator } from './registry';

export const MIRAGE_COOLDOWN = 5;

const knight: Generator = (ctx, p, from) => leapMoves(ctx, p, from, KNIGHT_LEAPS);

function relabel(moves: Move[], label: string): Move[] {
  return moves.map((m) => ({ ...m, kind: 'special', label: m.captures.length ? `${label} зі взяттям` : label }));
}

function inCenter(s: Square): boolean {
  const f = fileOf(s);
  const r = rankOf(s);
  return f >= 2 && f <= 5 && r >= 2 && r <= 5;
}

function hasAdjacentOwnKnight(ctx: GenCtx, p: Piece, from: Square): boolean {
  for (const [df, dr] of ALL_DIRS) {
    const t = offset(from, df, dr);
    if (t === NO_SQUARE) continue;
    const q = ctx.pos.board[t];
    if (q && q.color === p.color && q.type === 'knight' && q.id !== p.id) return true;
  }
  return false;
}

function wallRunMoves(ctx: GenCtx, p: Piece, from: Square): Move[] {
  if (ctx.attack) return [];
  // Every square along the wall is offered from every landing: the player
  // picks the landing first, then how far to run.
  const out: Move[] = [];
  for (const [df, dr] of KNIGHT_LEAPS) {
    const L = offset(from, df, dr);
    if (!isEmptyBoard(ctx, L)) continue;
    const f = fileOf(L);
    const r = rankOf(L);
    const dirs: [number, number][] = [];
    if (f === 0 || f === 7) dirs.push([0, 1], [0, -1]);
    if (r === 0 || r === 7) dirs.push([1, 0], [-1, 0]);
    for (const [ef, er] of dirs) {
      let s = L;
      const path: Square[] = [L];
      for (let k = 1; k <= 2; k++) {
        s = offset(s, ef, er);
        if (!isEmptyBoard(ctx, s)) break;
        path.push(s);
        if (s === from) continue;
        out.push(
          mk(p, from, s, {
            kind: 'special',
            path: path.slice(),
            legs: [
              { to: L, style: 'hop', stop: true },
              { to: s, style: 'slide' },
            ],
            label: 'Стрибок і біг уздовж краю',
          }),
        );
      }
    }
  }
  return out;
}

function gallopMoves(ctx: GenCtx, p: Piece, from: Square): Move[] {
  if (p.moveCount > 0) return [];
  const single = new Set(leapMoves(ctx, p, from, KNIGHT_LEAPS).map((m) => m.target));
  const out: Move[] = [];
  const done = new Set<Square>();
  for (const [df, dr] of KNIGHT_LEAPS) {
    const j1 = offset(from, df, dr);
    if (!isEmptyBoard(ctx, j1)) continue;
    for (const [ef, er] of KNIGHT_LEAPS) {
      const t = offset(j1, ef, er);
      if (t === NO_SQUARE || !isBoardSquare(t) || t === from || single.has(t) || done.has(t)) continue;
      const q = seen(ctx, t);
      if (q && q.color !== ctx.enemy) continue;
      if (!q && ctx.attack) continue;
      done.add(t);
      out.push(
        mk(p, from, t, {
          kind: 'special',
          captures: q ? [t] : [],
          path: [j1, t],
          legs: [
            { to: j1, style: 'hop', stop: true },
            { to: t, style: 'hop' },
          ],
          label: q ? 'Подвійний стрибок зі взяттям' : 'Подвійний стрибок',
        }),
      );
    }
  }
  return out;
}

function rotatorMoves(ctx: GenCtx, p: Piece, from: Square): Move[] {
  if (ctx.attack || ctx.pos.lastWasSwap[p.id] || !isBoardSquare(from)) return [];
  const r = rankOf(from);
  if (r === 0 || r === 7) return [];
  const out: Move[] = [];
  for (const [df, dr] of ALL_DIRS) {
    const t = offset(from, df, dr);
    if (t === NO_SQUARE || !isBoardSquare(t)) continue;
    const q = ctx.pos.board[t];
    if (!q || q.color !== p.color || q.type !== 'pawn') continue;
    out.push(
      mk(p, from, t, {
        kind: 'swap',
        swap: true,
        displaced: [{ from: t, to: from }],
        label: 'Помінятися з пішаком',
      }),
    );
  }
  return out;
}

function berserkMoves(ctx: GenCtx, p: Piece, from: Square): Move[] {
  const base = knight(ctx, p, from);
  if (ctx.attack) return base;
  const out = [...base];
  for (const m of base) {
    if (!m.captures.length || m.to !== m.captures[0]) continue;
    const c1 = m.captures[0];
    for (const [df, dr] of KNIGHT_LEAPS) {
      const c2 = offset(c1, df, dr);
      if (c2 === NO_SQUARE || !isBoardSquare(c2)) continue;
      const q = enemyAt(ctx, c2);
      if (!q || q.type === 'king') continue;
      out.push(
        mk(p, from, c2, {
          captures: [c1, c2],
          steps: [c1, c2],
          target: c1,
          path: [c1, c2],
          legs: [
            { to: c1, style: 'hop', stop: true },
            { to: c2, style: 'hop' },
          ],
          skip: 1,
          label: `Берсерк: ще взяти на ${squareName(c2)}`,
        }),
      );
    }
  }
  return out;
}

function riderMoves(ctx: GenCtx, p: Piece, from: Square): Move[] {
  const out = knight(ctx, p, from);
  if (ctx.attack || ctx.pos.passengers[p.id]) return out;
  for (const [df, dr] of KNIGHT_LEAPS) {
    const t = offset(from, df, dr);
    if (t === NO_SQUARE || !isBoardSquare(t)) continue;
    const q = ctx.pos.board[t];
    if (q && q.color === p.color && q.type === 'pawn') {
      out.push(mk(p, from, t, { kind: 'mount', mount: true, label: 'Посадити пішака на коня' }));
    }
  }
  return out;
}

function mirageMoves(ctx: GenCtx, p: Piece, from: Square): Move[] {
  const out = knight(ctx, p, from);
  if (ctx.attack || (ctx.pos.cooldowns[p.id] ?? 0) > 0) return out;
  const free: Square[] = [];
  for (const [df, dr] of KNIGHT_LEAPS) {
    const t = offset(from, df, dr);
    if (isEmptyBoard(ctx, t)) free.push(t);
  }
  if (free.length < 2) return out;
  for (const t of free) {
    out.push(
      mk(p, from, t, {
        kind: 'mirage',
        mirage: free.filter((x) => x !== t),
        cooldown: MIRAGE_COOLDOWN,
        label: 'Міраж',
      }),
    );
  }
  return out;
}

export const knightGenerators: Record<string, Generator> = {
  'knight-classic': knight,
  'knight-camel': (ctx, p, from) => leapMoves(ctx, p, from, CAMEL_LEAPS),
  'knight-herald': (ctx, p, from) => [
    ...knight(ctx, p, from),
    ...(p.moveCount === 0 ? relabel(leapMoves(ctx, p, from, [[0, 2 * forward(p.color)]]), 'Гінець: 2 вперед') : []),
  ],
  'knight-diagonal': (ctx, p, from) => [
    ...knight(ctx, p, from),
    ...(p.moveCount === 0
      ? relabel(
          leapMoves(ctx, p, from, [
            [2, 2],
            [2, -2],
            [-2, 2],
            [-2, -2],
          ]),
          'Стрибок по діагоналі',
        )
      : []),
  ],
  'knight-illusionist': knight,
  'knight-squire': (ctx, p, from) => [
    ...knight(ctx, p, from),
    ...relabel(leapMoves(ctx, p, from, ORTHO, { noCapture: true }), 'Крок зброєносця'),
  ],
  'knight-central': (ctx, p, from) => [
    ...knight(ctx, p, from),
    ...(inCenter(from) ? relabel(leapMoves(ctx, p, from, CAMEL_LEAPS), 'Стрибок 3+1') : []),
  ],
  'knight-brother': (ctx, p, from) => [
    ...knight(ctx, p, from),
    ...(hasAdjacentOwnKnight(ctx, p, from) ? relabel(leapMoves(ctx, p, from, CAMEL_LEAPS), 'Стрибок 3+1') : []),
  ],
  'knight-wallrunner': (ctx, p, from) => [...knight(ctx, p, from), ...wallRunMoves(ctx, p, from)],
  'knight-galloper': (ctx, p, from) => [...knight(ctx, p, from), ...gallopMoves(ctx, p, from)],
  'knight-springboard': knight,
  'knight-rotator': (ctx, p, from) => [...knight(ctx, p, from), ...rotatorMoves(ctx, p, from)],
  'knight-berserk': berserkMoves,
  'knight-rider': riderMoves,
  'knight-mirage': mirageMoves,
};

// ── Королі ──

function castlingMoves(ctx: GenCtx, king: Piece, from: Square): Move[] {
  const attacked = ctx.squareAttacked;
  if (ctx.attack || !attacked) return [];
  if (king.moveCount > 0 || ctx.pos.castlingLost[king.id] || from !== king.homeSquare) return [];
  const r = rankOf(from);
  if (r !== homeRank(king.color) || attacked(from)) return [];
  const kf = fileOf(from);
  const out: Move[] = [];
  for (const side of [
    { rookFile: 7, kingTo: 6, rookTo: 5 },
    { rookFile: 0, kingTo: 2, rookTo: 3 },
  ]) {
    const rs = sq(side.rookFile, r);
    const rook = ctx.pos.board[rs];
    if (!rook || rook.color !== king.color || rook.type !== 'rook' || rook.moveCount > 0 || rook.homeSquare !== rs) {
      continue;
    }
    if (isFrozen(ctx.pos, rook.id, ctx.ply)) continue;
    let clear = true;
    for (let f = Math.min(kf, side.rookFile) + 1; f < Math.max(kf, side.rookFile); f++) {
      if (seen(ctx, sq(f, r))) clear = false;
    }
    if (!clear) continue;
    const step = Math.sign(side.kingTo - kf);
    const path: Square[] = [];
    let safe = true;
    for (let f = kf + step; ; f += step) {
      const s = sq(f, r);
      path.push(s);
      if (attacked(s)) safe = false;
      if (f === side.kingTo) break;
    }
    if (!safe) continue;
    out.push(
      mk(king, from, sq(side.kingTo, r), {
        kind: 'castle',
        path,
        displaced: [{ from: rs, to: sq(side.rookTo, r) }],
        label: 'Рокіровка',
      }),
    );
  }
  return out;
}

const classicKing: Generator = (ctx, p, from) => [
  ...leapMoves(ctx, p, from, ALL_DIRS),
  ...castlingMoves(ctx, p, from),
];

function wandererMoves(ctx: GenCtx, p: Piece, from: Square): Move[] {
  const out = leapMoves(ctx, p, from, ORTHO);
  for (const [df, dr] of ORTHO) {
    const mid = offset(from, df, dr);
    if (!isEmptyBoard(ctx, mid)) continue;
    if (!ctx.attack && ctx.squareAttacked?.(mid)) continue;
    const t = offset(mid, df, dr);
    if (t === NO_SQUARE || !isBoardSquare(t)) continue;
    const q = seen(ctx, t);
    if (!q) {
      if (!ctx.attack) out.push(mk(p, from, t, { path: [mid, t], label: 'Хід на 2' }));
    } else if (q.color === ctx.enemy) {
      out.push(mk(p, from, t, { captures: [t], path: [mid, t], label: 'Взяття на 2' }));
    }
  }
  return [...out, ...castlingMoves(ctx, p, from)];
}

function swapperMoves(ctx: GenCtx, p: Piece, from: Square): Move[] {
  const out = classicKing(ctx, p, from);
  if (ctx.attack || ctx.pos.onceUsed[p.id] || rankOf(from) !== homeRank(p.color) || !isBoardSquare(from)) {
    return out;
  }
  for (let f = 0; f < 8; f++) {
    const s = sq(f, homeRank(p.color));
    const q = ctx.pos.board[s];
    if (!q || q.color !== p.color || s === from) continue;
    out.push(
      mk(p, from, s, {
        kind: 'swap',
        displaced: [{ from: s, to: from }],
        once: true,
        loseCastling: true,
        path: [],
        label: 'Обмін місцями (раз за гру)',
      }),
    );
  }
  return out;
}

export const kingGenerators: Record<string, Generator> = {
  'king-classic': classicKing,
  'king-wanderer': wandererMoves,
  'king-swapper': swapperMoves,
  'king-barricade': classicKing,
  'king-hint': classicKing,
};
