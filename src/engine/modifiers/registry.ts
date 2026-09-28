import type { GenCtx } from '../gen';
import type { Move, Piece, Square } from '../types';

/**
 * Card → move generator (spec §6). Returns pseudo-legal moves; the core
 * filters out moves that leave the own king in check, cross barriers, etc.
 */
export type Generator = (ctx: GenCtx, piece: Piece, from: Square) => Move[];
