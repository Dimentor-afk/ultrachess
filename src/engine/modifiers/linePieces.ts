import { ALL_DIRS, DIAG, KNIGHT_LEAPS, ORTHO } from '../coords';
import { dedupe, leapMoves, slideMoves } from '../gen';
import {
  batteringMoves,
  castleTeleportMoves,
  chameleonMoves,
  displaceMoves,
  flankMoves,
  jumpOverMoves,
  levitateMoves,
  pierceMoves,
  portalMoves,
  ricochetMoves,
  turnMoves,
} from './lines';
import type { Generator } from './registry';

const bishop: Generator = (ctx, p, from) => slideMoves(ctx, p, from, DIAG);
const rook: Generator = (ctx, p, from) => slideMoves(ctx, p, from, ORTHO);
const queen: Generator = (ctx, p, from) => slideMoves(ctx, p, from, ALL_DIRS);

export const linePieceGenerators: Record<string, Generator> = {
  // ── Слони ──
  'bishop-classic': bishop,
  'bishop-sentinel': (ctx, p, from) => slideMoves(ctx, p, from, ALL_DIRS, { max: 2 }),
  'bishop-sniper': (ctx, p, from) => slideMoves(ctx, p, from, DIAG, { minCapture: 2, afterStep: true }),
  'bishop-paratrooper': (ctx, p, from) => [
    ...bishop(ctx, p, from),
    ...(p.moveCount === 0 ? jumpOverMoves(ctx, p, from, DIAG, { skip: 1, label: 'Десант через фігуру' }) : []),
  ],
  // Стрибун jumps with a run-up: at least one empty square before the piece. So the pawns
  // right in front of it at the start stop it (jumping them is the paratrooper's trick).
  'bishop-jumper': (ctx, p, from) => [...bishop(ctx, p, from), ...jumpOverMoves(ctx, p, from, DIAG, {}, 1)],
  'bishop-martyr': bishop,
  'bishop-ricochet': (ctx, p, from) => dedupe([...bishop(ctx, p, from), ...ricochetMoves(ctx, p, from, DIAG)]),
  'bishop-illusionist': bishop,
  'bishop-piercer': (ctx, p, from) => [...bishop(ctx, p, from), ...pierceMoves(ctx, p, from, DIAG)],
  'bishop-chain': (ctx, p, from) => dedupe([...bishop(ctx, p, from), ...turnMoves(ctx, p, from, DIAG)]),
  'bishop-chameleon': (ctx, p, from) => [...bishop(ctx, p, from), ...chameleonMoves(ctx, p, from, ORTHO)],
  'bishop-flanker': (ctx, p, from) => dedupe([...bishop(ctx, p, from), ...flankMoves(ctx, p, from)]),
  'bishop-levitation': (ctx, p, from) => [...bishop(ctx, p, from), ...levitateMoves(ctx, p, from, DIAG)],
  'bishop-portal': (ctx, p, from) => [...bishop(ctx, p, from), ...portalMoves(ctx, p, from, DIAG)],
  'bishop-eclipse': bishop,

  // ── Тури ──
  'rook-classic': rook,
  'rook-sniper': (ctx, p, from) => slideMoves(ctx, p, from, ORTHO, { minCapture: 2, afterStep: true }),
  'rook-paratrooper': (ctx, p, from) => [
    ...rook(ctx, p, from),
    ...(p.moveCount === 0 ? jumpOverMoves(ctx, p, from, ORTHO, { skip: 1, label: 'Десант через фігуру' }) : []),
  ],
  'rook-maneuver': (ctx, p, from) => slideMoves(ctx, p, from, ALL_DIRS, { max: 4 }),
  'rook-jumper': (ctx, p, from) => [...rook(ctx, p, from), ...jumpOverMoves(ctx, p, from, ORTHO, {}, 1)],
  'rook-ricochet': (ctx, p, from) => dedupe([...rook(ctx, p, from), ...ricochetMoves(ctx, p, from, ORTHO)]),
  'rook-illusionist': rook,
  'rook-tunnel': (ctx, p, from) => slideMoves(ctx, p, from, ORTHO, { passOwn: () => true }),
  'rook-corner': (ctx, p, from) => dedupe([...rook(ctx, p, from), ...turnMoves(ctx, p, from, ORTHO)]),
  'rook-battering': (ctx, p, from) => [...rook(ctx, p, from), ...batteringMoves(ctx, p, from, ORTHO)],
  'rook-displacer': (ctx, p, from) => [...rook(ctx, p, from), ...displaceMoves(ctx, p, from, ORTHO)],
  'rook-kamikaze': rook,
  'rook-castle': (ctx, p, from) => [...rook(ctx, p, from), ...castleTeleportMoves(ctx, p, from)],
  'rook-fortress': rook,
  'rook-earthquake': rook,

  // ── Ферзі ──
  'queen-classic': queen,
  'queen-ricochet': (ctx, p, from) => dedupe([...queen(ctx, p, from), ...ricochetMoves(ctx, p, from, ALL_DIRS)]),
  'queen-amazon': (ctx, p, from) => [
    ...slideMoves(ctx, p, from, ALL_DIRS, { max: 5 }),
    ...leapMoves(ctx, p, from, KNIGHT_LEAPS),
  ],
  'queen-levitation': (ctx, p, from) => [...queen(ctx, p, from), ...levitateMoves(ctx, p, from, ALL_DIRS)],
  'queen-immortal': queen,
};
