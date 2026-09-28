import { getCard } from '../cards';
import { linePieceGenerators } from './linePieces';
import { kingGenerators, knightGenerators } from './knightKing';
import { pawnGenerators } from './pawn';
import type { Generator } from './registry';

export type { Generator } from './registry';

export const GENERATORS: Record<string, Generator> = {
  ...pawnGenerators,
  ...linePieceGenerators,
  ...knightGenerators,
  ...kingGenerators,
};

export function generatorFor(cardId: string): Generator {
  const g = GENERATORS[getCard(cardId).moveModifierId];
  if (!g) throw new Error(`No generator for ${cardId}`);
  return g;
}
