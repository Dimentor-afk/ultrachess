// Pixel-art illustrations for cards (demo set, more to come). Cards without
// art fall back to the vector piece with the card emblem.

const ART: Record<string, number> = {
  'pawn-classic': 145,
  'pawn-stormer': 450,
  'pawn-retreater': 285,
  'pawn-oblique': 339,
  'bishop-classic': 171,
  'bishop-sniper': 412,
  'bishop-piercer': 218,
  'bishop-levitation': 247,
  'rook-classic': 39,
  'rook-sniper': 63,
  'rook-paratrooper': 75,
  'rook-maneuver': 123,
  'rook-ricochet': 197,
  'rook-illusionist': 176,
  'rook-tunnel': 290,
  'rook-kamikaze': 254,
  'rook-castle': 453,
  'rook-fortress': 302,
  'knight-classic': 389,
  'knight-camel': 455,
  'knight-herald': 313,
  'knight-diagonal': 71,
  'knight-illusionist': 165,
  'knight-squire': 377,
  'knight-central': 59,
  'knight-brother': 53,
  'knight-wallrunner': 47,
  'knight-galloper': 334,
  'knight-springboard': 250,
  'knight-berserk': 477,
  'knight-rider': 256,
  'knight-mirage': 465,
  'queen-classic': 371,
  'queen-ricochet': 211,
  'queen-amazon': 235,
  'queen-levitation': 276,
  'queen-immortal': 344,
  'king-classic': 386,
  'king-wanderer': 433,
  'king-swapper': 188,
  'king-barricade': 174,
  'king-hint': 32,
};

export function cardArt(cardId: string): string | null {
  const n = ART[cardId];
  return n === undefined ? null : `assets/pieces/p${n}.png`;
}

export type PackType = 'starter' | 'common' | 'rare' | 'epic' | 'legendary' | 'mythic';

export function packArt(type: PackType): string {
  return `assets/packs/${type}.png`;
}
