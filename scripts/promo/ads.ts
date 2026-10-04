// The ads: shots one after another, each a hook line, a battle on the board,
// a pack opening, a card or the end card. Positions are set up directly, so
// every shot goes straight to the action.
import type { PackType } from '../../src/economy/packs';
import type { SceneSpec } from './scene';

/** One half of a versus shot. */
export type VersusSide = SceneSpec & { lead?: number; gap?: number };

/** What the music does under a shot (sound.py): the full beat, a tense pulse, a build-up, the last chord. */
export type Music = 'full' | 'tense' | 'build' | 'end';

export type Tier = 'S' | 'A' | 'B' | 'C' | 'D';

export type Shot = (
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
      /** A 3-2-1 countdown before the first step (the lead is count × countMs). */
      count?: number;
      countMs?: number;
    })
  | { kind: 'pack'; pack: PackType; packName?: string; cards: string[]; caption?: string; after?: string; hold?: number; pace?: number; ms: number }
  /** Split screen: the same idea in normal chess (top) and in Ultrachess (bottom, plays `delay` ms later). */
  | { kind: 'versus'; top: VersusSide; bottom: VersusSide; title?: string; piece?: string; delay: number; ms: number }
  | { kind: 'card'; id: string; caption?: string; ms: number }
  | { kind: 'end'; text?: string; caption?: string; ms: number }
  /** A tier list filling up: `rows` already placed, `add` drops into its row now. */
  | { kind: 'tier'; rows: Partial<Record<Tier, string[]>>; add?: { tier: Tier; id: string }; caption?: string; ms: number }
) & { music?: Music };

type Board = Extract<Shot, { kind: 'board' }>;

const K = { e1: 'w:king-classic', e8: 'b:king-classic' };
const KH = { h1: 'w:king-classic', a8: 'b:king-classic' };

// ── Scenes (each used in one or more ads) ──

const QUAKE: Board = {
  kind: 'board',
  caption: 'This rook causes an *earthquake*',
  pos: { ...KH, d1: 'w:rook-earthquake', b6: 'b:bishop-classic', d6: 'b:knight-classic', f6: 'b:rook-classic', g6: 'b:pawn-classic' },
  steps: ['!rook-earthquake:rank:5:1'],
  focus: 'e6',
  zoom: 1.3,
  lead: 500,
  gap: 1600,
};

const BERSERK: Board = {
  kind: 'board',
  caption: 'One knight. *Two kills.*',
  pos: { ...K, d4: 'w:knight-berserk', e6: 'b:bishop-classic', g7: 'b:rook-classic', a7: 'b:pawn-classic' },
  steps: ['d4g7~'],
  focus: 'f6',
  zoom: 1.4,
  lead: 450,
  gap: 1700,
};

const PORTAL: Board = {
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

const IMMORTAL: Board = {
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

const KAMIKAZE: Board = {
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

const MATE: Board = {
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
const RAM: Board = {
  kind: 'board',
  caption: 'Pawns that *push*',
  pos: { ...KH, e4: 'w:pawn-ram', e5: 'b:pawn-classic', d5: 'b:pawn-classic' },
  steps: ['e4e5'],
  focus: 'e5',
  zoom: 1.5,
  lead: 400,
  gap: 1300,
};
const SPEAR: Board = {
  kind: 'board',
  caption: 'Pawns that *stab*',
  pos: { ...KH, d4: 'w:pawn-spearman', d6: 'b:knight-classic', c6: 'b:pawn-classic' },
  steps: ['d4d6~'],
  focus: 'd5',
  zoom: 1.5,
  lead: 400,
  gap: 1300,
};
const MARATHON: Board = {
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
const WALLRUN: Board = {
  kind: 'board',
  caption: 'Knights that *run walls*',
  pos: { ...K, c3: 'w:knight-wallrunner', a6: 'b:pawn-classic' },
  steps: ['c3>special'],
  focus: 'a4',
  zoom: 1.4,
  lead: 400,
  gap: 1500,
};
const GALLOP: Board = {
  kind: 'board',
  caption: 'Knights that jump *twice*',
  pos: { ...K, g1: 'w:knight-galloper', e5: 'b:queen-classic' },
  steps: ['g1e5~'],
  focus: 'f3',
  zoom: 1.4,
  lead: 400,
  gap: 1600,
};
const MIRAGE: Board = {
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
const LEVITATE: Board = {
  kind: 'board',
  caption: 'Bishops that *leave the board*',
  pos: { ...KH, e2: 'w:bishop-levitation', h7: 'b:knight-classic' },
  steps: ['e2>levitate', 'b6b5', '*bishop-levitation|…and *strike back*'],
  focus: 'g5',
  zoom: 1.3,
  lead: 400,
  gap: 1300,
};
const ECLIPSE: Board = {
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
const RICOCHET: Board = {
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
const BATTER: Board = {
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
const AMAZON: Board = {
  kind: 'board',
  caption: 'A queen that jumps like a *knight*',
  pos: { ...KH, d1: 'w:queen-amazon', c2: 'w:pawn-classic', d2: 'w:pawn-classic', e2: 'w:pawn-classic', e3: 'b:rook-classic' },
  steps: ['d1e3'],
  focus: 'e2',
  zoom: 1.5,
  lead: 400,
  gap: 1300,
};
const SWAP: Board = {
  kind: 'board',
  caption: 'Kings that *teleport*',
  pos: { e1: 'w:king-swapper', a8: 'b:king-classic', h1: 'w:rook-classic', a1: 'b:rook-classic' },
  steps: ['e1h1~'],
  focus: 'g1',
  zoom: 1.5,
  lead: 400,
  gap: 1300,
};

// ── The 30-second promo: cut to the beat of 128 BPM (one beat = 468.75 ms). ──
const BEAT = 60_000 / 128;
/** A board shot `beats` long: lead and gap as given, the tail fills the rest. */
function onBeat(s: Board, beats: number): Shot {
  const used = (s.lead ?? 600) + s.steps.length * (s.gap ?? 1500);
  return { ...s, tail: Math.round(beats * BEAT - used) };
}

export const PROMO: Shot[] = [
  // Hook: action from the first frame.
  onBeat({ ...BERSERK, caption: 'Chess, but every piece has a *superpower*', lead: 250, gap: 1650 }, 5),
  onBeat({ ...PORTAL, caption: 'Bishops that *teleport*', lead: 300, gap: 2050 }, 6),
  onBeat({ ...QUAKE, caption: 'Rooks that *shake the board*', lead: 300, gap: 1500 }, 5),
  onBeat({ ...IMMORTAL, lead: 250, gap: 950 }, 9),
  { kind: 'pack', pack: 'mythic', packName: 'Mythic Pack', cards: ['knight-mirage'], caption: 'Open packs. Pull *legends*.', pace: 0.5, ms: Math.round(14 * BEAT), music: 'build' },
  onBeat({ ...MIRAGE, caption: '…which one is *real*?', lead: 250, gap: 1400 }, 5),
  onBeat({ ...KAMIKAZE, lead: 300, gap: 1250 }, 5),
  onBeat({ ...MATE, lead: 300, gap: 1150 }, 6),
  { kind: 'end', text: 'Every piece is unique', ms: Math.round(7 * BEAT), music: 'end' },
];

// ── Tier list (128 BPM): from "just a pawn" to S tier, the board fills up as it goes. ──
const PAWN: Board = {
  kind: 'board',
  caption: 'Just… a *pawn* 😐',
  pos: { ...KH, e2: 'w:pawn-classic', d7: 'b:pawn-classic' },
  steps: ['e2e3'],
  focus: 'e3',
  zoom: 1.5,
};
const TIERS: { tier: Tier; id: string; clip: Board; caption: string }[] = [
  { tier: 'D', id: 'pawn-classic', clip: PAWN, caption: 'D tier: does *nothing*' },
  { tier: 'C', id: 'bishop-ricochet', clip: RICOCHET, caption: 'C tier: *bounces* off walls' },
  { tier: 'B', id: 'queen-amazon', clip: { ...AMAZON, caption: 'Queen… that moves like a *knight*' }, caption: 'B tier: queen + *knight*' },
  { tier: 'A', id: 'bishop-levitation', clip: LEVITATE, caption: 'A tier: *leaves* the board' },
];
function tierList(): Shot[] {
  const out: Shot[] = [{ kind: 'tier', rows: {}, caption: 'Ranking chess pieces from *fair* to *BROKEN*', ms: Math.round(5 * BEAT) }];
  const rows: Partial<Record<Tier, string[]>> = {};
  for (const t of TIERS) {
    const clip = t.clip;
    out.push(onBeat({ ...clip, lead: 300, gap: t.tier === 'A' ? 1100 : 1400 }, t.tier === 'A' ? 9 : 5));
    out.push({ kind: 'tier', rows: { ...rows }, add: { tier: t.tier, id: t.id }, caption: t.caption, ms: Math.round(3 * BEAT) });
    rows[t.tier] = [...(rows[t.tier] ?? []), t.id];
  }
  out.push({ kind: 'tier', rows: { ...rows }, caption: 'And *S tier* is…', ms: Math.round(4 * BEAT), music: 'build' });
  out.push({ kind: 'tier', rows: { ...rows }, add: { tier: 'S', id: 'rook-earthquake' }, caption: '*THE WHOLE BOARD* 🌋', ms: Math.round(3 * BEAT) });
  out.push(onBeat({ ...QUAKE, caption: 'It moves *everything*', lead: 250, gap: 1500 }, 5));
  out.push({ kind: 'end', text: 'Which one is S tier for you?', caption: 'Agree? *Comment* 👇', ms: Math.round(6 * BEAT), music: 'end' });
  return out;
}

// ── Puzzle challenge (110 BPM): 3-2-1, then a move normal chess does not have. ──
const PB = 60_000 / 110;
function puzzle(s: Board, beats: number): Shot {
  const countMs = Math.round(2 * PB);
  return { ...s, count: 3, countMs, lead: 3 * countMs, gap: Math.round(beats * PB - 3 * countMs), tail: 0, music: 'tense' };
}
const PUZZLE: Shot[] = [
  puzzle({ ...BATTER, caption: 'Only *1%* find White’s best move', steps: ['d1d7~|*Through* the knight 🤯'], zoom: 1.25 }, 10),
  { kind: 'card', id: 'rook-battering', caption: 'Rooks that go *through*', ms: Math.round(3 * PB), music: 'full' },
  puzzle({ ...SPEAR, caption: 'Win the knight. *With a pawn.*', steps: ['d4d6~|Pawns that *stab* 🗡️'], zoom: 1.35 }, 10),
  { kind: 'card', id: 'pawn-spearman', caption: 'Hits *two* squares ahead', ms: Math.round(3 * PB), music: 'full' },
  puzzle({ ...MATE, caption: 'Last one. *Mate in 1.*', steps: ['d6d8|*Checkmate.* 👑'], zoom: 1.15 }, 11),
  { kind: 'card', id: 'queen-amazon', caption: 'A queen that also jumps like a *knight*', ms: Math.round(3 * PB), music: 'full' },
  { kind: 'end', text: 'Every piece breaks the rules', caption: 'Got all 3? *Comment* ✅', ms: Math.round(7 * PB), music: 'end' },
];

// ── Normal chess vs Ultrachess (120 BPM): split screen, the normal move first, then the card's. ──
const VB = 500;
const versus = (piece: string, top: VersusSide, bottom: VersusSide, beats = 7, title?: string): Shot => ({
  kind: 'versus',
  piece,
  title,
  top: { lead: 300, ...top },
  bottom: { lead: 300, ...bottom },
  delay: 1100,
  ms: beats * VB,
  music: 'tense',
});
const VERSUS: Shot[] = [
  versus(
    'Rook',
    { pos: { ...KH, d1: 'w:rook-classic', d5: 'b:knight-classic', d7: 'b:queen-classic', c7: 'b:pawn-classic' }, steps: ['d1d5'] },
    { pos: BATTER.pos, steps: BATTER.steps },
    7,
    'Normal chess vs *Ultrachess*',
  ),
  versus('Knight', { pos: { ...K, g1: 'w:knight-classic', e5: 'b:queen-classic' }, steps: ['g1e2'] }, { pos: GALLOP.pos, steps: GALLOP.steps }),
  versus(
    'Bishop',
    { pos: { ...KH, f1: 'w:bishop-classic', d7: 'b:queen-classic', c6: 'b:pawn-classic' }, clear: ['h3', 'b6'], steps: ['f1d3'] },
    { pos: PORTAL.pos, clear: PORTAL.clear, steps: PORTAL.steps },
  ),
  versus(
    'Pawn',
    { pos: { ...KH, e2: 'w:pawn-classic', d2: 'w:pawn-classic', f2: 'w:pawn-classic', d7: 'b:pawn-classic' }, steps: ['e2e4'] },
    { pos: MARATHON.pos, steps: MARATHON.steps },
  ),
  versus(
    'King',
    { pos: { e1: 'w:king-classic', a8: 'b:king-classic', h1: 'w:rook-classic', a1: 'b:rook-classic' }, steps: ['e1f1'] },
    { pos: SWAP.pos, steps: SWAP.steps },
  ),
  versus(
    'Queen',
    { pos: { ...KH, d4: 'w:queen-classic', d8: 'b:rook-classic', a2: 'w:pawn-classic' }, steps: ['a2a3', 'd8d4'], gap: 700 },
    { pos: IMMORTAL.pos, steps: IMMORTAL.steps, gap: 700 },
    10,
  ),
  { kind: 'end', text: 'Same game. New rules.', caption: 'Which one would you play? 👇', ms: 6 * VB, music: 'end' },
];

// ── Opening packs until a mythic (128 BPM): each pack better than the last. ──
const PACKS: Shot[] = [
  { kind: 'pack', pack: 'rare', packName: 'Rare Pack', cards: ['bishop-ricochet'], caption: 'Opening packs until I pull a *MYTHIC* 🎰', after: 'Rare… 😐', pace: 0.5, hold: 99_999, ms: Math.round(7 * BEAT), music: 'tense' },
  { kind: 'pack', pack: 'epic', packName: 'Epic Pack', cards: ['rook-kamikaze'], caption: 'Pack 2… 🤞', after: 'Epic! *Closer* 👀', pace: 0.5, hold: 99_999, ms: Math.round(12 * BEAT), music: 'tense' },
  { kind: 'pack', pack: 'mythic', packName: 'Mythic Pack', cards: ['queen-immortal'], caption: 'Last pack… 🙏', after: '*MYTHIC!!!* 🔥', pace: 0.5, hold: 99_999, ms: Math.round(15 * BEAT), music: 'build' },
  { kind: 'card', id: 'queen-immortal', caption: 'A queen that *can’t die*', ms: Math.round(4 * BEAT) },
  onBeat({ ...IMMORTAL, caption: 'Watch 👇', lead: 250, gap: 950 }, 9),
  { kind: 'end', text: 'Every piece is a card', caption: 'Rate my pulls *1–10* 👇', ms: Math.round(6 * BEAT), music: 'end' },
];

// ── POV plot twists (124 BPM): the setup in a tense pulse, the twist on the drop. ──
const TB = 60_000 / 124;
const twist = (s: Board, beats: number): Shot => ({ ...s, tail: Math.round(beats * TB - (s.lead ?? 600) - s.steps.length * (s.gap ?? 1500)), music: 'tense' });
const PLOT: Shot[] = [
  twist({ ...KAMIKAZE, caption: 'POV: they take your rook 😏', steps: ['f5d4|It was a *KAMIKAZE* 💥'], lead: 1300, gap: 1700 }, 7),
  twist({ ...IMMORTAL, caption: 'They finally trap your queen 😭', steps: ['!queen-immortal:arm', 'a2a3', 'd8d4|…she *respawns* 😎'], lead: 900, gap: 800 }, 9),
  twist({ ...MIRAGE, caption: 'They know where your knight is…', steps: ['e4>mirage|…*or do they?* 👀'], lead: 1300, gap: 1700 }, 7),
  twist({ ...BERSERK, caption: 'One knight. Two targets.', steps: ['d4g7~|*Both.* 🔪'], lead: 1100, gap: 1600 }, 6),
  twist({ ...MATE, caption: 'And the final plot twist…', steps: ['d6d8|*Checkmate.* 👑'], lead: 1100, gap: 1500 }, 7),
  { kind: 'end', text: 'Every piece has a plot twist', caption: 'Play it free 👇', ms: Math.round(6 * TB), music: 'end' },
];

export const ADS: Record<string, Shot[]> = {
  versus: VERSUS,
  packs: PACKS,
  plot: PLOT,
  promo: PROMO,
  tierlist: tierList(),
  puzzle: PUZZLE,
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
