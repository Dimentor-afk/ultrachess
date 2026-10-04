// Pixel effect sprite strips in public/assets/fx (frames side by side).
// Effects: Super Pixel Effects Gigapack (Will Tice / unTied Games) and
// Pixel Magic Effects (lordfitoi / Foozle, CC0).

export type FxName =
  | 'capture'
  | 'explode'
  | 'dispel'
  | 'shield'
  | 'immortal'
  | 'quake'
  | 'dust'
  | 'eclipse'
  | 'mirage'
  | 'hint'
  | 'promote'
  | 'barricade'
  | 'portal'
  | 'levitate'
  | 'check'
  | 'win'
  | 'burst'
  | 'sparkle'
  | 'absorb'
  | 'boom'
  | 'impact'
  | 'twinkle'
  | 'puff'
  | 'revive'
  | 'cap_blast'
  | 'cap_plasma'
  | 'cap_lightning'
  | 'cap_skull'
  | 'cap_hearts'
  | 'cap_coins'
  | 'cap_geyser'
  | 'cap_spear'
  | 'cap_epic';

export interface FxSpec {
  w: number;
  h: number;
  /** Frames in the strip. */
  n: number;
  /** Play time in ms. */
  ms: number;
  /** Width in board squares. */
  size: number;
  /** Vertical offset in squares (negative = up). */
  dy?: number;
}

export const FX: Record<FxName, FxSpec> = {
  capture: { w: 48, h: 48, n: 7, ms: 420, size: 1.5 },
  explode: { w: 64, h: 64, n: 7, ms: 620, size: 2 },
  dispel: { w: 32, h: 32, n: 14, ms: 700, size: 1.4 },
  shield: { w: 64, h: 64, n: 18, ms: 1100, size: 1.5 },
  immortal: { w: 64, h: 64, n: 16, ms: 1000, size: 1.8 },
  quake: { w: 64, h: 64, n: 9, ms: 700, size: 1.3, dy: -0.15 },
  dust: { w: 32, h: 32, n: 10, ms: 650, size: 1.4, dy: 0.2 },
  eclipse: { w: 32, h: 32, n: 8, ms: 600, size: 1.5 },
  mirage: { w: 64, h: 64, n: 12, ms: 800, size: 1.4, dy: -0.2 },
  hint: { w: 48, h: 48, n: 12, ms: 900, size: 1, dy: -0.7 },
  promote: { w: 32, h: 24, n: 20, ms: 1000, size: 0.9, dy: -0.6 },
  barricade: { w: 64, h: 64, n: 10, ms: 800, size: 1.6 },
  portal: { w: 64, h: 64, n: 16, ms: 1100, size: 1.6 },
  levitate: { w: 64, h: 64, n: 9, ms: 800, size: 1.3, dy: -0.2 },
  check: { w: 40, h: 40, n: 14, ms: 900, size: 0.8, dy: -0.75 },
  win: { w: 48, h: 48, n: 27, ms: 1400, size: 2.2 },
  burst: { w: 128, h: 72, n: 9, ms: 600, size: 4 },
  sparkle: { w: 48, h: 48, n: 24, ms: 1600, size: 2.4 },
  absorb: { w: 64, h: 64, n: 31, ms: 640, size: 2.4 },
  boom: { w: 64, h: 64, n: 13, ms: 1100, size: 2.8, dy: -0.45 },
  impact: { w: 48, h: 48, n: 7, ms: 420, size: 1.6 },
  twinkle: { w: 32, h: 32, n: 14, ms: 800, size: 1.5 },
  puff: { w: 32, h: 32, n: 10, ms: 700, size: 1.7, dy: 0.15 },
  revive: { w: 128, h: 72, n: 9, ms: 620, size: 2.6, dy: 0.2 },
  // Capture effects from the shop.
  cap_blast: { w: 48, h: 48, n: 10, ms: 600, size: 1.7 },
  cap_plasma: { w: 48, h: 48, n: 10, ms: 600, size: 1.7 },
  cap_lightning: { w: 64, h: 64, n: 7, ms: 520, size: 1.6, dy: -0.3 },
  cap_skull: { w: 32, h: 32, n: 12, ms: 850, size: 1.3, dy: -0.1 },
  cap_hearts: { w: 64, h: 64, n: 23, ms: 1100, size: 1.6 },
  cap_coins: { w: 64, h: 64, n: 31, ms: 1300, size: 1.7, dy: -0.1 },
  cap_geyser: { w: 64, h: 64, n: 13, ms: 900, size: 1.5, dy: -0.4 },
  cap_spear: { w: 64, h: 64, n: 12, ms: 850, size: 1.5, dy: -0.4 },
  cap_epic: { w: 96, h: 96, n: 15, ms: 1000, size: 2.5, dy: -0.2 },
};
