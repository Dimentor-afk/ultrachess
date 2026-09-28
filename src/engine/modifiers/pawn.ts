import { NO_SQUARE, forward, isBoardSquare, offset, pawnStartRank, rankOf } from '../coords';
import { type GenCtx, enemyAt, isEmptyBoard, mk, seen, withPromotion } from '../gen';
import type { Move, Piece, Square } from '../types';
import type { Generator } from './registry';

interface PawnCfg {
  forward?: boolean;
  double?: boolean;
  diagCapture?: boolean;
  forwardCapture?: boolean;
  diagMove?: boolean;
  back?: boolean;
}

function captureAt(ctx: GenCtx, p: Piece, from: Square, t: Square, out: Move[]): void {
  if (t === NO_SQUARE) return;
  if (!isBoardSquare(t)) {
    const q = ctx.pos.board[t];
    if (q && q.color === ctx.enemy) {
      out.push(mk(p, from, from, { captures: [t], target: t, path: [t], label: 'Взяти на платформі' }));
    }
    return;
  }
  if (enemyAt(ctx, t)) out.push(mk(p, from, t, { captures: [t] }));
}

function pawnBase(ctx: GenCtx, p: Piece, from: Square, cfg: PawnCfg): Move[] {
  const out: Move[] = [];
  if (!isBoardSquare(from)) return out;
  const fwd = forward(p.color);
  const f1 = offset(from, 0, fwd);
  if (cfg.forward !== false && !ctx.attack && isEmptyBoard(ctx, f1)) {
    out.push(mk(p, from, f1, {}));
    if (cfg.double && p.moveCount === 0 && rankOf(from) === pawnStartRank(p.color)) {
      const f2 = offset(f1, 0, fwd);
      if (isEmptyBoard(ctx, f2)) out.push(mk(p, from, f2, { path: [f1, f2], label: 'Хід на 2' }));
    }
  }
  if (cfg.forwardCapture) captureAt(ctx, p, from, f1, out);
  if (cfg.diagCapture !== false) {
    captureAt(ctx, p, from, offset(from, -1, fwd), out);
    captureAt(ctx, p, from, offset(from, 1, fwd), out);
  }
  if (cfg.diagMove && !ctx.attack) {
    for (const df of [-1, 1]) {
      const t = offset(from, df, fwd);
      if (isEmptyBoard(ctx, t)) out.push(mk(p, from, t, { label: 'Хід по діагоналі' }));
    }
  }
  if (cfg.back && !ctx.attack) {
    const b = offset(from, 0, -fwd);
    if (isEmptyBoard(ctx, b)) out.push(mk(p, from, b, { label: 'Відступ назад' }));
  }
  return out;
}

const classicCfg: PawnCfg = { double: true };

function once(ctx: GenCtx, p: Piece): boolean {
  return !ctx.pos.onceUsed[p.id];
}

export const pawnGenerators: Record<string, Generator> = {
  'pawn-classic': (ctx, p, from) => withPromotion(ctx, p, pawnBase(ctx, p, from, classicCfg)),

  'pawn-stormer': (ctx, p, from) =>
    withPromotion(ctx, p, pawnBase(ctx, p, from, { double: true, diagCapture: false, forwardCapture: true })),

  'pawn-retreater': (ctx, p, from) => withPromotion(ctx, p, pawnBase(ctx, p, from, { back: true })),

  'pawn-oblique': (ctx, p, from) => {
    const out = pawnBase(ctx, p, from, classicCfg);
    if (!ctx.attack && once(ctx, p)) {
      for (const df of [-1, 1]) {
        const t = offset(from, df, forward(p.color));
        if (isEmptyBoard(ctx, t)) {
          out.push(mk(p, from, t, { kind: 'special', once: true, skip: 1, label: 'Косий хід (раз за гру)' }));
        }
      }
    }
    return withPromotion(ctx, p, out);
  },

  'pawn-ram': (ctx, p, from) => {
    const out = pawnBase(ctx, p, from, classicCfg);
    if (!ctx.attack && once(ctx, p)) {
      const f1 = offset(from, 0, forward(p.color));
      const victim = enemyAt(ctx, f1);
      const f2 = f1 === NO_SQUARE ? NO_SQUARE : offset(f1, 0, forward(p.color));
      if (victim && victim.type === 'pawn' && isBoardSquare(f1) && isEmptyBoard(ctx, f2)) {
        out.push(
          mk(p, from, f1, {
            kind: 'push',
            touch: f1,
            displaced: [{ from: f1, to: f2 }],
            once: true,
            label: 'Таран: штовхнути пішака',
          }),
        );
      }
    }
    return withPromotion(ctx, p, out);
  },

  'pawn-diagonal': (ctx, p, from) =>
    withPromotion(
      ctx,
      p,
      pawnBase(ctx, p, from, { forward: false, diagCapture: false, forwardCapture: true, diagMove: true }),
    ),

  'pawn-sprinter': (ctx, p, from) => {
    const out = pawnBase(ctx, p, from, {});
    if (!ctx.attack && once(ctx, p)) {
      const f1 = offset(from, 0, forward(p.color));
      const f2 = f1 === NO_SQUARE ? NO_SQUARE : offset(f1, 0, forward(p.color));
      if (isEmptyBoard(ctx, f1) && isEmptyBoard(ctx, f2)) {
        out.push(mk(p, from, f2, { kind: 'special', once: true, path: [f1, f2], label: 'Спринт на 2 (раз за гру)' }));
      }
    }
    return withPromotion(ctx, p, out);
  },

  'pawn-stubborn': (ctx, p, from) => {
    const out = pawnBase(ctx, p, from, classicCfg);
    if (!ctx.attack && once(ctx, p)) {
      const f1 = offset(from, 0, forward(p.color));
      const victim = enemyAt(ctx, f1);
      if (victim && victim.type !== 'king' && isBoardSquare(f1)) {
        out.push(
          mk(p, from, f1, {
            kind: 'swap',
            touch: f1,
            displaced: [{ from: f1, to: from }],
            once: true,
            skip: 1,
            label: 'Помінятися місцями (раз за гру)',
          }),
        );
      }
    }
    return withPromotion(ctx, p, out);
  },

  'pawn-marathoner': (ctx, p, from) => {
    const out = pawnBase(ctx, p, from, classicCfg);
    if (!ctx.attack && p.moveCount === 0) {
      const fwd = forward(p.color);
      const f1 = offset(from, 0, fwd);
      const f2 = f1 === NO_SQUARE ? NO_SQUARE : offset(f1, 0, fwd);
      const f3 = f2 === NO_SQUARE ? NO_SQUARE : offset(f2, 0, fwd);
      if (isEmptyBoard(ctx, f1) && isEmptyBoard(ctx, f2) && isEmptyBoard(ctx, f3)) {
        out.push(mk(p, from, f3, { kind: 'special', path: [f1, f2, f3], label: 'Марафон на 3' }));
      }
    }
    return withPromotion(ctx, p, out);
  },

  'pawn-phantom': (ctx, p, from) => {
    const out = pawnBase(ctx, p, from, classicCfg);
    if (!ctx.attack && once(ctx, p)) {
      const fwd = forward(p.color);
      const f1 = offset(from, 0, fwd);
      const f2 = f1 === NO_SQUARE ? NO_SQUARE : offset(f1, 0, fwd);
      if (f1 !== NO_SQUARE && isBoardSquare(f1) && seen(ctx, f1) && isEmptyBoard(ctx, f2)) {
        out.push(
          mk(p, from, f2, {
            kind: 'special',
            once: true,
            noPromote: true,
            path: [f1, f2],
            label: 'Стрибок Фантома (раз за гру)',
          }),
        );
      }
    }
    return withPromotion(ctx, p, out);
  },

  'pawn-spearman': (ctx, p, from) => {
    const out = pawnBase(ctx, p, from, { double: true, diagCapture: false });
    const fwd = forward(p.color);
    const f1 = offset(from, 0, fwd);
    if (isEmptyBoard(ctx, f1)) {
      const f2 = offset(f1, 0, fwd);
      if (f2 !== NO_SQUARE) {
        const victim = isBoardSquare(f2) ? enemyAt(ctx, f2) : ctx.pos.board[f2];
        if (victim && victim.color === ctx.enemy) {
          out.push(mk(p, from, f1, { captures: [f2], target: f2, path: [f1, f2], label: 'Удар списом' }));
        }
      }
    }
    return withPromotion(ctx, p, out);
  },

  'pawn-ambusher': (ctx, p, from) => withPromotion(ctx, p, pawnBase(ctx, p, from, classicCfg)),

  'pawn-shieldbearer': (ctx, p, from) => withPromotion(ctx, p, pawnBase(ctx, p, from, classicCfg)),

  'pawn-duelist': (ctx, p, from) => {
    const base = pawnBase(ctx, p, from, classicCfg);
    const out = [...base];
    if (!ctx.attack) {
      for (const m of base) {
        if (m.captures.length && m.to === m.captures[0]) {
          out.push(
            mk(p, from, from, {
              captures: m.captures,
              target: m.target,
              path: m.path,
              skip: 1,
              label: 'Взяти й повернутись',
            }),
          );
        }
      }
    }
    return withPromotion(ctx, p, out);
  },
};
