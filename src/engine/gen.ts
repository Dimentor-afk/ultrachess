// Shared building blocks for move generators: the mover's view of the board
// (enemy illusions look like real pieces, own illusions are transparent),
// sliding, leaping and move construction.

import { NO_SQUARE, isBoardSquare, lastRank, offset, opposite, rankOf } from './coords';
import { CLASSIC_CARD } from './cards';
import type { Color, Move, Piece, PieceType, Position, Square } from './types';

export interface GenCtx {
  pos: Position;
  color: Color;
  enemy: Color;
  /** Ply at which the generated moves would be played. */
  ply: number;
  /** Attack detection: only captures matter, no castling or quiet specials. */
  attack: boolean;
  /** Enemy illusions as the mover sees them: indistinguishable from pieces. */
  enemyIllusions: Map<Square, Piece>;
  /** Whether the enemy attacks a square on its next ply (castling, Мандрівник). */
  squareAttacked?: (s: Square) => boolean;
}

/**
 * Where a piece ends after taking a piece on a levitation platform: on the
 * platform itself (it holds it while the platform lives); a king hits from
 * where it stands and never leaves the board.
 */
export function platformLanding(piece: Piece, from: Square, platform: Square): Square {
  return piece.type === 'king' ? from : platform;
}

export function makeCtx(pos: Position, color: Color, ply: number, attack: boolean): GenCtx {
  const enemy = opposite(color);
  const enemyIllusions = new Map<Square, Piece>();
  for (const ill of pos.hiddenState[enemy].illusions) {
    enemyIllusions.set(ill.square, {
      id: ill.id,
      color: ill.color,
      type: ill.type,
      cardId: ill.cardId,
      moveCount: 1,
      homeSquare: ill.square,
    });
  }
  return { pos, color, enemy, ply, attack, enemyIllusions };
}

/** What the mover sees on a grid square. */
export function seen(ctx: GenCtx, s: Square): Piece | null {
  const p = ctx.pos.board[s];
  if (p) return p;
  if (ctx.enemyIllusions.size > 0) return ctx.enemyIllusions.get(s) ?? null;
  return null;
}

export const isEmptyBoard = (ctx: GenCtx, s: Square): boolean =>
  s !== NO_SQUARE && isBoardSquare(s) && seen(ctx, s) === null;

export function enemyAt(ctx: GenCtx, s: Square): Piece | null {
  if (s === NO_SQUARE) return null;
  const p = seen(ctx, s);
  return p && p.color === ctx.enemy ? p : null;
}

export function ownAt(ctx: GenCtx, s: Square): Piece | null {
  if (s === NO_SQUARE) return null;
  const p = ctx.pos.board[s];
  return p && p.color === ctx.color ? p : null;
}

export function mk(piece: Piece, from: Square, to: Square | null, fields: Partial<Move>): Move {
  const captures = fields.captures ?? [];
  return {
    pieceId: piece.id,
    from,
    target: fields.target ?? (to ?? captures[0] ?? from),
    to,
    kind: fields.kind ?? (captures.length ? 'capture' : 'move'),
    label: fields.label ?? (captures.length ? 'Взяти' : 'Хід'),
    path: fields.path ?? (to !== null ? [to] : []),
    ...fields,
    captures,
  };
}

export interface WalkStep {
  s: Square;
  /** Passed through an own piece (Трамплін, Тунельна тура). */
  pass: boolean;
}

export interface WalkBlock {
  s: Square;
  piece: Piece | null;
  ring: boolean;
  k: number;
}

export interface WalkResult {
  steps: WalkStep[];
  block: WalkBlock | null;
}

/** Walk a ray until something stops it. Ring cells always stop the walk. */
export function walk(
  ctx: GenCtx,
  from: Square,
  df: number,
  dr: number,
  max: number,
  passOwn?: (p: Piece) => boolean,
): WalkResult {
  const steps: WalkStep[] = [];
  const fromRing = !isBoardSquare(from);
  let s = from;
  for (let k = 1; k <= max; k++) {
    s = offset(s, df, dr);
    if (s === NO_SQUARE) return { steps, block: null };
    if (!isBoardSquare(s)) {
      if (fromRing) return { steps, block: null };
      return { steps, block: { s, piece: ctx.pos.board[s], ring: true, k } };
    }
    const p = seen(ctx, s);
    if (!p) {
      steps.push({ s, pass: false });
      continue;
    }
    if (p.color === ctx.color && passOwn && passOwn(p)) {
      steps.push({ s, pass: true });
      continue;
    }
    return { steps, block: { s, piece: p, ring: false, k } };
  }
  return { steps, block: null };
}

export const pathTo = (steps: WalkStep[], i: number): Square[] => steps.slice(0, i + 1).map((st) => st.s);
export const stepSquares = (steps: WalkStep[]): Square[] => steps.map((st) => st.s);

const SLIDERS: PieceType[] = ['bishop', 'rook', 'queen'];

/** Трамплін: own sliders pass through it as if the square were empty. */
export function defaultPassOwn(piece: Piece): ((p: Piece) => boolean) | undefined {
  if (!SLIDERS.includes(piece.type)) return undefined;
  return (p) => p.cardId === 'knight-springboard';
}

export interface SlideOpts {
  max?: number;
  minCapture?: number;
  afterStep?: boolean;
  passOwn?: (p: Piece) => boolean;
}

export function slideMoves(
  ctx: GenCtx,
  piece: Piece,
  from: Square,
  dirs: [number, number][],
  opts: SlideOpts = {},
): Move[] {
  const out: Move[] = [];
  const max = opts.max ?? 9;
  const minCapture = opts.minCapture ?? 1;
  const passOwn = opts.passOwn ?? defaultPassOwn(piece);
  for (const [df, dr] of dirs) {
    const { steps, block } = walk(ctx, from, df, dr, max, passOwn);
    if (!ctx.attack) {
      steps.forEach((st, i) => {
        if (!st.pass) out.push(mk(piece, from, st.s, { path: pathTo(steps, i) }));
      });
    }
    if (!block || !block.piece || block.piece.color !== ctx.enemy || block.k < minCapture) continue;
    const path = [...stepSquares(steps), block.s];
    if (block.ring) {
      out.push(mk(piece, from, platformLanding(piece, from, block.s), { captures: [block.s], target: block.s, path, label: 'Взяти на платформі' }));
      continue;
    }
    out.push(mk(piece, from, block.s, { captures: [block.s], path }));
    if (opts.afterStep && !ctx.attack) {
      const next = offset(block.s, df, dr);
      if (isEmptyBoard(ctx, next)) {
        out.push(
          mk(piece, from, next, {
            captures: [block.s],
            target: block.s,
            path: [...path, next],
            label: 'Взяти й пройти ще 1 клітинку',
          }),
        );
      }
    }
  }
  return out;
}

export interface LeapOpts {
  noCapture?: boolean;
  noQuiet?: boolean;
}

export function leapMoves(
  ctx: GenCtx,
  piece: Piece,
  from: Square,
  leaps: [number, number][],
  opts: LeapOpts = {},
): Move[] {
  const out: Move[] = [];
  const fromRing = !isBoardSquare(from);
  for (const [df, dr] of leaps) {
    const t = offset(from, df, dr);
    if (t === NO_SQUARE) continue;
    if (!isBoardSquare(t)) {
      if (fromRing || opts.noCapture) continue;
      const p = ctx.pos.board[t];
      if (p && p.color === ctx.enemy) {
        out.push(mk(piece, from, platformLanding(piece, from, t), { captures: [t], target: t, path: [t], label: 'Взяти на платформі' }));
      }
      continue;
    }
    const p = seen(ctx, t);
    if (!p) {
      if (!ctx.attack && !opts.noQuiet) out.push(mk(piece, from, t, {}));
    } else if (p.color === ctx.enemy && !opts.noCapture) {
      out.push(mk(piece, from, t, { captures: [t] }));
    }
  }
  return out;
}

export const PROMOTION_TYPES: PieceType[] = ['queen', 'rook', 'bishop', 'knight'];
const PROMO_LABEL: Record<string, string> = {
  queen: 'ферзь',
  rook: 'тура',
  bishop: 'слон',
  knight: 'кінь',
};

/** Expand pawn moves that land on the last rank into promotion choices. */
export function withPromotion(ctx: GenCtx, piece: Piece, moves: Move[], noPromote = false): Move[] {
  if (noPromote || ctx.pos.noPromote[piece.id]) return moves;
  const out: Move[] = [];
  for (const m of moves) {
    if (m.to === null || !isBoardSquare(m.to) || rankOf(m.to) !== lastRank(piece.color) || m.noPromote) {
      out.push(m);
      continue;
    }
    if (ctx.attack) {
      out.push({ ...m, promotion: 'queen' });
      continue;
    }
    for (const t of PROMOTION_TYPES) {
      out.push({ ...m, promotion: t, label: `${m.label} → ${PROMO_LABEL[t]}` });
    }
  }
  return out;
}

export function promotedCard(type: PieceType): string {
  return CLASSIC_CARD[type];
}

/** Remove duplicate destinations (same target, final square and captures). */
export function dedupe(moves: Move[]): Move[] {
  const seenKeys = new Set<string>();
  const out: Move[] = [];
  for (const m of moves) {
    const key = `${m.target}|${m.to}|${m.captures.join(',')}|${m.promotion ?? ''}|${m.kind}`;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    out.push(m);
  }
  return out;
}
