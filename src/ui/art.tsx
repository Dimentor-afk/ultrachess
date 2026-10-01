// Hand-drawn SVG piece set and per-card emblems. Every card gets a small
// emblem that hints at its mechanic, so variants are told apart at a glance.

import type { Color, PieceType } from '../engine/types';

// Classic piece silhouettes after Colin M.L. Burnett's set (BSD licence),
// the same family chess sites use. Each shape is a filled body, an outline
// that stays dark, or a detail line that contrasts with the body colour.
type Shape = { d: string; kind: 'body' | 'outline' | 'detail' | 'dot'; cap?: 'butt' };

const PIECES: Record<PieceType, Shape[]> = {
  pawn: [
    {
      kind: 'body',
      d: 'M22.5 9c-2.21 0-4 1.79-4 4 0 .89.29 1.71.78 2.38C17.33 16.5 16 18.59 16 21c0 2.03.94 3.84 2.41 5.03C15.41 27.09 11 31.58 11 39.5h23c0-7.92-4.41-12.41-7.41-13.47C28.06 24.84 29 23.03 29 21c0-2.41-1.33-4.5-3.28-5.62.49-.67.78-1.49.78-2.38 0-2.21-1.79-4-4-4z',
    },
  ],
  rook: [
    { kind: 'body', cap: 'butt', d: 'M9 39h27v-3H9zM12 36v-4h21v4zM11 14V9h4v2h5V9h5v2h5V9h4v5' },
    { kind: 'body', d: 'M34 14l-3 3H14l-3-3' },
    { kind: 'body', cap: 'butt', d: 'M31 17v12.5H14V17' },
    { kind: 'body', d: 'M31 29.5l1.5 2.5h-20l1.5-2.5' },
    { kind: 'detail', d: 'M11 14h23' },
  ],
  knight: [
    { kind: 'body', d: 'M22 10c10.5 1 16.5 8 16 29H15c0-9 10-6.5 8-21' },
    {
      kind: 'body',
      d: 'M24 18c.38 2.91-5.55 7.37-8 9-3 2-2.82 4.34-5 4-1.04-.94 1.41-3.04 0-3-1 0 .19 1.23-1 2-1 0-4.003 1-4-4 0-2 6-12 6-12s1.89-1.9 2-3.5c-.73-.994-.5-2-.5-3 1-1 3 2.5 3 2.5h2s.78-1.992 2.5-3c1 0 1 3 1 3',
    },
    { kind: 'dot', d: 'M9.5 25.5a.5.5 0 1 1-1 0 .5.5 0 1 1 1 0z' },
    { kind: 'dot', d: 'M15.2 15.1a.6 1.5 30 1 1-1 .6.6 1.5 30 1 1 1-.6z' },
  ],
  bishop: [
    {
      kind: 'body',
      cap: 'butt',
      d: 'M9 36c3.39-.97 10.11.43 13.5-2 3.39 2.43 10.11 1.03 13.5 2 0 0 1.65.54 3 2-.68.97-1.65.99-3 .5-3.39-.97-10.11.46-13.5-1-3.39 1.46-10.11.03-13.5 1-1.354.49-2.323.47-3-.5 1.354-1.94 3-2 3-2z',
    },
    {
      kind: 'body',
      cap: 'butt',
      d: 'M15 32c2.5 2.5 12.5 2.5 15 0 .5-1.5 0-2 0-2 0-2.5-2.5-4-2.5-4 5.5-1.5 6-11.5-5-15.5-11 4-10.5 14-5 15.5 0 0-2.5 1.5-2.5 4 0 0-.5.5 0 2z',
    },
    { kind: 'body', cap: 'butt', d: 'M25 8a2.5 2.5 0 1 1-5 0 2.5 2.5 0 1 1 5 0z' },
    { kind: 'detail', d: 'M17.5 26h10M15 30h15M22.5 15.5v5M20 18h5' },
  ],
  queen: [
    { kind: 'body', d: 'M9 26c8.5-1.5 21-1.5 27 0l2.5-12.5L31 25l-.3-14.1-5.2 13.6-3-14.5-3 14.5-5.2-13.6L14 25 6.5 13.5 9 26z' },
    {
      kind: 'body',
      d: 'M9 26c0 2 1.5 2 2.5 4 1 1.5 1 1 .5 3.5-1.5 1-1 2.5-1 2.5-1.5 1.5 0 2.5 0 2.5 6.5 1 16.5 1 23 0 0 0 1.5-1 0-2.5 0 0 .5-1.5-1-2.5-.5-2.5-.5-2 .5-3.5 1-2 2.5-2 2.5-4-8.5-1.5-18.5-1.5-27 0z',
    },
    { kind: 'detail', d: 'M11.5 30c3.5-1 18.5-1 22 0M12 33.5c6-1 15-1 21 0' },
    {
      kind: 'body',
      d: 'M8 12a2 2 0 1 1-4 0 2 2 0 1 1 4 0zM16 9a2 2 0 1 1-4 0 2 2 0 1 1 4 0zM24.5 8a2 2 0 1 1-4 0 2 2 0 1 1 4 0zM33 9a2 2 0 1 1-4 0 2 2 0 1 1 4 0zM41 12a2 2 0 1 1-4 0 2 2 0 1 1 4 0z',
    },
  ],
  king: [
    { kind: 'outline', d: 'M22.5 11.63V6M20 8h5' },
    { kind: 'body', cap: 'butt', d: 'M22.5 25s4.5-7.5 3-10.5c0 0-1-2.5-3-2.5s-3 2.5-3 2.5c-1.5 3 3 10.5 3 10.5' },
    {
      kind: 'body',
      d: 'M12.5 37c5.5 3.5 14.5 3.5 20 0v-7s9-4.5 6-10.5c-4-6.5-13.5-3.5-16 4V27v-3.5c-2.5-7.5-12-10.5-16-4-3 6 6 10.5 6 10.5v7',
    },
    { kind: 'detail', d: 'M12.5 30c5.5-3 14.5-3 20 0M12.5 33.5c5.5-3 14.5-3 20 0M12.5 37c5.5-3 14.5-3 20 0' },
  ],
};

export function PieceSvg({ type, color, className = '' }: { type: PieceType; color: Color; className?: string }) {
  return (
    <svg viewBox="0 0 45 45" className={`piece-svg piece-svg-${color} ${className}`} aria-hidden="true">
      {PIECES[type].map((sh, i) => (
        <path key={i} d={sh.d} className={`ps-${sh.kind}`} strokeLinecap={sh.cap} />
      ))}
    </svg>
  );
}

// ── Emblems ──

type EmblemId =
  | 'target' | 'comet' | 'up2' | 'back' | 'diag' | 'ram' | 'swap' | 'ghost' | 'copy' | 'spear' | 'eye'
  | 'shield' | 'swords' | 'wings' | 'portal' | 'bounce' | 'turn' | 'jump' | 'bomb' | 'hourglass'
  | 'teleport' | 'moon' | 'quake' | 'bulb' | 'tunnel' | 'push' | 'three' | 'palette' | 'spring'
  | 'rider' | 'compass' | 'crown' | 'plus' | 'link' | 'rotate' | 'infinity' | 'wall' | 'edge' | 'hit';

const EMBLEM: Record<EmblemId, string> = {
  target: 'M12 4a8 8 0 1 0 .01 0M12 9a3 3 0 1 0 .01 0M12 1v5M12 18v5M1 12h5M18 12h5',
  comet: 'M15 9a3 3 0 1 0 .01 0M13 11L4 20M12 8L5 15M16 12l-7 7',
  up2: 'M6 13l6-6 6 6M6 19l6-6 6 6',
  back: 'M12 4v14M6 12l6 6 6-6',
  diag: 'M6 18L18 6M9 6h9v9',
  ram: 'M3 12h12M11 7l5 5-5 5M20 5v14',
  swap: 'M4 8h15M15 4l4 4-4 4M20 16H5M9 12l-4 4 4 4',
  ghost: 'M6 20V11a6 6 0 0 1 12 0v9l-3-2-3 2-3-2zM10 11h.1M14 11h.1',
  copy: 'M8 8h11v11H8zM5 16V5h11',
  spear: 'M4 20L17 7M13 5h6v6M17 7l2-2',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 .01 0',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  swords: 'M4 4l16 16M20 4L4 20M3 9l6-6M15 21l6-6M21 9l-6-6M9 21l-6-6',
  wings: 'M12 17c-2-6-6-8-10-8 1 4 3 7 10 8zM12 17c2-6 6-8 10-8-1 4-3 7-10 8zM12 17v4',
  portal: 'M12 3c5 0 7 4 7 9s-2 9-7 9-7-4-7-9 2-9 7-9zM12 8c2 0 3 2 3 4s-1 4-3 4-3-2-3-4 1-4 3-4z',
  bounce: 'M3 18l6-12 6 12 6-12M18 6h3v3',
  turn: 'M6 20V8h10M12 4l4 4-4 4',
  jump: 'M3 18c3-12 15-12 18 0M17 15l4 3 1-5',
  bomb: 'M11 8a7 7 0 1 0 .01 0M14 7l3-3M18 2v2M20 4h2',
  hourglass: 'M6 3h12M6 21h12M7 3c0 6 10 6 10 9s-10 3-10 9M17 3c0 6-10 6-10 9s10 3 10 9',
  teleport: 'M12 2l2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5z',
  moon: 'M20 14A8 8 0 1 1 10 4a6.5 6.5 0 0 0 10 10z',
  quake: 'M2 8l4-3 4 3 4-3 4 3 4-3M2 14l4-3 4 3 4-3 4 3 4-3M2 20l4-3 4 3 4-3 4 3 4-3',
  bulb: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.8.8 1 1.5 1 2.5h6c0-1 .2-1.7 1-2.5A6 6 0 0 0 12 3z',
  tunnel: 'M3 21V11a9 9 0 0 1 18 0v10M8 21v-8a4 4 0 0 1 8 0v8',
  push: 'M3 12h8M8 8l4 4-4 4M14 7h7v10h-7z',
  three: 'M6 5h7l-4 5a4 4 0 1 1-3 6M17 8v10',
  palette: 'M12 3a9 9 0 1 0 0 18V3zM12 3a9 9 0 0 1 0 18',
  spring: 'M6 4h12L6 9h12L6 14h12L6 19h12',
  rider: 'M8 7a3 3 0 1 0 .01 0M16 7a3 3 0 1 0 .01 0M3 20c0-4 2.5-6 5-6s5 2 5 6M11 20c0-4 2.5-6 5-6s5 2 5 6',
  compass: 'M12 2v20M2 12h20M5 5l14 14M19 5L5 19',
  crown: 'M3 18l2-11 5 5 2-7 2 7 5-5 2 11z',
  plus: 'M12 3v18M3 12h18M8 7l4-4 4 4M8 17l4 4 4-4',
  link: 'M9 15l6-6M7 11l-2 2a4 4 0 0 0 6 6l2-2M17 13l2-2a4 4 0 0 0-6-6l-2 2',
  rotate: 'M20 11a8 8 0 1 0-2 6M20 5v6h-6',
  infinity: 'M12 12c-2-3-4-4-6-4a4 4 0 0 0 0 8c2 0 4-1 6-4zM12 12c2 3 4 4 6 4a4 4 0 0 0 0-8c-2 0-4 1-6 4z',
  wall: 'M3 5h18v14H3zM3 10h18M3 14h18M9 5v5M15 10v4M9 14v5',
  edge: 'M4 3v18M9 7l4-4 4 4M9 17l4 4 4-4M13 3v18',
  hit: 'M12 21V8M7 12l5-5 5 5M5 3h14',
};

export const CARD_EMBLEM: Record<string, EmblemId> = {
  'pawn-stormer': 'hit',
  'pawn-retreater': 'back',
  'pawn-oblique': 'diag',
  'pawn-ram': 'ram',
  'pawn-diagonal': 'diag',
  'pawn-sprinter': 'up2',
  'pawn-stubborn': 'swap',
  'pawn-marathoner': 'up2',
  'pawn-phantom': 'ghost',
  'pawn-spearman': 'spear',
  'pawn-ambusher': 'eye',
  'pawn-shieldbearer': 'shield',
  'pawn-duelist': 'swords',
  'bishop-sentinel': 'plus',
  'bishop-sniper': 'target',
  'bishop-paratrooper': 'jump',
  'bishop-jumper': 'jump',
  'bishop-martyr': 'hourglass',
  'bishop-ricochet': 'bounce',
  'bishop-illusionist': 'copy',
  'bishop-piercer': 'spear',
  'bishop-chain': 'turn',
  'bishop-chameleon': 'palette',
  'bishop-flanker': 'edge',
  'bishop-levitation': 'wings',
  'bishop-portal': 'portal',
  'bishop-eclipse': 'moon',
  'rook-sniper': 'target',
  'rook-paratrooper': 'jump',
  'rook-maneuver': 'compass',
  'rook-jumper': 'jump',
  'rook-ricochet': 'bounce',
  'rook-illusionist': 'copy',
  'rook-tunnel': 'tunnel',
  'rook-corner': 'turn',
  'rook-battering': 'ram',
  'rook-displacer': 'push',
  'rook-kamikaze': 'bomb',
  'rook-castle': 'teleport',
  'rook-fortress': 'shield',
  'rook-earthquake': 'quake',
  'knight-camel': 'three',
  'knight-herald': 'up2',
  'knight-diagonal': 'diag',
  'knight-illusionist': 'copy',
  'knight-squire': 'plus',
  'knight-central': 'target',
  'knight-brother': 'link',
  'knight-wallrunner': 'edge',
  'knight-galloper': 'jump',
  'knight-springboard': 'spring',
  'knight-rotator': 'rotate',
  'knight-berserk': 'swords',
  'knight-rider': 'rider',
  'knight-mirage': 'ghost',
  'queen-ricochet': 'bounce',
  'queen-amazon': 'crown',
  'queen-levitation': 'wings',
  'queen-immortal': 'infinity',
  'king-wanderer': 'plus',
  'king-swapper': 'swap',
  'king-barricade': 'wall',
  'king-hint': 'bulb',
  'king-comet': 'comet',
};

export function Emblem({ cardId, className = '' }: { cardId: string; className?: string }) {
  const id = CARD_EMBLEM[cardId];
  if (!id) return null;
  return (
    <svg viewBox="0 0 24 24" className={`emblem ${className}`} aria-hidden="true">
      <path d={EMBLEM[id]} />
    </svg>
  );
}
