// What the last action looked like, for the UI: which pieces changed squares
// (so every one of them can be animated, not just the mover) and which
// effects to play where. Effects of hidden actions carry `owner` so only
// that player sees them.

import type { AbilityEvent } from './abilities';
import type { GameEvent } from './apply';
import { CELLS, fileOf, rankOf } from './coords';
import type { Color, Leg, Move, Piece, PieceType, Position, Square } from './types';

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
  | 'levitate'
  | 'dust'
  | 'sparkle'
  | 'absorb'
  | 'revive'
  | 'impact'
  | 'twinkle'
  | 'puff'
  | 'fall';

export interface FxSprite {
  kind: FxKind;
  square: Square;
  /** Only this side sees the effect (hidden abilities). */
  owner?: Color;
  /** Side that made the capture (the capturer's chosen effect plays). */
  by?: Color;
  /** Plays when the mover finishes this leg of its move (chained captures). */
  leg?: number;
  /** Plays this many ms after the mover has arrived (a scene that follows the blow). */
  wait?: number;
  /** The captured piece, drawn until the blow lands. */
  victim?: { type: PieceType; color: Color; cardId: string };
}

export interface FxMove {
  from: Square;
  to: Square;
  /** How the piece travels, stretch by stretch; the last leg ends on `to`. */
  legs: Leg[];
  /** Starts once the main mover has arrived (a pushed piece). */
  after?: boolean;
}

/** A move's legs, with the default single stretch filled in. */
export function moveLegs(m: Move, type: PieceType | undefined): Leg[] {
  if (m.legs?.length) return m.legs;
  const to = m.to ?? m.target;
  if (m.kind === 'teleport' || /портал/i.test(m.label)) return [{ to, style: 'warp' }];
  // A swap: both pieces jump over each other.
  return [{ to, style: type === 'knight' || m.kind === 'swap' ? 'hop' : 'slide' }];
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
  const m0 = info.move;
  const moverLegs = m0 ? moveLegs(m0, before.board[m0.from]?.type) : [];
  const pushed = new Set((m0?.displaced ?? []).map((d) => d.to));
  for (const [pid, from] of was) {
    const to = now.get(pid);
    // Дуеліст strikes and comes back: same square, but it did travel.
    const roundTrip = to === from && m0?.pieceId === pid && moverLegs.length > 1;
    if (to === undefined || (to === from && !roundTrip)) continue;
    let style: Leg['style'] = 'slide';
    if (quake) style = adjacent(from, to) ? 'hop' : 'warp';
    else if (m0 && pid === m0.pieceId) {
      // The mover follows its legs; the last one lands where it really ended
      // (Щитоносець, platforms and the like can change that).
      const legs = moverLegs.map((l, i) => (i === moverLegs.length - 1 ? { ...l, to } : l));
      moves.unshift({ from, to, legs });
      continue;
    } else if (info.events?.some((e) => e.type === 'immortal' && e.piece.id === pid)) {
      // Безсмертна: struck, she rises from her square as light and comes back on her own.
      moves.push({ from, to, legs: [{ to, style: 'rise' }], after: true });
      continue;
    }
    // The other piece of a swap jumps too, crossing the mover in the air.
    if (m0?.kind === 'swap' && pushed.has(to)) style = 'hop';
    moves.push({ from, to, legs: [{ to, style }], after: m0?.kind === 'push' && pushed.has(to) ? true : undefined });
  }

  const sprites: FxSprite[] = [];
  let shake = false;
  const m = info.move;
  if (m) {
    const color = before.board[m.from]?.color;
    if (m.promotion && m.to !== null) sprites.push({ kind: 'promote', square: m.to });
    if (m.to === null) sprites.push({ kind: 'explode', square: m.from });
    if (m.levitate && m.to !== null) sprites.push({ kind: 'levitate', square: m.to });
    if (m.to !== null && (m.kind === 'teleport' || /портал/i.test(m.label))) {
      // A gate where the piece leaves the board and one where it comes back,
      // each opening as the piece reaches it; a plain teleport has one, at the end.
      const w = moverLegs.findIndex((l) => l.style === 'warp');
      if (w > 0) sprites.push({ kind: 'portal', square: moverLegs[w - 1].to, leg: w - 1 }, { kind: 'portal', square: moverLegs[w].to, leg: w });
      else sprites.push({ kind: 'portal', square: m.to });
    }
    if (m.kind === 'dash' && m.to !== null) {
      sprites.push({ kind: 'dust', square: m.from }, { kind: 'sparkle', square: m.to });
    }
    // Вершник picks up its own pawn: a sparkle as it lands on it.
    if (m.kind === 'mount' && m.to !== null) sprites.push({ kind: 'twinkle', square: m.to, wait: -40 });
    if (m.kind === 'swap' && m.to !== null) {
      sprites.push({ kind: 'twinkle', square: m.from }, { kind: 'twinkle', square: m.to });
    }
    if (m.kind === 'push') {
      // The blow where the pusher meets the pushed piece.
      for (const d of m.displaced ?? []) sprites.push({ kind: 'impact', square: d.from, wait: -60 });
    }
    // An illusionist leaves a hidden copy behind: a puff of mist only its owner sees.
    if (color && m.kind !== 'mirage') {
      const had = new Set(before.hiddenState[color].illusions.map((x) => x.id));
      for (const x of after.hiddenState[color].illusions) if (!had.has(x.id)) sprites.push({ kind: 'mirage', square: x.square, owner: color });
    }
    if (m.kind === 'mirage' && color) {
      for (const s of m.mirage ?? []) sprites.push({ kind: 'mirage', square: s, owner: color });
    }
  }
  for (const e of info.events ?? []) {
    switch (e.type) {
      case 'captured': {
        // In a chain the effect plays when the mover reaches that square.
        const i = moverLegs.findIndex((l) => l.to === e.square);
        sprites.push({
          kind: 'capture',
          square: e.square,
          by: e.piece.color === 'w' ? 'b' : 'w',
          leg: i >= 0 ? i : Math.max(0, moverLegs.length - 1),
          victim: { type: e.piece.type, color: e.piece.color, cardId: e.piece.cardId },
        });
        break;
      }
      case 'martyr': {
        // Мученик: whoever took it is frozen where it stands.
        const s = now.get(e.attackerId);
        if (s !== undefined) sprites.push({ kind: 'twinkle', square: s, wait: 120 });
        break;
      }
      case 'riderLanding':
        // The passenger jumps off: a puff of dust where it lands.
        sprites.push({ kind: 'puff', square: e.to, wait: 0 });
        break;
      case 'fell': {
        // The platform is gone: the piece drops off the board in a puff of dust.
        const s = was.get(e.piece.id);
        if (s !== undefined) sprites.push({ kind: 'fall', square: s, victim: { type: e.piece.type, color: e.piece.color, cardId: e.piece.cardId } }, { kind: 'puff', square: s });
        break;
      }
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
      case 'immortal': {
        // The blow lands, the soul gathers on her starting square, light, and she is back.
        sprites.push({ kind: 'absorb', square: e.to, wait: 150 }, { kind: 'revive', square: e.to, wait: 470 }, { kind: 'immortal', square: e.to, wait: 540 });
        break;
      }
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
