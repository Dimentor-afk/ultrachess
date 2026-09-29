// What the last action looked like, for the UI: which pieces changed squares
// (so every one of them can be animated, not just the mover) and which
// effects to play where. Effects of hidden actions carry `owner` so only
// that player sees them.

import type { AbilityEvent } from './abilities';
import type { GameEvent } from './apply';
import { CELLS, fileOf, rankOf } from './coords';
import type { Color, Move, Piece, Position, Square } from './types';

export type FxKind =
  | 'capture'
  | 'explode'
  | 'dispel'
  | 'shield'
  | 'immortal'
  | 'quake'
  | 'eclipse'
  | 'mirage'
  | 'hint'
  | 'promote'
  | 'barricade'
  | 'portal'
  | 'levitate';

export interface FxSprite {
  kind: FxKind;
  square: Square;
  /** Only this side sees the effect (hidden abilities). */
  owner?: Color;
}

export interface FxMove {
  from: Square;
  to: Square;
  /** slide = glide across, hop = jump in an arc, warp = vanish and reappear. */
  style: 'slide' | 'hop' | 'warp';
}

export interface MatchFx {
  /** Changes with every action (history length). */
  id: number;
  moves: FxMove[];
  sprites: FxSprite[];
  /** Shake the board (Землетрус). */
  shake: boolean;
}

function squaresById(pos: Position): Map<string, Square> {
  const out = new Map<string, Square>();
  for (let s = 0; s < CELLS; s++) {
    const p = pos.board[s];
    if (p) out.set(p.id, s);
  }
  return out;
}

const adjacent = (a: Square, b: Square) => Math.max(Math.abs(fileOf(a) - fileOf(b)), Math.abs(rankOf(a) - rankOf(b))) <= 1;

function pieceSquare(pos: Position, piece: Piece): Square {
  return pos.board.findIndex((p) => p?.id === piece.id);
}

export function computeFx(
  id: number,
  before: Position,
  after: Position,
  info: { move?: Move; events?: GameEvent[]; ability?: { pieceId: string; events: AbilityEvent[] } },
): MatchFx {
  const was = squaresById(before);
  const now = squaresById(after);
  const quake = info.ability?.events.find((e) => e.type === 'earthquake');
  const moves: FxMove[] = [];
  for (const [pid, from] of was) {
    const to = now.get(pid);
    if (to === undefined || to === from) continue;
    let style: FxMove['style'] = 'slide';
    if (quake) style = adjacent(from, to) ? 'hop' : 'warp';
    else if (info.move && pid === info.move.pieceId && (info.move.kind === 'teleport' || /портал/i.test(info.move.label))) style = 'warp';
    else if (info.events?.some((e) => e.type === 'immortal' && e.piece.id === pid)) style = 'warp';
    moves.push({ from, to, style });
  }

  const sprites: FxSprite[] = [];
  let shake = false;
  const m = info.move;
  if (m) {
    const color = before.board[m.from]?.color;
    if (m.promotion && m.to !== null) sprites.push({ kind: 'promote', square: m.to });
    if (m.to === null) sprites.push({ kind: 'explode', square: m.from });
    if (m.levitate && m.to !== null) sprites.push({ kind: 'levitate', square: m.to });
    if (m.to !== null && (m.kind === 'teleport' || /портал/i.test(m.label))) sprites.push({ kind: 'portal', square: m.to });
    if (m.kind === 'mirage' && color) {
      for (const s of m.mirage ?? []) sprites.push({ kind: 'mirage', square: s, owner: color });
    }
  }
  for (const e of info.events ?? []) {
    switch (e.type) {
      case 'captured':
        sprites.push({ kind: 'capture', square: e.square });
        break;
      case 'kamikaze':
      case 'ambush':
        sprites.push({ kind: 'explode', square: e.type === 'ambush' ? e.square : (m?.to ?? m?.target ?? 0) });
        break;
      case 'illusionDispelled':
        sprites.push({ kind: 'dispel', square: e.square });
        break;
      case 'shield':
      case 'fortress':
        sprites.push({ kind: 'shield', square: e.to });
        break;
      case 'riderShield': {
        const s = pieceSquare(after, e.piece);
        if (s >= 0) sprites.push({ kind: 'shield', square: s });
        break;
      }
      case 'immortal':
        sprites.push({ kind: 'immortal', square: e.to });
        break;
      case 'barricade':
        sprites.push({ kind: 'barricade', square: e.square });
        break;
    }
  }
  if (info.ability) {
    const at = before.board.findIndex((p) => p?.id === info.ability!.pieceId);
    for (const e of info.ability.events) {
      if (e.type === 'earthquake') {
        shake = true;
        for (const s of e.squares) sprites.push({ kind: 'quake', square: s });
      } else if (e.type === 'eclipse') {
        for (const s of e.squares) sprites.push({ kind: 'eclipse', square: s });
      } else if (e.type === 'immortal' && at >= 0) {
        sprites.push({ kind: 'shield', square: at, owner: e.color });
      } else if (e.type === 'hint' && at >= 0) {
        sprites.push({ kind: 'hint', square: at, owner: e.color });
      }
    }
  }
  return { id, moves, sprites, shake };
}
