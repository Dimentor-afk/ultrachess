// Button abilities of mythological cards (spec §4.3): pressing does not spend
// the turn; afterwards the cooldown counts the owner's turns.

import { BOARD_SQUARES, fileOf, isBoardSquare, opposite, rankOf, sq, squareName } from './coords';
import { legalMoves } from './legal';
import { MIRAGE_COOLDOWN } from './modifiers/knightKing';
import { cleanupIllusions, clonePosition, findPiece } from './position';
import type { Color, Piece, Position, Square } from './types';

export type AbilityId = 'eclipse' | 'earthquake' | 'immortal' | 'hint' | 'mirage';

export interface AbilityDef {
  id: AbilityId;
  name: string;
  cooldown: number;
  /** The opponent must not learn that it was used. */
  hidden: boolean;
  /** Used through a special move instead of a standalone press (Міраж). */
  viaMove: boolean;
}

export const ABILITY_DEFS: Record<string, AbilityDef> = {
  'bishop-eclipse': { id: 'eclipse', name: 'Затемнення', cooldown: 6, hidden: false, viaMove: false },
  'rook-earthquake': { id: 'earthquake', name: 'Землетрус', cooldown: 8, hidden: false, viaMove: false },
  'knight-mirage': { id: 'mirage', name: 'Міраж', cooldown: MIRAGE_COOLDOWN, hidden: true, viaMove: true },
  'queen-immortal': { id: 'immortal', name: 'Безсмертя', cooldown: 8, hidden: true, viaMove: false },
  'king-hint': { id: 'hint', name: 'Підказка', cooldown: 5, hidden: true, viaMove: false },
};

export interface AbilityOption {
  key: string;
  label: string;
  /** Squares to highlight while choosing. */
  squares: Square[];
}

export type AbilityEvent =
  | { type: 'eclipse'; squares: Square[]; color: Color }
  | { type: 'earthquake'; squares: Square[]; color: Color; label: string }
  | { type: 'immortal'; color: Color }
  | { type: 'hint'; color: Color };

export function abilityPieces(pos: Position, color: Color): { square: Square; piece: Piece; def: AbilityDef }[] {
  const out: { square: Square; piece: Piece; def: AbilityDef }[] = [];
  pos.board.forEach((p, s) => {
    if (p && p.color === color && ABILITY_DEFS[p.cardId]) out.push({ square: s, piece: p, def: ABILITY_DEFS[p.cardId] });
  });
  return out;
}

export function abilityReady(pos: Position, pieceId: string): boolean {
  const s = findPiece(pos, pieceId);
  if (s < 0) return false;
  const p = pos.board[s]!;
  const def = ABILITY_DEFS[p.cardId];
  return (
    !!def &&
    !def.viaMove &&
    p.color === pos.turn &&
    !pos.pending.some((pc) => pc.color === pos.turn) &&
    (pos.cooldowns[pieceId] ?? 0) === 0
  );
}

function diagonal(orientation: 1 | -1, c: number): Square[] {
  return BOARD_SQUARES.filter((s) =>
    orientation === 1 ? fileOf(s) - rankOf(s) === c : fileOf(s) + rankOf(s) === c,
  );
}

function lineSquares(kind: 'file' | 'rank', index: number): Square[] {
  const out: Square[] = [];
  for (let i = 0; i < 8; i++) out.push(kind === 'file' ? sq(index, i) : sq(i, index));
  return out;
}

const FILES = 'abcdefgh';

function earthquakeLabel(kind: 'file' | 'rank', index: number, dir: number): string {
  if (kind === 'file') return `Вертикаль ${FILES[index]} ${dir > 0 ? '↑' : '↓'}`;
  return `Горизонталь ${index + 1} ${dir > 0 ? '→' : '←'}`;
}

function shiftLine(pos: Position, squares: Square[], dir: number): Position {
  const next = clonePosition(pos);
  const n = squares.length;
  const old = squares.map((s) => pos.board[s]);
  for (let i = 0; i < n; i++) next.board[squares[(i + dir + n) % n]] = old[i];
  for (const c of ['w', 'b'] as Color[]) {
    const h = next.hiddenState[c];
    next.hiddenState[c] = {
      ...h,
      illusions: h.illusions.map((ill) => {
        const i = squares.indexOf(ill.square);
        return i < 0 ? ill : { ...ill, square: squares[(i + dir + n) % n] };
      }),
    };
  }
  cleanupIllusions(next);
  return next;
}

function earthquakeValid(pos: Position, kind: 'file' | 'rank', squares: Square[], dir: number): boolean {
  if (squares.some((s) => pos.board[s]?.type === 'king')) return false;
  // Shifting an empty line would only waste the cooldown. Illusions count as
  // pieces so that the option list never reveals them.
  const illusions = [...pos.hiddenState.w.illusions, ...pos.hiddenState.b.illusions];
  if (squares.every((s) => !pos.board[s] && !illusions.some((i) => i.square === s))) return false;
  if (kind === 'file') {
    const n = squares.length;
    for (let i = 0; i < n; i++) {
      const p = pos.board[squares[i]];
      if (p?.type !== 'pawn') continue;
      const r = rankOf(squares[(i + dir + n) % n]);
      if (r === 0 || r === 7) return false;
    }
  }
  return legalMoves(shiftLine(pos, squares, dir)).length > 0;
}

export function abilityOptions(pos: Position, pieceId: string): AbilityOption[] {
  if (!abilityReady(pos, pieceId)) return [];
  const s = findPiece(pos, pieceId);
  const p = pos.board[s]!;
  switch (ABILITY_DEFS[p.cardId].id) {
    case 'eclipse': {
      if (!isBoardSquare(s)) return [];
      const out: AbilityOption[] = [];
      for (const orientation of [1, -1] as const) {
        const c = orientation === 1 ? fileOf(s) - rankOf(s) : fileOf(s) + rankOf(s);
        const squares = diagonal(orientation, c);
        if (squares.length < 2) continue;
        out.push({
          key: `diag:${orientation}:${c}`,
          label: `Діагональ ${squareName(squares[0])}–${squareName(squares[squares.length - 1])}`,
          squares,
        });
      }
      return out;
    }
    case 'earthquake': {
      const out: AbilityOption[] = [];
      for (const kind of ['file', 'rank'] as const) {
        for (let index = 0; index < 8; index++) {
          const squares = lineSquares(kind, index);
          for (const dir of [1, -1]) {
            if (!earthquakeValid(pos, kind, squares, dir)) continue;
            out.push({ key: `${kind}:${index}:${dir}`, label: earthquakeLabel(kind, index, dir), squares });
          }
        }
      }
      return out;
    }
    case 'immortal':
      return [{ key: 'arm', label: 'Увімкнути безсмертя на хід суперника', squares: [s] }];
    case 'hint':
      return [{ key: 'show', label: 'Показати найкращий хід', squares: [] }];
    default:
      return [];
  }
}

export function applyAbility(pos: Position, pieceId: string, key: string): { pos: Position; events: AbilityEvent[] } {
  const option = abilityOptions(pos, pieceId).find((o) => o.key === key);
  if (!option) throw new Error(`Ability option ${key} is not available`);
  const p = pos.board[findPiece(pos, pieceId)]!;
  const def = ABILITY_DEFS[p.cardId];
  const color = p.color;
  let next: Position;
  let events: AbilityEvent[];
  switch (def.id) {
    case 'eclipse': {
      const [, o, c] = key.split(':');
      next = clonePosition(pos);
      next.barriers.push({
        orientation: Number(o) as 1 | -1,
        c: Number(c),
        squares: option.squares,
        againstColor: opposite(color),
        ply: pos.ply + 1,
      });
      events = [{ type: 'eclipse', squares: option.squares, color }];
      break;
    }
    case 'earthquake': {
      const dir = Number(key.split(':')[2]);
      next = shiftLine(pos, option.squares, dir);
      events = [{ type: 'earthquake', squares: option.squares, color, label: option.label }];
      break;
    }
    case 'immortal':
      next = clonePosition(pos);
      next.hiddenState[color] = { ...next.hiddenState[color], immortalPly: pos.ply + 1 };
      events = [{ type: 'immortal', color }];
      break;
    case 'hint':
      next = clonePosition(pos);
      events = [{ type: 'hint', color }];
      break;
    default:
      throw new Error(`Ability ${def.id} is used through a move`);
  }
  next.cooldowns[pieceId] = def.cooldown;
  return { pos: next, events };
}

/** Abilities that can create new legal moves for their owner (mate/stalemate test). */
export function movesViaAbilities(pos: Position): boolean {
  for (const { piece, def } of abilityPieces(pos, pos.turn)) {
    if (def.id !== 'earthquake' || !abilityReady(pos, piece.id)) continue;
    if (abilityOptions(pos, piece.id).length > 0) return true;
  }
  return false;
}
