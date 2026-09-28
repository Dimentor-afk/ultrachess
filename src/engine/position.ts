import { CELLS, colorAtPly, homeRank, pawnStartRank, sq } from './coords';
import { getCard } from './cards';
import type { Color, Deck, HiddenState, Illusion, Piece, PieceType, Position, Square } from './types';

export function emptyHidden(): HiddenState {
  return { illusions: [], immortalPly: null, hint: null };
}

export function emptyPosition(): Position {
  return {
    board: new Array(CELLS).fill(null),
    turn: 'w',
    ply: 0,
    cooldowns: {},
    onceUsed: {},
    frozenUntil: {},
    noPromote: {},
    lastWasSwap: {},
    castlingLost: {},
    passengers: {},
    platforms: [],
    barriers: [],
    hiddenState: { w: emptyHidden(), b: emptyHidden() },
    pending: [],
    halfmoveClock: 0,
    nextId: 1,
  };
}

/** Shallow structural copy: pieces are immutable objects and can be shared. */
export function clonePosition(p: Position): Position {
  return {
    board: p.board.slice(),
    turn: p.turn,
    ply: p.ply,
    cooldowns: { ...p.cooldowns },
    onceUsed: { ...p.onceUsed },
    frozenUntil: { ...p.frozenUntil },
    noPromote: { ...p.noPromote },
    lastWasSwap: { ...p.lastWasSwap },
    castlingLost: { ...p.castlingLost },
    passengers: { ...p.passengers },
    platforms: p.platforms.slice(),
    barriers: p.barriers.slice(),
    hiddenState: {
      w: { ...p.hiddenState.w, illusions: p.hiddenState.w.illusions.slice() },
      b: { ...p.hiddenState.b, illusions: p.hiddenState.b.illusions.slice() },
    },
    pending: p.pending.slice(),
    halfmoveClock: p.halfmoveClock,
    nextId: p.nextId,
  };
}

const BACK_RANK: (keyof Deck)[] = ['rook1', 'knight1', 'bishop1', 'queen', 'king', 'bishop2', 'knight2', 'rook2'];
const BACK_TYPES: PieceType[] = ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook'];

/** Starting position from two decks (spec §2.2). */
export function setupPosition(white: Deck, black: Deck): Position {
  const pos = emptyPosition();
  for (const [color, deck] of [['w', white], ['b', black]] as [Color, Deck][]) {
    const back = homeRank(color);
    BACK_RANK.forEach((slot, file) => {
      const cardId = deck[slot] as string;
      const type = BACK_TYPES[file];
      if (getCard(cardId).pieceType !== type) throw new Error(`Card ${cardId} is not a ${type}`);
      const s = sq(file, back);
      pos.board[s] = { id: `${color}-${slot}`, color, type, cardId, moveCount: 0, homeSquare: s };
    });
    const pr = pawnStartRank(color);
    for (let file = 0; file < 8; file++) {
      const version = deck.pawnVersions.length === 2 && deck.pawnFormation[file] === '2' ? 1 : 0;
      const s = sq(file, pr);
      pos.board[s] = {
        id: `${color}-p${'abcdefgh'[file]}`,
        color,
        type: 'pawn',
        cardId: deck.pawnVersions[version],
        moveCount: 0,
        homeSquare: s,
      };
    }
  }
  return pos;
}

export function findPiece(pos: Position, id: string): Square {
  for (let s = 0; s < CELLS; s++) if (pos.board[s]?.id === id) return s;
  return -1;
}

export function findKing(pos: Position, color: Color): Square {
  for (let s = 0; s < CELLS; s++) {
    const p = pos.board[s];
    if (p && p.type === 'king' && p.color === color) return s;
  }
  return -1;
}

export function piecesOf(pos: Position, color: Color): [Square, Piece][] {
  const out: [Square, Piece][] = [];
  for (let s = 0; s < CELLS; s++) {
    const p = pos.board[s];
    if (p && p.color === color) out.push([s, p]);
  }
  return out;
}

export function isFrozen(pos: Position, id: string, ply: number): boolean {
  const until = pos.frozenUntil[id];
  return until !== undefined && until >= ply;
}

/** Freeze a piece for its owner's next `turns` turns, counted from `ply`. */
export function freezeOwnTurns(pos: Position, piece: Piece, turns: number, ply: number): void {
  if (turns <= 0) return;
  const ownNow = colorAtPly(ply) === piece.color;
  const until = ply + (ownNow ? 2 * turns : 2 * turns - 1);
  pos.frozenUntil[piece.id] = Math.max(pos.frozenUntil[piece.id] ?? -1, until);
}

export function illusionAt(pos: Position, color: Color, s: Square): Illusion | undefined {
  return pos.hiddenState[color].illusions.find((i) => i.square === s);
}

export function removeIllusionsOf(pos: Position, sourceId: string): void {
  for (const c of ['w', 'b'] as Color[]) {
    const list = pos.hiddenState[c].illusions;
    if (list.some((i) => i.sourceId === sourceId)) {
      pos.hiddenState[c] = { ...pos.hiddenState[c], illusions: list.filter((i) => i.sourceId !== sourceId) };
    }
  }
}

export function removeIllusionAt(pos: Position, color: Color, s: Square): void {
  const list = pos.hiddenState[color].illusions;
  pos.hiddenState[color] = { ...pos.hiddenState[color], illusions: list.filter((i) => i.square !== s) };
}

/** Drop illusions that share a square with a real piece. */
export function cleanupIllusions(pos: Position): void {
  for (const c of ['w', 'b'] as Color[]) {
    const list = pos.hiddenState[c].illusions;
    if (list.some((i) => pos.board[i.square] !== null)) {
      pos.hiddenState[c] = { ...pos.hiddenState[c], illusions: list.filter((i) => pos.board[i.square] === null) };
    }
  }
}

export function newId(pos: Position, prefix: string): string {
  return `${prefix}${pos.nextId++}`;
}

/** Remove a piece from the game entirely (platforms, illusions, passenger). */
export function killPieceAt(pos: Position, s: Square): Piece | null {
  const p = pos.board[s];
  if (!p) return null;
  pos.board[s] = null;
  forgetPiece(pos, p);
  return p;
}

export function forgetPiece(pos: Position, p: Piece): void {
  pos.platforms = pos.platforms.filter((pl) => pl.pieceId !== p.id);
  removeIllusionsOf(pos, p.id);
  if (pos.passengers[p.id]) delete pos.passengers[p.id];
}
