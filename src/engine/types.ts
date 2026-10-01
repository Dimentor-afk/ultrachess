// Core data model of the Ultrachess rules engine (see docs/spec.md §3).
// The engine is UI-agnostic: the same code computes the player's moves, the
// bot's search and the king's "Підказка".

export type Color = 'w' | 'b';
export type PieceType = 'pawn' | 'knight' | 'bishop' | 'rook' | 'queen' | 'king';
export type Rarity = 'common' | 'rare' | 'epic' | 'legendary' | 'mythological';

/** Effect types from spec §4.3 (plus "cooldown" for Levitation-style moves). */
export type EffectType = 'permanent' | 'once' | 'button' | 'auto' | 'cooldown';

export interface Card {
  id: string;
  name: string;
  pieceType: PieceType;
  rarity: Rarity;
  rulesText: string;
  /** Key of the move generator in the engine (`modifiers/index.ts`). */
  moveModifierId: string;
  effects: EffectType[];
  /** Never in packs or bot decks: the reward of this trial only. */
  trialOnly?: string;
}

/**
 * Squares live on a 10×10 grid: the 8×8 board plus a one-square ring around
 * it. The ring only ever holds Levitation platforms. Index = (rank+1)*10 + (file+1).
 */
export type Square = number;

export interface Piece {
  id: string;
  color: Color;
  type: PieceType;
  cardId: string;
  /** Own moves made by this piece ("first move" effects, castling). */
  moveCount: number;
  /** Initial square (castling, Безсмертна's respawn). */
  homeSquare: Square;
}

/** Hidden copy left by Illusionists and Міраж (spec §4.6). */
export interface Illusion {
  id: string;
  sourceId: string;
  color: Color;
  type: PieceType;
  cardId: string;
  square: Square;
  /** Removed at the end of this ply (3 opponent turns after creation). */
  expiresAfterPly: number;
}

export interface HiddenState {
  illusions: Illusion[];
  /** Ply during which Безсмертна's shield is active (the opponent's next ply). */
  immortalPly: number | null;
  /** Last "Підказка" result, shown only to its owner. */
  hint: Move | null;
}

export interface Platform {
  square: Square;
  pieceId: string;
  /** The piece dies at the end of this ply if it is still on the platform. */
  expiresAfterPly: number;
  /** A piece that took the platform by capture goes back here instead of falling. */
  returnTo?: Square;
}

/** Затемнювач's barrier: a diagonal the opponent may not cross during one ply. */
export interface Barrier {
  /** +1: squares with file-rank = c; -1: squares with file+rank = c. */
  orientation: 1 | -1;
  c: number;
  squares: Square[];
  againstColor: Color;
  ply: number;
}

/** Вершник was captured: its owner picks where the knight jumps to. */
export interface PendingChoice {
  kind: 'riderLanding';
  color: Color;
  piece: Piece;
  origin: Square;
  options: Square[];
}

export interface Displacement {
  from: Square;
  to: Square;
}

/** One stretch of a move's animation. */
export interface Leg {
  to: Square;
  /** slide = glide across, hop = jump in an arc, warp = vanish and reappear. */
  style: 'slide' | 'hop' | 'warp';
  /** The player picks this square first and then decides whether to go on. */
  stop?: boolean;
}

export interface Move {
  pieceId: string;
  from: Square;
  /** Square the player clicks to pick this move. */
  target: Square;
  /** Final square of the moving piece; null when it dies (Проколювач). */
  to: Square | null;
  kind: string;
  /** Short Ukrainian description used when several moves share a target. */
  label: string;
  /** Squares traversed after `from`, landing/attacked square included. */
  path: Square[];
  /** Squares whose occupants are captured, in order. */
  captures: Square[];
  /** First enemy-occupied square the move interacts with (illusion check). */
  touch?: Square;
  /** Landing square of the mover for each capture (multi-capture chains). */
  steps?: Square[];
  /**
   * How the mover travels, stretch by stretch (jump to the edge, then run).
   * Omitted for a single stretch; see `moveLegs`.
   */
  legs?: Leg[];
  /** Other pieces relocated by this move (castling rook, pushes, swaps). */
  displaced?: Displacement[];
  promotion?: PieceType;
  once?: boolean;
  cooldown?: number;
  /** The mover skips this many of its own next turns. */
  skip?: number;
  noPromote?: boolean;
  mount?: boolean;
  levitate?: boolean;
  mirage?: Square[];
  swap?: boolean;
  loseCastling?: boolean;
}

export interface Position {
  /** 100 cells (10×10 grid). Ring cells hold only pieces on platforms. */
  board: (Piece | null)[];
  turn: Color;
  /** Half-moves made so far. White moves on even plies. */
  ply: number;
  /** Own turns until an ability is ready again (0 = ready). */
  cooldowns: Record<string, number>;
  /** Whether a once-per-game ability was spent. */
  onceUsed: Record<string, boolean>;
  /** The piece may not move or capture on plies <= this value. */
  frozenUntil: Record<string, number>;
  /** Фантом used its jump: it will never promote. */
  noPromote: Record<string, boolean>;
  /** Ротатор's last move was a swap. */
  lastWasSwap: Record<string, boolean>;
  /** Обмінник lost castling rights. */
  castlingLost: Record<string, boolean>;
  /** Вершник knight id -> pawn riding it. */
  passengers: Record<string, Piece>;
  platforms: Platform[];
  barriers: Barrier[];
  hiddenState: Record<Color, HiddenState>;
  pending: PendingChoice[];
  halfmoveClock: number;
  nextId: number;
}

export type Status = 'playing' | 'check' | 'checkmate' | 'stalemate' | 'draw';

export interface Deck {
  id: string;
  name: string;
  pawnVersions: string[];
  pawnFormation: string;
  rook1: string;
  rook2: string;
  bishop1: string;
  bishop2: string;
  knight1: string;
  knight2: string;
  queen: string;
  king: string;
}
