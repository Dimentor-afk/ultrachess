// Hand-drawn SVG piece set and per-card emblems. Every card gets a small
// emblem that hints at its mechanic, so variants are told apart at a glance.

import type { Color, PieceType } from '../engine/types';

const BODY: Record<PieceType, string> = {
  pawn:
    'M22.5 7.5a5.5 5.5 0 0 0-3.4 9.8c-2.6 1.4-4.1 3.6-4.1 6.2h3.2c-1.1 4.2-3.6 7.6-6.7 10.2V37h22v-3.3c-3.1-2.6-5.6-6-6.7-10.2h3.2c0-2.6-1.5-4.8-4.1-6.2a5.5 5.5 0 0 0-3.4-9.8z',
  rook:
    'M11 8h5v4h4V8h5v4h4V8h5v8l-4 3.5v11l3 2.5V37H12v-4l3-2.5v-11L11 16z',
  bishop:
    'M22.5 4.5a2.8 2.8 0 1 1 0 5.6 2.8 2.8 0 0 1 0-5.6zM22.5 11c6 4.3 9.2 9.4 7.4 14.7-.6 1.8-1.8 3.3-3.4 4.3H18.5c-1.6-1-2.8-2.5-3.4-4.3-1.8-5.3 1.4-10.4 7.4-14.7zM15.5 31.5h14l1.2 3.2h-16.4z',
  knight:
    'M14 37c-.6-4.6.9-8.6 4.6-11.6 1.5-1.2 2-2.9 1.2-4.6l-4.4 2.5c-1.7 1-3.9.9-5.2-.6-.9-1-.9-2.4-.1-3.5l6.2-8.6c.9-1.3 2.3-2.2 3.8-2.6L19.4 5l3 2.4c6.8.6 11.8 6.3 12 13.3.2 5.4-.6 10.9-2.4 16.3z',
  queen:
    'M9 13.5a2.3 2.3 0 1 1 0 .1zM17 9.5a2.3 2.3 0 1 1 0 .1zM28 9.5a2.3 2.3 0 1 1 0 .1zM36 13.5a2.3 2.3 0 1 1 0 .1zM22.5 7a2.3 2.3 0 1 1 0 .1zM10 16l5 14h15l5-14-7 7-2.8-12L22.5 21l-2.7-10L17 23z M14 31.5h17l1.2 3.4H12.8z',
  king:
    'M21 3.5h3v3.5h3.5v3H24v3.5h-3V10h-3.5V7H21zM22.5 16.5c1.4-2.6 3.6-3.8 6-3.8 4.6 0 7.4 4.4 5.6 9.6L31 30H14l-3.1-7.7c-1.8-5.2 1-9.6 5.6-9.6 2.4 0 4.6 1.2 6 3.8zM13.5 31.5h18l1.2 3.4H12.3z',
};

const BASE = 'M10.5 37.5h24a1.5 1.5 0 0 1 1.5 1.5v1.5H9V39a1.5 1.5 0 0 1 1.5-1.5z';

/** Detail lines drawn on top of the silhouette. */
const DETAIL: Partial<Record<PieceType, string>> = {
  bishop: 'M22.5 16.5v7M19 20h7',
  knight: 'M24.5 12.2a1.3 1.3 0 1 1 0 .1M13.5 18.5l-1.4 1.1M29 16c1.5 4.2 1.4 9.8-.4 16',
  rook: 'M15 19.5h15M14.5 30.5h16',
  king: 'M14.5 23.5c5.2-1.6 10.8-1.6 16 0',
  queen: 'M14.5 27.5h16',
};

export function PieceSvg({ type, color, className = '' }: { type: PieceType; color: Color; className?: string }) {
  return (
    <svg viewBox="0 0 45 45" className={`piece-svg piece-svg-${color} ${className}`} aria-hidden="true">
      <path className="ps-body" d={BODY[type]} />
      <path className="ps-body" d={BASE} />
      {DETAIL[type] && <path className="ps-detail" d={DETAIL[type]} />}
    </svg>
  );
}

// ── Emblems ──

type EmblemId =
  | 'target' | 'up2' | 'back' | 'diag' | 'ram' | 'swap' | 'ghost' | 'copy' | 'spear' | 'eye'
  | 'shield' | 'swords' | 'wings' | 'portal' | 'bounce' | 'turn' | 'jump' | 'bomb' | 'hourglass'
  | 'teleport' | 'moon' | 'quake' | 'bulb' | 'tunnel' | 'push' | 'three' | 'palette' | 'spring'
  | 'rider' | 'compass' | 'crown' | 'plus' | 'link' | 'rotate' | 'infinity' | 'wall' | 'edge' | 'hit';

const EMBLEM: Record<EmblemId, string> = {
  target: 'M12 4a8 8 0 1 0 .01 0M12 9a3 3 0 1 0 .01 0M12 1v5M12 18v5M1 12h5M18 12h5',
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
