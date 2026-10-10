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

/** Move grades as chess sites show them: the badge on the square, the colour of the move. */
export type Grade = '!!' | '!' | 'best' | 'good' | '?!' | '?' | '??' | '#';
export const GRADES: Record<Grade, { c: string; t: string }> = {
  '!!': { c: '#1baca6', t: '!!' },
  '!': { c: '#5c9bd1', t: '!' },
  best: { c: '#81b64c', t: '★' },
  good: { c: '#96af8b', t: '✓' },
  '?!': { c: '#f0b429', t: '?!' },
  '?': { c: '#e58f2a', t: '?' },
  '??': { c: '#ca3431', t: '??' },
  '#': { c: '#81b64c', t: '#' },
};

export type Shot = (
  | { kind: 'hook'; text: string; sub?: string; art?: string; ms: number }
  | (SceneSpec & {
      kind: 'board';
      caption?: string;
      capPos?: 'top' | 'bottom';
      /** Before the first step, between steps, after the last one (ms). */
      lead?: number;
      gap?: number;
      /** Time after each step, when the steps need different times (else `gap`). */
      gaps?: number[];
      tail?: number;
      /** The camera pushes in on this square. */
      focus?: string;
      zoom?: number;
      /** Seen from Black's side (the player at the bottom is the one it happens to). */
      flip?: boolean;
      /** Seen from Black's side. */
      flip?: boolean;
      /** Danger squares lit red, pulsing: one list per state (after 0, 1, … steps; the last one holds). */
      red?: string[][];
      /** Squares lit gold (the hero of the shot). */
      gold?: string[];
      /** Camera move: a slow push (default), a tilted 3D board turning one way or the other, or a punch in. */
      cam?: 'push' | 'tilt-l' | 'tilt-r' | 'punch' | 'spin';
      /** The shot's length (else lead + steps + tail). */
      ms?: number;
      /** When the (one) move lands, ms from the shot's start: the lead is worked out from the move's own
       *  length, so a hop and a portal both land on the beat (a mate: when the king starts to fall). */
      land?: number;
      /** The move's grade: a badge on that square when the move lands, its squares in the grade's colour. */
      grade?: { sq: string; g: Grade };
      paint?: string[];
      /** A short name stamped under the board when the move lands. */
      label?: string;
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
  /** Plain text on black, meme style ("Nobody:\n\nMy bishop:"). */
  | { kind: 'text'; text: string; ms: number }
  /** A tier list filling up: `rows` already placed, `add` drops into its row now. */
  | { kind: 'tier'; rows: Partial<Record<Tier, string[]>>; add?: { tier: Tier; id: string }; caption?: string; ms: number }
  /** An edit insert: one piece huge on a dark glow, its name stamped over it. */
  | { kind: 'hero'; id: string; text: string; sub?: string; ms: number }
) & {
  music?: Music;
  /** Hits in the music (ms from the shot's start): the frame kicks and flashes on each. */
  bumps?: number[];
};

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
  return onBeatAt(s, beats, BEAT);
}
function onBeatAt(s: Board, beats: number, beat: number): Board {
  const used = (s.lead ?? 600) + s.steps.length * (s.gap ?? 1500);
  return { ...s, tail: Math.round(beats * beat - used) };
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

// ── Native TikToks: no ad look. Plain cuts, TikTok-style text, a small watermark, no end card. ──

// Oddly satisfying (80 BPM lo-fi): effects one after another, no talk.
const LB = 60_000 / 80;
const calm = (s: Board, beats: number, caption?: string): Shot => onBeatAt({ ...s, caption, zoom: Math.min(s.zoom ?? 1.25, 1.2) }, beats, LB);
const SATISFYING: Shot[] = [
  calm(QUAKE, 4, 'chess but it’s oddly satisfying'),
  calm(PORTAL, 4),
  calm(MIRAGE, 4),
  calm(ECLIPSE, 4),
  calm(RICOCHET, 4),
  calm(KAMIKAZE, 4),
  calm({ ...MATE, steps: ['d6d8'] }, 5),
];

// Memes (100 BPM): the setup, then the punchline lands on a vine boom.
const MB = 60_000 / 100;
const meme = (s: Board, beats: number): Shot => ({ ...onBeatAt(s, beats, MB), music: 'tense' });
const MEMES: Shot[] = [
  { kind: 'text', text: 'Nobody:\n\n\nMy bishop:', ms: 3 * MB },
  meme({ ...RICOCHET, caption: undefined, lead: 300, gap: 1500 }, 5),
  meme({ ...IMMORTAL, caption: 'When you FINALLY take their queen', steps: ['!queen-immortal:arm', 'a2a3', 'd8d4|💀💀💀'], lead: 300, gap: 900 }, 9),
  meme({ ...WALLRUN, caption: 'me explaining to my friend how the knight moves', steps: ['c3>special|“…and then it just runs along the wall”'], lead: 900, gap: 1500 }, 6),
  meme({ ...SPEAR, caption: 'POV: you said “it’s just a pawn”', steps: ['d4d6~|🗿'], lead: 900, gap: 1300 }, 5),
  meme({ ...KAMIKAZE, caption: 'when they take your piece but it was a trap all along', steps: ['f5d4|😈'], lead: 1000, gap: 1300 }, 6),
];

// Card of the day (90 BPM): one card, explained like a friend would. A series to follow.
const CB = 60_000 / 90;
const MIRAGE_CENTER: Board = { kind: 'board', pos: { ...K, d4: 'w:knight-mirage', h7: 'b:pawn-classic' }, steps: ['d4>mirage'], focus: 'd4', zoom: 1.2 };
const CARD_OF_DAY: Shot[] = [
  { kind: 'card', id: 'knight-mirage', caption: 'Card of the day: #1', ms: Math.round(4 * CB) },
  onBeatAt({ ...MIRAGE, caption: 'Mirage jumps like a knight…', steps: ['e4>mirage|…but leaves FAKE copies of itself'], lead: 900, gap: 1700 }, 7, CB),
  onBeatAt({ ...MIRAGE_CENTER, caption: 'your opponent sees 6 knights.\nonly one is real 👀', steps: ['d4>mirage'], lead: 700, gap: 2400 }, 6, CB),
  { kind: 'card', id: 'knight-mirage', caption: 'hit an illusion and it just… vanishes', ms: Math.round(4 * CB) },
  onBeatAt({ ...MIRAGE, caption: 'mythic rarity. would you play it?\nfollow for card #2 👀', steps: ['e4>mirage'], lead: 600, gap: 1500 }, 6, CB),
];

/** A card of the day: the card, the move with a line about it, one fact, then the move again with the sign-off. */
function cardOfDay(n: number, id: string, clip: Board, lines: { intro: string; punch: string; fact: string; outro: string }, punchStep = clip.steps.length - 1): Shot[] {
  const steps = clip.steps.map((x, i) => (i === punchStep ? `${x.split('|')[0]}|${lines.punch}` : x.split('|')[0]));
  const beats = Math.max(7, Math.ceil(((clip.lead ?? 900) + steps.length * (clip.gap ?? 1500) + 1400) / CB));
  return [
    { kind: 'card', id, caption: `Card of the day: #${n}`, ms: Math.round(4 * CB) },
    onBeatAt({ ...clip, caption: lines.intro, steps }, beats, CB),
    { kind: 'card', id, caption: lines.fact, ms: Math.round(4 * CB) },
    onBeatAt({ ...clip, caption: lines.outro, steps: clip.steps.map((x) => x.split('|')[0]) }, beats, CB),
  ];
}
const SERIES: Record<string, Shot[]> = {
  cardofday2: cardOfDay(2, 'queen-immortal', { ...IMMORTAL, lead: 900, gap: 1000 }, {
    intro: 'Immortal: press the button, play your move as usual…',
    punch: '…they take her and she just RESPAWNS 😭',
    fact: 'only once per game.\nand they can’t see if it’s switched on 👀',
    outro: 'mythic rarity. would you play it?\nfollow for card #3 👀',
  }),
  cardofday3: cardOfDay(3, 'bishop-portal', { ...PORTAL, lead: 900, gap: 2200 }, {
    intro: 'Portal bishop walks off the edge of the board…',
    punch: '…and comes out on the other side 🌀',
    fact: 'it can capture right after the portal.\nand use it as many times as it wants',
    outro: 'legendary rarity. would you play it?\nfollow for card #4 👀',
  }),
  cardofday4: cardOfDay(4, 'rook-earthquake', { ...QUAKE, lead: 900, gap: 1800 }, {
    intro: 'Earthquake rook has a button…',
    punch: '…that shoves a whole row one square 🌋',
    fact: 'the piece on the edge wraps around\nto the other side. and it doesn’t use your move',
    outro: 'mythic rarity. would you play it?\nfollow for card #5 👀',
  }),
  cardofday5: cardOfDay(5, 'knight-berserk', { ...BERSERK, lead: 900, gap: 1900 }, {
    intro: 'Berserk takes a piece…',
    punch: '…and then jumps again and takes ANOTHER one 🔪',
    fact: 'two captures in one move.\nthe price: it skips its next turn',
    outro: 'legendary rarity. would you play it?\nfollow for card #6 👀',
  }),
  cardofday6: cardOfDay(6, 'rook-kamikaze', { ...KAMIKAZE, lead: 1000, gap: 1500 }, {
    intro: 'Kamikaze looks like a normal rook…',
    punch: '…until someone takes it 💥',
    fact: 'whatever takes it dies too\n(unless it’s a rook or a queen)',
    outro: 'epic rarity. would you play it?\nfollow for card #7 👀',
  }),
  cardofday7: cardOfDay(7, 'bishop-levitation', { ...LEVITATE, lead: 900, gap: 1300 }, {
    intro: 'Levitation bishop floats OFF the board…',
    punch: '…waits outside and strikes back ✨',
    fact: 'the platform holds for 3 enemy turns.\nget back on the board in time or it falls',
    outro: 'legendary rarity. would you play it?\nfollow for more 👀',
  }),
};

/** Ads that should look like ordinary TikToks, not ads. */
// "Nobody came" meme (UA trend): game highlights under one line that stays on screen,
// then the author adds the trend's own clip and sound in CapCut. No music of ours.
const bare = (s: Board, ms: number): Board => {
  const b: Board = { ...s, caption: undefined, steps: s.steps.map((x) => x.split('|')[0]), lead: 250, zoom: Math.min(s.zoom ?? 1.25, 1.3) };
  return onBeatAt(b, 1, ms);
};
const NOBODY: Shot[] = [
  bare({ ...QUAKE, gap: 1500 }, 2000),
  bare({ ...BERSERK, gap: 1500 }, 1900),
  bare({ ...PORTAL, gap: 1800 }, 2200),
  bare({ ...MIRAGE, gap: 1500 }, 1900),
  bare({ ...IMMORTAL, gap: 800 }, 2900),
  bare({ ...KAMIKAZE, gap: 1300 }, 1900),
];

// ── Two meme videos (EN, effects only, no music) on positions of their own, full of card pieces. ──

/** The background for them: card pieces rather than classic ones, so every frame looks wild. */
const WILD: Record<string, string> = {
  a2: 'w:pawn-sprinter', b3: 'w:pawn-spearman', c2: 'w:pawn-ram', g2: 'w:pawn-marathoner', h3: 'w:pawn-stormer',
  b1: 'w:knight-galloper', c1: 'w:bishop-ricochet', a1: 'w:rook-kamikaze',
  a7: 'b:pawn-spearman', b6: 'b:pawn-phantom', g7: 'b:pawn-sprinter', h6: 'b:pawn-stubborn', f7: 'b:pawn-marathoner',
  b8: 'b:knight-wallrunner', h8: 'b:rook-battering', c8: 'b:bishop-portal',
};
const KG = { g1: 'w:king-classic', g8: 'b:king-classic' };
/** A move (or a few) with no caption, then `line` at the bottom on the last one, landing on a boom. */
const react = (s: Omit<Board, 'kind'>, line: string, ms: number): Board => ({
  ...onBeatAt(
    { kind: 'board', crowd: WILD, lead: 700, gap: 1400, ...s, capPos: 'bottom', zoom: 1, steps: s.steps.map((x, i) => (i === s.steps.length - 1 ? `${x}|${line}` : x)) },
    1,
    ms,
  ),
  music: 'tense',
});

// "That's illegal": a chess player reacts to every move, louder each time, and in the end asks for one more game.
const ILLEGAL: Shot[] = [
  { kind: 'text', text: 'me showing my\nchess friend\nthe game I made', ms: 2200 },
  // A pawn jumps over a knight.
  react({ pos: { ...KG, e4: 'w:pawn-phantom', e5: 'b:knight-berserk', f2: 'w:pawn-shieldbearer', f4: 'w:knight-rider', d1: 'w:queen-amazon', d8: 'b:queen-levitation', c5: 'b:bishop-chain' }, steps: ['e4e6'] }, '“that’s illegal”', 3200),
  // A knight takes its pawn for a ride; they take the knight and only the pawn dies.
  react({ pos: { ...KG, d2: 'w:knight-rider', e4: 'w:pawn-duelist', f2: 'w:pawn-classic', c6: 'b:bishop-sniper', e8: 'b:rook-fortress', f6: 'b:knight-camel', c4: 'w:bishop-portal' }, steps: ['d2e4', 'c6e4'], gap: 1300 }, '“that’s ALSO illegal”', 4000),
  // A pawn swaps places with the queen in front of it.
  react({ pos: { ...KG, d4: 'w:pawn-stubborn', d5: 'b:queen-immortal', e3: 'w:bishop-sentinel', c3: 'w:knight-squire', f6: 'b:knight-camel', e7: 'b:bishop-flanker', f3: 'w:rook-displacer' }, steps: ['d4d5'] }, '“BRO WHAT 😭”', 3200),
  // A queen bounces off the edge into g7.
  react({ pos: { ...KG, a3: 'w:queen-ricochet', e5: 'w:knight-brother', d5: 'w:knight-brother', e6: 'b:pawn-shieldbearer', d7: 'b:bishop-martyr', c3: 'w:rook-displacer', a6: 'b:knight-rider' }, steps: ['a3g7~'] }, '“I’m calling FIDE 📞”', 3400),
  // A pawn takes the queen and steps back.
  react({ pos: { ...KG, e5: 'w:pawn-duelist', d6: 'b:queen-levitation', f4: 'w:knight-springboard', c4: 'w:bishop-chameleon', e8: 'b:rook-fortress', c7: 'b:knight-rider', d3: 'w:rook-corner' }, steps: ['e5d6~'] }, '“…that’s a PAWN??”', 3300),
  { kind: 'text', text: '3 hours later', ms: 1600 },
  // Mate with a rook that turns the corner.
  react(
    { pos: { ...KG, c6: 'w:rook-corner', h7: 'b:pawn-shieldbearer', d4: 'w:queen-amazon', e5: 'w:knight-mirage', a5: 'b:bishop-eclipse', a4: 'b:knight-galloper' }, clear: ['c8', 'h6'], steps: ['c6e8'], win: true },
    '“ok one more game”',
    3800,
  ),
];

// "I'm fine": what I say after the game stays on top, what really happened comes up under it.
// Seen from Black: the player at the bottom is me.
const FINE: Shot[] = [
  // I take their bishop, my queen freezes, they take her.
  react({ pos: { ...KG, e5: 'w:bishop-martyr', c7: 'b:queen-levitation', e1: 'w:rook-sniper', d3: 'w:knight-rider', f8: 'b:bishop-chameleon', d7: 'b:knight-mirage' }, turn: 'b', steps: ['c7e5', 'e1e5'], gap: 1300 }, '(I took their bishop.\nmy queen froze.\nthen they took her)', 4000),
  // I take their rook and it just steps back.
  react({ pos: { ...KG, d5: 'w:rook-fortress', f6: 'b:knight-berserk', e3: 'w:knight-squire', c6: 'b:bishop-sniper', e7: 'b:rook-corner', c4: 'w:queen-ricochet' }, turn: 'b', steps: ['f6d5'] }, '(I took their rook.\nit just stepped back)', 3300),
  // Mate in one, and a pawn appears out of nowhere.
  react(
    { pos: { g1: 'w:king-barricade', g8: 'b:king-classic', b1: 'w:knight-classic', f2: 'w:pawn-ram', h2: 'w:pawn-shieldbearer', d8: 'b:rook-castle', e4: 'w:knight-mirage', a4: 'w:bishop-levitation', e5: 'b:knight-brother', f5: 'b:knight-brother' }, clear: ['h3'], turn: 'b', steps: ['d8d1'] },
    '(I had mate in 1.\na pawn just spawned)',
    3500,
  ),
  // Their bishop hits my queen through my pawn.
  react({ pos: { ...KG, a3: 'w:bishop-piercer', d6: 'b:pawn-duelist', e7: 'b:queen-ricochet', e4: 'w:knight-wallrunner', f3: 'w:rook-tunnel', c6: 'b:knight-rider' }, steps: ['a3e7'] }, '(their bishop killed my queen\nTHROUGH my pawn)', 3400),
  // Their king runs five squares and takes my rook.
  react({ pos: { h1: 'w:king-comet', g8: 'b:king-classic', c6: 'b:rook-jumper', d3: 'w:bishop-sentinel', e2: 'w:knight-camel', a4: 'b:knight-squire', f6: 'b:bishop-chain' }, clear: ['g2', 'b8', 'c8'], steps: ['h1c6'] }, '(their KING ran across\nthe board and took my rook)', 3500),
  // Smothered by a queen that jumps like a knight.
  react(
    { pos: { ...KG, f8: 'b:rook-castle', h8: 'b:rook-fortress', f7: 'b:pawn-classic', g7: 'b:pawn-classic', h7: 'b:pawn-classic', c6: 'w:queen-amazon', d4: 'w:knight-mirage', b5: 'b:knight-galloper', a6: 'b:bishop-portal' }, clear: ['h6'], steps: ['c6e7'] },
    '(mated by a queen\nthat jumps like a knight)',
    3600,
  ),
  { kind: 'text', text: 'anyway. rematch?', ms: 2000 },
].map((x) => (x.kind === 'board' ? { ...x, flip: true } : x)) as Shot[];

// "Rating every move" (EN, effects only): one position, one game, twelve moves normal chess does not
// have, each with its line and a chess.com style grade. Ends on a real mate.
const GAME_STEPS: [string, string, number][] = [
  ['f1e6', 'my bishop goes\nthrough the WALL 🌀 !!', 2400],
  ['e5e4', 'their pawn swaps places\nwith my knight ?!', 1700],
  ['e5b8~', 'my knight takes\nTWO pieces 🔪 !!', 1900],
  ['a4c3', 'they take my rook…\nit EXPLODES 💥', 1800],
  ['b3d4', 'my queen jumps like a knight !', 1400],
  ['!queen-immortal:arm', '(they pressed some button 👀)', 1100],
  ['d6e5', 'free queen?? ??', 1200],
  ['d4e5', 'I take her… she RESPAWNS 😭', 2000],
  ['a7a5', 'their pawn stabs\nfrom 2 squares away 🗡️', 1600],
  ['c5d8', 'my rook turns the corner: MATE!!\n…a pawn just SPAWNED??', 2900],
  ['a6a5', '(ok they’re out of tricks)', 1200],
  ['e5f6', 'queen checks like a KNIGHT.\nCHECKMATE 👑', 2600],
];
const GAME_POS: Record<string, string> = {
  g1: 'w:king-classic', f2: 'w:pawn-classic', g2: 'w:pawn-classic', h2: 'w:pawn-classic', a2: 'w:pawn-sprinter',
  f1: 'w:bishop-portal', e4: 'w:knight-berserk', c3: 'w:rook-kamikaze', b3: 'w:queen-amazon', c5: 'w:rook-corner', a5: 'w:knight-galloper',
  g8: 'b:king-barricade', h8: 'b:rook-fortress', f7: 'b:pawn-classic', g6: 'b:pawn-classic', h7: 'b:pawn-classic',
  d6: 'b:queen-immortal', e5: 'b:pawn-stubborn', d7: 'b:bishop-sniper', b8: 'b:rook-castle', a4: 'b:knight-squire',
  d4: 'b:bishop-chain', a7: 'b:pawn-spearman', e6: 'b:knight-mirage', b7: 'b:pawn-phantom',
};
const GAME: Shot[] = [
  {
    kind: 'board',
    crowd: false,
    pos: GAME_POS,
    caption: 'my last game. white to move',
    capPos: 'bottom',
    zoom: 1,
    lead: 1300,
    steps: GAME_STEPS.map(([m, line]) => `${m}|${line}`),
    gaps: GAME_STEPS.map(([, , ms]) => ms),
    tail: 0,
    win: true,
    music: 'tense',
  },
  { kind: 'text', text: 'rate this game\n1–10 👇', ms: 2000 },
];

// The clip in the patch notes (public/assets/patch/mate.mp4): a queen that jumps like a knight
// smothers the king, in the game's own mate animation. Board only, cropped after rendering.
const PATCH_MATE: Shot[] = [
  {
    kind: 'board',
    crowd: WILD,
    pos: { ...KG, f8: 'b:rook-castle', h8: 'b:rook-fortress', f7: 'b:pawn-classic', g7: 'b:pawn-classic', h7: 'b:pawn-classic', c6: 'w:queen-amazon', d4: 'w:knight-mirage', b5: 'b:knight-galloper', a6: 'b:bishop-portal' },
    clear: ['h6'],
    steps: ['c6e7'],
    zoom: 1,
    lead: 700,
    gap: 4300,
    tail: 0,
  },
];

// "He's the only piece that can handle this situation" (a TikTok edit, on its own track): everything
// is on fire, the music holds back; on the drop the Berserk takes the queen AND the rook in one move
// and every red square goes out, then a cut on every hit. Times are the track's hits (ms): drop 6410, then
// 7010, 7520, 7850, 8200, 8520, 9200, 9710, 9870, 10220, 10540, 10890, 11220, 11560, 11890,
// 12400, 12560, 12910, 13070, 13240, 13580, 13910, 14580; the track ends at about 15.3 s.
const OP_W = {
  g1: 'w:king-classic', f2: 'w:pawn-classic', g2: 'w:pawn-classic', h2: 'w:pawn-classic', a2: 'w:pawn-spearman', b2: 'w:pawn-spearman', c2: 'w:pawn-classic',
  a1: 'w:rook-kamikaze', f1: 'w:rook-fortress', c1: 'w:bishop-ricochet',
};
const OP_B = { g8: 'b:king-classic', f7: 'b:pawn-classic', g7: 'b:pawn-classic', h7: 'b:pawn-classic', a7: 'b:pawn-classic', b6: 'b:pawn-phantom', a8: 'b:rook-classic' };
/** The situation: a mate on g2 (queen and bishop on one diagonal) and a rook on the f-file. */
const OP_BEFORE = { ...OP_W, ...OP_B, c3: 'w:knight-berserk', c8: 'b:bishop-sniper', d5: 'b:queen-classic', f6: 'b:rook-battering' };
const OP_SITUATION = { ...OP_BEFORE, c8: undefined, b7: 'b:bishop-sniper' } as unknown as Record<string, string>;
delete OP_SITUATION.c8;
/** After the move: queen and rook gone, nothing left in danger. */
const OP_AFTER = { ...OP_W, ...OP_B, b7: 'b:bishop-sniper', f6: 'w:knight-berserk' };
const FILE_F = ['f5', 'f4', 'f3', 'f2'];
const DIAG = ['c6', 'e4', 'f3', 'g2', 'h1'];
const OP_LINE = 'He’s the only piece that can take *two* in one move';
const ONLY_PIECE: Shot[] = [
  // Intro (the music holds back): the rook on the file, then the bishop lines up behind the queen.
  { kind: 'board', crowd: false, pos: OP_BEFORE, turn: 'b', steps: ['c8b7'], caption: OP_LINE, red: [FILE_F, [...FILE_F, ...DIAG]], focus: 'e5', zoom: 1.12, lead: 1690, gap: 1350, tail: 0 },
  { kind: 'board', crowd: false, pos: OP_SITUATION, steps: [], caption: OP_LINE, red: [[...FILE_F, ...DIAG]], gold: ['c3'], cam: 'tilt-l', focus: 'e4', zoom: 1.15, lead: 3370, tail: 0, bumps: [470] },
  // The drop: queen, then rook, and the danger is gone.
  { kind: 'board', crowd: false, pos: OP_SITUATION, steps: ['c3f6~'], red: [[...FILE_F, ...DIAG]], cam: 'punch', focus: 'e4', zoom: 1.45, lead: 210, gap: 1580, tail: 0, bumps: [600, 1110, 1440] },
  { kind: 'board', crowd: false, pos: OP_AFTER, turn: 'b', steps: [], gold: ['f6'], cam: 'tilt-r', focus: 'f6', zoom: 1.45, lead: 1000, tail: 0, bumps: [320] },
  { kind: 'hero', id: 'knight-berserk', text: 'Berserker', sub: 'Legendary knight', ms: 1020, bumps: [510, 670] },
  { kind: 'card', id: 'knight-berserk', ms: 1000, bumps: [320, 670] },
  { kind: 'board', crowd: false, pos: OP_SITUATION, steps: ['c3f6~'], red: [[...FILE_F, ...DIAG]], cam: 'spin', focus: 'e4', zoom: 1.5, lead: 100, gap: 1080, tail: 0, bumps: [340, 670] },
  { kind: 'hero', id: 'knight-berserk', text: '2 kills', sub: '1 move', ms: 1180, bumps: [160, 510, 670, 840] },
  { kind: 'end', text: 'Every piece has a superpower', ms: 2020, bumps: [330, 1000] },
];

// Portal edit on our own phonk (scripts/promo/phonk.py: 130 BPM, beat 461.5 ms, intro 3 bars, drop at
// 5538 ms, 5 bars, ends 15.57 s). The queen hides in a ring of guards; on the drop the Portal Bishop
// walks off the edge, comes out on the other side and takes her.
const PB_W = {
  g1: 'w:king-classic', f2: 'w:pawn-classic', g2: 'w:pawn-classic', h2: 'w:pawn-classic', a2: 'w:pawn-spearman', b2: 'w:pawn-spearman', c2: 'w:pawn-classic', d2: 'w:pawn-classic', e4: 'w:pawn-classic',
  a1: 'w:rook-kamikaze', e1: 'w:rook-fortress', b1: 'w:knight-galloper', c1: 'w:bishop-ricochet', d1: 'w:queen-classic',
};
const PB_B = {
  g8: 'b:king-classic', f7: 'b:pawn-classic', g7: 'b:pawn-classic', h7: 'b:pawn-classic', a7: 'b:pawn-classic', b7: 'b:pawn-phantom', c7: 'b:pawn-classic', d6: 'b:pawn-classic',
  a8: 'b:rook-classic', d8: 'b:rook-castle', c6: 'b:knight-mirage', e7: 'b:bishop-chain',
};
const PB_RING = ['c8', 'e8', 'c7', 'e7', 'c6', 'd6', 'e6', 'd8'];
const PB_HIDING = { ...PB_W, ...PB_B, f1: 'w:bishop-portal', f5: 'b:queen-classic' };
const PB_HIDDEN = { ...PB_W, ...PB_B, f1: 'w:bishop-portal', d7: 'b:queen-classic' };
const PB_TAKEN = { ...PB_W, ...PB_B, d7: 'w:bishop-portal' };
const PB_LINE = 'The board has edges. *He* doesn’t.';
const PORTAL_EDIT: Shot[] = [
  // Intro (muffled cowbell): the queen runs into her ring of guards.
  { kind: 'board', crowd: false, pos: PB_HIDING, turn: 'b', steps: ['f5d7'], caption: PB_LINE, red: [[], PB_RING], focus: 'd5', zoom: 1.12, lead: 1385, gap: 1384, tail: 0 },
  { kind: 'board', crowd: false, pos: PB_HIDDEN, steps: [], caption: PB_LINE, red: [PB_RING], gold: ['f1'], cam: 'tilt-l', focus: 'e4', zoom: 1.1, lead: 2769, tail: 0, bumps: [1846, 2308] },
  // The drop: off the edge at a6, out at h3, and the queen is gone.
  { kind: 'board', crowd: false, pos: PB_HIDDEN, steps: ['f1d7~'], red: [PB_RING], cam: 'punch', focus: 'd4', zoom: 1.04, lead: 390, gap: 1918, tail: 0, bumps: [923, 1846] },
  { kind: 'board', crowd: false, pos: PB_TAKEN, turn: 'b', steps: [], gold: ['d7'], cam: 'tilt-r', focus: 'd7', zoom: 1.45, lead: 923, tail: 0, bumps: [461] },
  { kind: 'hero', id: 'bishop-portal', text: 'Portal', sub: 'Legendary bishop', ms: 923, bumps: [461] },
  { kind: 'card', id: 'bishop-portal', ms: 923, bumps: [461] },
  { kind: 'board', crowd: false, pos: PB_HIDDEN, steps: ['f1d7~'], red: [PB_RING], cam: 'spin', focus: 'd4', zoom: 1.12, lead: 0, gap: 1846, tail: 0, bumps: [461, 923, 1384] },
  { kind: 'hero', id: 'bishop-portal', text: 'No walls', sub: 'Through the edge', ms: 923, bumps: [230, 461, 692] },
  { kind: 'end', text: 'Every piece has a superpower', ms: 2186, bumps: [461, 923, 1385] },
];

// "chessfx" edit (EN): the same game, a shot per move with a chess-site grade on it, each move landing
// on a beat of the author's track (136 BPM, the drop at 5480 ms, 70 beats after it). The Kamikaze's
// knight dies with the rook, so nothing travels: its blast (180 ms in) is what lands on the beat.
const FB = 60_000 / 136;
const fb = (n: number) => Math.round(n * FB);
const FX_MOVES = GAME_STEPS.map(([m]) => m);
/** Shot k of the game: everything before it already played, then its move. */
const fxMove = (k: number, o: Omit<Board, 'kind' | 'pos' | 'steps'>): Board => ({ kind: 'board', crowd: false, pos: GAME_POS, pre: FX_MOVES.slice(0, k), steps: [FX_MOVES[k]], ...o });
const FX_LINE = 'One game. Every move *rated*.';
const CHESSFX: Shot[] = [
  { kind: 'board', crowd: false, pos: GAME_POS, steps: [], caption: FX_LINE, zoom: 1.04, focus: 'd5', ms: 5480 - fb(6) },
  { kind: 'board', crowd: false, pos: GAME_POS, steps: [], caption: FX_LINE, cam: 'tilt-l', focus: 'd5', zoom: 1.3, ms: fb(6) },
  // The drop: a move every few beats, each landing on one.
  fxMove(0, { ms: fb(6), land: fb(4), cam: 'spin', focus: 'd4', zoom: 1.05, grade: { sq: 'e6', g: '!!' }, paint: ['f1', 'e6'], label: 'Portal Bishop', bumps: [fb(4)] }),
  fxMove(1, { ms: fb(4), land: fb(2), cam: 'tilt-r', focus: 'e5', zoom: 1.8, grade: { sq: 'e4', g: '?!' }, paint: ['e5', 'e4'], label: 'Stubborn Pawn', bumps: [fb(2)] }),
  fxMove(2, { ms: fb(6), land: fb(3), cam: 'punch', focus: 'c7', zoom: 1.6, grade: { sq: 'b8', g: '!!' }, paint: ['e5', 'd7', 'b8'], label: 'Berserker', bumps: [fb(2), fb(3)] }),
  fxMove(3, { ms: fb(6), land: fb(2) - 180, cam: 'tilt-l', focus: 'c3', zoom: 1.8, grade: { sq: 'c3', g: '??' }, paint: ['a4', 'c3'], label: 'Kamikaze', bumps: [fb(2), fb(3)] }),
  fxMove(4, { ms: fb(4), land: fb(2), cam: 'spin', focus: 'd4', zoom: 1.8, grade: { sq: 'd4', g: 'best' }, paint: ['b3', 'd4'], label: 'Amazon', bumps: [fb(2)] }),
  fxMove(6, { ms: fb(4), land: fb(2), cam: 'tilt-r', focus: 'e5', zoom: 2, grade: { sq: 'e5', g: '??' }, paint: ['d6', 'e5'], label: 'Free queen?', bumps: [fb(2)] }),
  fxMove(7, { ms: fb(6), land: fb(3), cam: 'punch', focus: 'd6', zoom: 1.5, grade: { sq: 'e5', g: '?!' }, paint: ['d4', 'e5'], label: 'Immortal', bumps: [fb(3), fb(4)] }),
  fxMove(8, { ms: fb(4), land: fb(2), cam: 'tilt-l', focus: 'a6', zoom: 1.9, grade: { sq: 'a6', g: '!' }, paint: ['a7', 'a6', 'a5'], label: 'Spearman', bumps: [fb(2)] }),
  fxMove(9, { ms: fb(8), land: fb(2), cam: 'spin', focus: 'e8', zoom: 1.6, grade: { sq: 'd8', g: '!!' }, paint: ['c5', 'd8'], label: 'Barricade', bumps: [fb(2), fb(3), fb(4)] }),
  fxMove(10, { ms: fb(2), land: fb(1), cam: 'tilt-r', focus: 'a5', zoom: 1.7, grade: { sq: 'a5', g: '??' }, paint: ['a6', 'a5'], bumps: [fb(1)] }),
  fxMove(11, { ms: fb(10), land: fb(2), cam: 'tilt-l', focus: 'f7', zoom: 1.5, grade: { sq: 'f6', g: '#' }, paint: ['e5', 'f6'], bumps: [fb(2), fb(4)] }),
  { kind: 'board', crowd: false, pos: GAME_POS, pre: FX_MOVES, steps: [], cam: 'spin', focus: 'd5', zoom: 1.04, ms: fb(4), bumps: [fb(2)] },
  // The end card holds through the track's last hit (36.4–37 s).
  { kind: 'end', text: 'Every piece has a superpower', ms: fb(6) + 1050, bumps: [fb(2), fb(4), fb(6) + 220] },
];

/** A line that stays over the whole video (it does not pop again on each cut). */
export const PINNED: Record<string, string> = {
  nobody: 'Розробив класну гру як проєкт\nі поділився з усіма знайомими',
  illegal: 'my chess friend\nwatching me play:',
  fine: 'me after the game:\n“gg, close one 🙂”',
  game: 'rating every move\nof my last game',
};

export const NATIVE = new Set(['satisfying', 'memes', 'cardofday', 'nobody', 'illegal', 'fine', 'game', 'patchmate', ...Object.keys(SERIES)]);

export const ADS: Record<string, Shot[]> = {
  satisfying: SATISFYING,
  nobody: NOBODY,
  illegal: ILLEGAL,
  fine: FINE,
  game: GAME,
  patchmate: PATCH_MATE,
  onlypiece: ONLY_PIECE,
  portaledit: PORTAL_EDIT,
  chessfx: CHESSFX,
  memes: MEMES,
  cardofday: CARD_OF_DAY,
  ...SERIES,
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
