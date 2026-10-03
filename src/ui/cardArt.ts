// Pixel-art pieces for every card. Each card has a light sprite (white side
// and the card illustration) and, when the art set has one, a matching dark
// sprite for the black side. Cards without a dark sprite are tinted on the
// board instead.

type Art = [white: number, black?: number];

const ART: Record<string, Art> = {
  // Pawns
  'pawn-classic': [390, 384],
  'pawn-stormer': [72, 84],
  'pawn-retreater': [342, 349],
  'pawn-oblique': [314, 321],
  'pawn-ram': [227],
  'pawn-diagonal': [159, 166],
  'pawn-sprinter': [233],
  'pawn-stubborn': [245],
  'pawn-marathoner': [221],
  'pawn-phantom': [173, 180],
  'pawn-spearman': [201, 209],
  'pawn-ambusher': [239],
  'pawn-shieldbearer': [145, 152],
  'pawn-duelist': [187, 194],
  // Bishops
  'bishop-classic': [388, 382],
  'bishop-sentinel': [70, 82],
  'bishop-sniper': [184, 190],
  'bishop-paratrooper': [230],
  'bishop-jumper': [312, 319],
  'bishop-martyr': [273],
  'bishop-ricochet': [157, 164],
  'bishop-illusionist': [171, 178],
  'bishop-piercer': [199, 206],
  'bishop-chain': [297],
  'bishop-chameleon': [236],
  'bishop-flanker': [340, 347],
  'bishop-levitation': [278],
  'bishop-portal': [156, 163],
  'bishop-eclipse': [142, 149],
  // Rooks
  'rook-classic': [387, 381],
  'rook-sniper': [310, 317],
  'rook-paratrooper': [232],
  'rook-maneuver': [69, 81],
  'rook-jumper': [141, 148],
  'rook-ricochet': [155, 162],
  'rook-illusionist': [169, 176],
  'rook-tunnel': [260],
  'rook-corner': [183, 191],
  'rook-battering': [302],
  'rook-displacer': [214],
  'rook-kamikaze': [220],
  'rook-castle': [266],
  'rook-fortress': [244],
  'rook-earthquake': [226],
  // Knights
  'knight-classic': [389, 383],
  'knight-camel': [268],
  'knight-herald': [313, 320],
  'knight-diagonal': [71, 83],
  'knight-illusionist': [172, 179],
  'knight-squire': [186, 193],
  'knight-central': [144, 151],
  'knight-brother': [341, 348],
  'knight-wallrunner': [243],
  'knight-galloper': [219],
  'knight-springboard': [231],
  'knight-rotator': [158, 165],
  'knight-berserk': [327],
  'knight-rider': [237],
  'knight-mirage': [280],
  // Queens
  'queen-classic': [386, 380],
  'queen-ricochet': [154, 161],
  'queen-amazon': [182, 189],
  'queen-levitation': [270],
  'queen-immortal': [216],
  // Kings
  'king-classic': [385, 379],
  'king-wanderer': [308, 315],
  'king-swapper': [139, 146],
  'king-barricade': [240],
  'king-hint': [234],
  'king-comet': [474],
};

const src = (n: number) => `assets/pieces/p${n}.png`;

/** Card illustration (the light sprite). */
export function cardArt(cardId: string): string | null {
  const a = ART[cardId];
  return a ? src(a[0]) : null;
}

/**
 * Sprite for a piece on the board. Cards without a dark sprite in the art set
 * use a generated "obsidian" recolour (p{N}d.png), which keeps the texture.
 */
export function pieceSprite(
  cardId: string,
  type: string,
  color: 'w' | 'b',
  style: 'team' | 'dark' = 'team',
): { src: string; tint: boolean } {
  const a = ART[cardId] ?? ART[`${type}-classic`];
  // "team" style: both sides show the full-colour sprite; the side is marked by colour.
  if (color === 'w' || style === 'team') return { src: src(a[0]), tint: false };
  return { src: a[1] !== undefined ? src(a[1]) : `assets/pieces/p${a[0]}d.png`, tint: false };
}

/** Light sprites that need a generated dark version. */
export function singleSprites(): number[] {
  return Object.values(ART)
    .filter((a) => a[1] === undefined)
    .map((a) => a[0]);
}

/** Every sprite file the art table uses (for asset checks). */
export function allSprites(): number[] {
  return Object.values(ART).flatMap((a) => a.filter((n): n is number => n !== undefined));
}

export type PackType = 'starter' | 'common' | 'rare' | 'epic' | 'legendary' | 'mythic';

export function packArt(type: PackType): string {
  return `assets/packs/${type}.png`;
}
