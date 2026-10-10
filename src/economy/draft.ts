// Драфт: a game with a friend on decks picked card by card, like the draft in Clash Royale.
// Both players pick at the same time. In each of the first four rounds (pawn, knight, bishop,
// rook) a player is offered two cards: the one they take fills their own left side (for pawns,
// four pawns), the one they leave goes to the opponent's right side. So each side ends up with
// its own picks on the left and the opponent's leftovers on the right, and does not know what
// the opponent took until the game starts. Then the crown: White picks a king (the other one goes
// to Black), Black picks a queen (the other one goes to White). No mythological cards.

import { CARDS, CLASSIC_CARD } from '../engine/cards';
import type { Card, Color, Deck, PieceType, Rarity } from '../engine/types';

/** Seconds for a pick; then a card is taken at random. */
export const DRAFT_PICK_MS = 20_000;

export type DraftKind = 'pawn' | 'knight' | 'bishop' | 'rook' | 'crown';
export const DRAFT_ROUNDS: DraftKind[] = ['pawn', 'knight', 'bishop', 'rook', 'crown'];

/** What each side is offered in a round: the crown round offers kings to White, queens to Black. */
export function roundType(round: number, color: Color): PieceType {
  const k = DRAFT_ROUNDS[round];
  return k === 'crown' ? (color === 'w' ? 'king' : 'queen') : k;
}

/** Cards that can be drafted: not classic, not mythological, not a trial's prize. */
export function draftPool(type: PieceType): Card[] {
  const classic = new Set(Object.values(CLASSIC_CARD));
  return CARDS.filter((c) => c.pieceType === type && c.rarity !== 'mythological' && !c.trialOnly && !classic.has(c.id));
}

export interface DraftState {
  white: string;
  black: string;
  /** The round being picked (0 … 4); 5 when done. */
  round: number;
  /** Per round, each side's two offers. */
  offers: Record<Color, [string, string]>[];
  /** Per round, each side's pick (null: not yet). */
  picks: Record<Color, string | null>[];
  /** When the current round's picks are taken at random. */
  deadline: number;
}

type Rnd = () => number;
const pickOne = <T>(xs: T[], rnd: Rnd): T => xs[Math.floor(rnd() * xs.length) % xs.length];

/**
 * Two offers of one rarity where the pool allows it: whichever a player takes, the opponent gets
 * a card of the same rarity, so a round never decides the game by itself.
 */
function pair(pool: Card[], taken: Set<string>, rnd: Rnd): [string, string] {
  const free = pool.filter((c) => !taken.has(c.id));
  const byRarity = new Map<Rarity, Card[]>();
  for (const c of free) byRarity.set(c.rarity, [...(byRarity.get(c.rarity) ?? []), c]);
  const twos = [...byRarity.values()].filter((xs) => xs.length >= 2);
  const from = twos.length ? pickOne(twos, rnd) : free;
  const a = pickOne(from, rnd);
  const b = pickOne(
    from.filter((c) => c.id !== a.id),
    rnd,
  );
  taken.add(a.id);
  taken.add(b.id);
  return [a.id, b.id];
}

export function newDraft(white: string, black: string, rnd: Rnd, now: number): DraftState {
  const offers = DRAFT_ROUNDS.map((_, round) => {
    const taken = new Set<string>();
    // All four cards of a round differ: a side never gets the same card from both halves.
    return { w: pair(draftPool(roundType(round, 'w')), taken, rnd), b: pair(draftPool(roundType(round, 'b')), taken, rnd) };
  });
  return { white, black, round: 0, offers, picks: DRAFT_ROUNDS.map(() => ({ w: null, b: null })), deadline: now + DRAFT_PICK_MS };
}

export const draftDone = (d: DraftState) => d.round >= DRAFT_ROUNDS.length;

/** The card a side did not take in a round (goes to the opponent). */
export function leftover(d: DraftState, round: number, color: Color): string | null {
  const p = d.picks[round][color];
  return p ? d.offers[round][color].find((x) => x !== p)! : null;
}

function advance(d: DraftState, now: number): DraftState {
  const r = d.picks[d.round];
  if (!r.w || !r.b) return d;
  const round = d.round + 1;
  return { ...d, round, deadline: now + DRAFT_PICK_MS };
}

/** A side takes one of its two offers. Throws a Ukrainian message when it cannot. */
export function pickCard(d: DraftState, color: Color, cardId: string, now: number): DraftState {
  if (draftDone(d)) throw new Error('Драфт уже завершено.');
  if (d.picks[d.round][color]) throw new Error('Ви вже вибрали в цьому раунді.');
  if (!d.offers[d.round][color].includes(cardId)) throw new Error('Цієї картки немає серед ваших варіантів.');
  const picks = d.picks.map((p, i) => (i === d.round ? { ...p, [color]: cardId } : p));
  return advance({ ...d, picks }, now);
}

/** Rounds whose time ran out: the missing picks are taken at random (each next round gets its full time). */
export function settleTimeouts(d: DraftState, now: number, rnd: Rnd): DraftState {
  let next = d;
  while (!draftDone(next) && now >= next.deadline) {
    const at = next.deadline;
    for (const c of ['w', 'b'] as Color[]) {
      if (!next.picks[next.round][c]) {
        const picks = next.picks.map((p, i) => (i === next.round ? { ...p, [c]: pickOne(next.offers[next.round][c], rnd) } : p));
        next = { ...next, picks };
      }
    }
    next = advance(next, at);
  }
  return next;
}

/**
 * The decks the draft built. White's left is files a–d, Black's is h–e (it sits on the other side):
 * a–d hold White's picks and Black's leftovers, e–h Black's picks and White's leftovers.
 */
export function draftDecks(d: DraftState): Record<Color, Deck> {
  const take = (round: number, c: Color) => d.picks[round][c]!;
  const left = (round: number, c: Color) => leftover(d, round, c)!;
  const w: Deck = {
    id: 'draft-w',
    name: 'Драфт',
    pawnVersions: [take(0, 'w'), left(0, 'b')],
    pawnFormation: '11112222',
    knight1: take(1, 'w'),
    knight2: left(1, 'b'),
    bishop1: take(2, 'w'),
    bishop2: left(2, 'b'),
    rook1: take(3, 'w'),
    rook2: left(3, 'b'),
    king: take(4, 'w'),
    queen: left(4, 'b'),
  };
  const b: Deck = {
    id: 'draft-b',
    name: 'Драфт',
    pawnVersions: [take(0, 'b'), left(0, 'w')],
    pawnFormation: '22221111',
    knight1: left(1, 'w'),
    knight2: take(1, 'b'),
    bishop1: left(2, 'w'),
    bishop2: take(2, 'b'),
    rook1: left(3, 'w'),
    rook2: take(3, 'b'),
    king: left(4, 'w'),
    queen: take(4, 'b'),
  };
  return { w, b };
}

/** One side's view of the draft: its own offers and picks, what came from the opponent, never the opponent's picks. */
export interface DraftView {
  id: string;
  color: Color;
  round: number;
  done: boolean;
  /** Ms left for the current round. */
  left: number;
  /** This round's two offers (empty when done). */
  offers: string[];
  /** My pick this round (null: not yet). */
  picked: string | null;
  /** The opponent has picked this round. */
  theyPicked: boolean;
  /** Per finished round: what I took, what I gave away, what I got from the opponent. */
  rounds: { kind: DraftKind; took: string; gave: string; got: string }[];
  /** The game, once the draft is over. */
  pvpId: string | null;
  /** Both decks, once the draft is over (the opponent's picks are no secret then). */
  decks: Record<Color, Deck> | null;
}

export function draftView(d: DraftState, id: string, color: Color, now: number, pvpId: string | null): DraftView {
  const other: Color = color === 'w' ? 'b' : 'w';
  const done = draftDone(d);
  const rounds: DraftView['rounds'] = [];
  for (let i = 0; i < Math.min(d.round, DRAFT_ROUNDS.length); i++) {
    rounds.push({ kind: DRAFT_ROUNDS[i], took: d.picks[i][color]!, gave: leftover(d, i, color)!, got: leftover(d, i, other)! });
  }
  return {
    id,
    color,
    round: d.round,
    done,
    left: done ? 0 : Math.max(0, d.deadline - now),
    offers: done ? [] : [...d.offers[d.round][color]],
    picked: done ? null : d.picks[d.round][color],
    theyPicked: !done && !!d.picks[d.round][other],
    rounds,
    pvpId,
    decks: done ? draftDecks(d) : null,
  };
}

export function parseDraft(json: string): DraftState | null {
  if (!json) return null;
  try {
    const d = JSON.parse(json) as DraftState;
    return d && Array.isArray(d.offers) && Array.isArray(d.picks) ? d : null;
  } catch {
    return null;
  }
}

// ── The lineup as it fills in ──

/** Deck squares (0–7 back rank a–h, 8–15 pawns a–h) a side's own pick takes in a round. */
export function ownSquares(color: Color, kind: DraftKind): number[] {
  const w = color === 'w';
  switch (kind) {
    case 'pawn':
      return w ? [8, 9, 10, 11] : [12, 13, 14, 15];
    case 'knight':
      return [w ? 1 : 6];
    case 'bishop':
      return [w ? 2 : 5];
    case 'rook':
      return [w ? 0 : 7];
    case 'crown':
      // White's pick is its king (e), Black's its queen (d).
      return [w ? 4 : 3];
  }
}

/** The opponent's leftover lands where the opponent's own pick would sit on its side. */
export const gotSquares = (color: Color, kind: DraftKind) => ownSquares(color === 'w' ? 'b' : 'w', kind);

/**
 * Both lineups as one side knows them: its own deck fills in round by round; the opponent's
 * shows only what this side gave away (null: not drafted yet, or the opponent's secret pick).
 */
export function draftBoard(v: Pick<DraftView, 'color' | 'rounds' | 'decks'>): Record<Color, (string | null)[]> {
  const me = v.color;
  const them: Color = me === 'w' ? 'b' : 'w';
  if (v.decks) {
    const full = (d: Deck) => [
      ...(['rook1', 'knight1', 'bishop1', 'queen', 'king', 'bishop2', 'knight2', 'rook2'] as const).map((k) => d[k]),
      ...deckPawns(d),
    ];
    return { [me]: full(v.decks[me]), [them]: full(v.decks[them]) } as Record<Color, string[]>;
  }
  const mine: (string | null)[] = Array(16).fill(null);
  const theirs: (string | null)[] = Array(16).fill(null);
  for (const r of v.rounds) {
    for (const i of ownSquares(me, r.kind)) mine[i] = r.took;
    for (const i of gotSquares(me, r.kind)) mine[i] = r.got;
    for (const i of gotSquares(them, r.kind)) theirs[i] = r.gave;
  }
  return { [me]: mine, [them]: theirs } as Record<Color, (string | null)[]>;
}

function deckPawns(d: Deck): string[] {
  return Array.from({ length: 8 }, (_, i) => d.pawnVersions[d.pawnVersions.length === 2 && d.pawnFormation[i] === '2' ? 1 : 0]);
}
