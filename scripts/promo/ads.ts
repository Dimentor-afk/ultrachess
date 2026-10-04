// The ads: shots one after another, each a hook line, a battle on the board,
// a pack opening, a card or the end card. Positions are set up directly, so
// every shot goes straight to the action.
import type { PackType } from '../../src/economy/packs';
import type { SceneSpec } from './scene';

export type Shot =
  | { kind: 'hook'; text: string; sub?: string; art?: string; ms: number }
  | (SceneSpec & {
      kind: 'board';
      caption?: string;
      capPos?: 'top' | 'bottom';
      /** Before the first step, between steps, after the last one (ms). */
      lead?: number;
      gap?: number;
      tail?: number;
      /** The camera pushes in on this square. */
      focus?: string;
      zoom?: number;
      /** Fireworks at the end (a won game). */
      win?: boolean;
    })
  | { kind: 'pack'; pack: PackType; packName?: string; cards: string[]; caption?: string; hold?: number; ms: number }
  | { kind: 'card'; id: string; caption?: string; ms: number }
  | { kind: 'end'; text?: string; ms: number };

const K = { e1: 'w:king-classic', e8: 'b:king-classic' };
const KH = { h1: 'w:king-classic', a8: 'b:king-classic' };

// ── Scenes (each used in one or more ads) ──

const QUAKE: Shot = {
  kind: 'board',
  caption: 'This rook causes an *earthquake*',
  pos: { ...KH, d1: 'w:rook-earthquake', b6: 'b:bishop-classic', d6: 'b:knight-classic', f6: 'b:rook-classic', g6: 'b:pawn-classic' },
  steps: ['!rook-earthquake:rank:5:1'],
  focus: 'e6',
  zoom: 1.3,
  lead: 500,
  gap: 1600,
};

const BERSERK: Shot = {
  kind: 'board',
  caption: 'One knight. *Two kills.*',
  pos: { ...K, d4: 'w:knight-berserk', e6: 'b:bishop-classic', g7: 'b:rook-classic', a7: 'b:pawn-classic' },
  steps: ['d4g7~'],
  focus: 'f6',
  zoom: 1.4,
  lead: 450,
  gap: 1700,
};

const PORTAL: Shot = {
  kind: 'board',
  caption: 'Through the *portal*',
  pos: { ...KH, f1: 'w:bishop-portal', d7: 'b:queen-classic', c6: 'b:pawn-classic' },
  clear: ['h3', 'b6'],
  steps: ['f1d7~'],
  focus: 'd4',
  zoom: 1.15,
  lead: 450,
  gap: 2300,
};

const IMMORTAL: Shot = {
  kind: 'board',
  caption: 'This queen *can\'t die*',
  pos: { ...KH, d4: 'w:queen-immortal', d8: 'b:rook-classic', a2: 'w:pawn-classic' },
  steps: ['!queen-immortal:arm', 'a2a3', 'd8d4|…she comes *back*'],
  focus: 'd4',
  zoom: 1.25,
  lead: 400,
  gap: 1100,
  tail: 1700,
};

const KAMIKAZE: Shot = {
  kind: 'board',
  caption: 'Take it. *Regret it.*',
  pos: { ...KH, d4: 'w:rook-kamikaze', f5: 'b:knight-classic', b7: 'b:pawn-classic' },
  turn: 'b',
  steps: ['f5d4'],
  focus: 'd4',
  zoom: 1.45,
  lead: 500,
  gap: 1300,
  tail: 1500,
};

const MATE: Shot = {
  kind: 'board',
  caption: 'Climb the *leagues*',
  pos: { h1: 'w:king-classic', g8: 'b:king-classic', f7: 'b:pawn-classic', g7: 'b:pawn-classic', h7: 'b:pawn-classic', a1: 'w:rook-earthquake', d6: 'w:queen-amazon' },
  clear: ['b8', 'c8', 'h8', 'h6'],
  steps: ['d6d8|*Checkmate.*'],
  focus: 'e8',
  zoom: 1.2,
  lead: 500,
  gap: 1200,
  tail: 2200,
  win: true,
};

// Pawns
const RAM: Shot = {
  kind: 'board',
  caption: 'Pawns that *push*',
  pos: { ...KH, e4: 'w:pawn-ram', e5: 'b:pawn-classic', d5: 'b:pawn-classic' },
  steps: ['e4e5'],
  focus: 'e5',
  zoom: 1.5,
  lead: 400,
  gap: 1300,
};
const SPEAR: Shot = {
  kind: 'board',
  caption: 'Pawns that *stab*',
  pos: { ...KH, d4: 'w:pawn-spearman', d6: 'b:knight-classic', c6: 'b:pawn-classic' },
  steps: ['d4d6~'],
  focus: 'd5',
  zoom: 1.5,
  lead: 400,
  gap: 1300,
};
const MARATHON: Shot = {
  kind: 'board',
  caption: 'Pawns that *sprint*',
  pos: { ...KH, e2: 'w:pawn-marathoner', d2: 'w:pawn-classic', f2: 'w:pawn-classic', d7: 'b:pawn-classic' },
  steps: ['e2e5~'],
  focus: 'e4',
  zoom: 1.4,
  lead: 400,
  gap: 1300,
};

// Knights
const WALLRUN: Shot = {
  kind: 'board',
  caption: 'Knights that *run walls*',
  pos: { ...K, c3: 'w:knight-wallrunner', a6: 'b:pawn-classic' },
  steps: ['c3>special'],
  focus: 'a4',
  zoom: 1.4,
  lead: 400,
  gap: 1500,
};
const GALLOP: Shot = {
  kind: 'board',
  caption: 'Knights that jump *twice*',
  pos: { ...K, g1: 'w:knight-galloper', e5: 'b:queen-classic' },
  steps: ['g1e5~'],
  focus: 'f3',
  zoom: 1.4,
  lead: 400,
  gap: 1600,
};
const MIRAGE: Shot = {
  kind: 'board',
  caption: 'Which one is *real*?',
  pos: { ...K, e4: 'w:knight-mirage', d7: 'b:pawn-classic' },
  steps: ['e4>mirage'],
  focus: 'e4',
  zoom: 1.35,
  lead: 400,
  gap: 1500,
  tail: 1200,
};

// Bishops
const LEVITATE: Shot = {
  kind: 'board',
  caption: 'Bishops that *leave the board*',
  pos: { ...KH, e2: 'w:bishop-levitation', h7: 'b:knight-classic' },
  steps: ['e2>levitate', 'b6b5', '*bishop-levitation|…and *strike back*'],
  focus: 'g5',
  zoom: 1.3,
  lead: 400,
  gap: 1300,
};
const ECLIPSE: Shot = {
  kind: 'board',
  caption: 'A wall of *darkness*',
  pos: { ...KH, c1: 'w:bishop-eclipse', g5: 'b:queen-classic' },
  steps: ['!bishop-eclipse:*'],
  focus: 'e3',
  zoom: 1.3,
  lead: 400,
  gap: 1500,
  tail: 900,
};
const RICOCHET: Shot = {
  kind: 'board',
  caption: 'Bishops that *bounce*',
  pos: { ...KH, e3: 'w:bishop-ricochet', g7: 'b:queen-classic' },
  clear: ['h6'],
  steps: ['e3g7~'],
  focus: 'g5',
  zoom: 1.45,
  lead: 400,
  gap: 1500,
};

// Rooks
const BATTER: Shot = {
  kind: 'board',
  caption: 'Rooks that go *through*',
  pos: { ...KH, d1: 'w:rook-battering', d5: 'b:knight-classic', d7: 'b:queen-classic', c7: 'b:pawn-classic' },
  steps: ['d1d7~'],
  focus: 'd5',
  zoom: 1.35,
  lead: 400,
  gap: 1500,
};

// Queens and kings
const AMAZON: Shot = {
  kind: 'board',
  caption: 'A queen that jumps like a *knight*',
  pos: { ...KH, d1: 'w:queen-amazon', c2: 'w:pawn-classic', d2: 'w:pawn-classic', e2: 'w:pawn-classic', e3: 'b:rook-classic' },
  steps: ['d1e3'],
  focus: 'e2',
  zoom: 1.5,
  lead: 400,
  gap: 1300,
};
const SWAP: Shot = {
  kind: 'board',
  caption: 'Kings that *teleport*',
  pos: { e1: 'w:king-swapper', a8: 'b:king-classic', h1: 'w:rook-classic', a1: 'b:rook-classic' },
  steps: ['e1h1~'],
  focus: 'g1',
  zoom: 1.5,
  lead: 400,
  gap: 1300,
};

export const ADS: Record<string, Shot[]> = {
  // Big ad 1: one mechanic after another, a pack, a blast.
  chaos: [
    { kind: 'hook', text: 'Chess, but every piece has a *superpower*', art: 'rook-earthquake', ms: 1700 },
    QUAKE,
    BERSERK,
    PORTAL,
    IMMORTAL,
    { kind: 'pack', pack: 'mythic', packName: 'Mythic Pack', cards: ['bishop-ricochet', 'rook-earthquake'], caption: 'Open packs. Pull *mythics*.', hold: 700, ms: 10600 },
    KAMIKAZE,
    MATE,
    { kind: 'end', ms: 2600 },
  ],
  // Big ad 2: a pull, then the card in battle, then the win.
  collect: [
    { kind: 'pack', pack: 'mythic', packName: 'Mythic Pack', cards: ['bishop-ricochet', 'queen-immortal'], caption: 'POV: you open a *Mythic Pack*…', hold: 700, ms: 10200 },
    { kind: 'card', id: 'queen-immortal', caption: '…and pull *Immortal*', ms: 1800 },
    IMMORTAL,
    { kind: 'hook', text: 'Every card plays *differently*', sub: '69 cards · 5 rarities', ms: 1500 },
    BERSERK,
    QUAKE,
    MATE,
    { kind: 'end', ms: 2600 },
  ],
  // Clip ads: one family of pieces each, fast cuts.
  pawns: [
    { kind: 'hook', text: 'Your pawns are *not* normal', art: 'pawn-spearman', ms: 1300 },
    RAM,
    SPEAR,
    MARATHON,
    { kind: 'end', text: 'Every piece is unique', ms: 2200 },
  ],
  knights: [
    { kind: 'hook', text: 'POV: you thought you knew how *knights* move', art: 'knight-galloper', ms: 1500 },
    GALLOP,
    WALLRUN,
    BERSERK,
    MIRAGE,
    { kind: 'end', text: 'Every piece is unique', ms: 2200 },
  ],
  bishops: [
    { kind: 'hook', text: 'Bishops just got *weird*', art: 'bishop-portal', ms: 1300 },
    PORTAL,
    RICOCHET,
    ECLIPSE,
    LEVITATE,
    { kind: 'end', text: 'Every piece is unique', ms: 2200 },
  ],
  rooks: [
    { kind: 'hook', text: 'Never trust a *rook*', art: 'rook-kamikaze', ms: 1300 },
    BATTER,
    QUAKE,
    KAMIKAZE,
    { kind: 'end', text: 'Every piece is unique', ms: 2200 },
  ],
  royals: [
    { kind: 'hook', text: 'The queen and king got *upgrades*', art: 'queen-immortal', ms: 1400 },
    AMAZON,
    SWAP,
    IMMORTAL,
    MATE,
    { kind: 'end', text: 'Every piece is unique', ms: 2200 },
  ],
};
