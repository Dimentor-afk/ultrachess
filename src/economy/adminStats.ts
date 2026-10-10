// Admin statistics: who plays, what is played, which cards win and which do
// the work (moves, captures, button presses), so balance changes rest on data.
// Pure: the service hands in the rows, this adds them up.

import { CARDS, CARD_BY_ID } from '../engine/cards';
import type { Action } from '../engine/match';
import { setupPosition } from '../engine/position';
import type { Color, Deck } from '../engine/types';
import type { MatchRow, PvpRow, UserRow } from './store';
import type { PurchaseRow } from './payments';

export type GameKind = 'bot' | 'training' | 'trial' | 'ranked' | 'friend';

export interface CardStat {
  id: string;
  /** Sides (one player in one game) whose deck had the card. */
  games: number;
  /** Of those, won (a draw counts as half). */
  score: number;
  /** The same in games between people only (the fairest test of a card). */
  pvpGames: number;
  pvpScore: number;
  /** Moves made by pieces of this card, the pieces they took, and button presses. */
  moves: number;
  captures: number;
  abilities: number;
  /** Players whose active deck holds it right now. */
  inDecks: number;
}

export interface AdminStats {
  days: number;
  players: { total: number; fresh: number; active: number; day: number };
  games: {
    total: number;
    byKind: Record<GameKind, number>;
    avgMoves: number;
    draws: number;
    /** Wins of white in games between people (first-move advantage). */
    pvpWhiteScore: number;
    pvpGames: number;
    /** Games per UTC day, oldest first (the last 14 days). */
    perDay: { day: string; games: number }[];
    /** How games end: mate, resignation, stalemate, … */
    reasons: Record<string, number>;
  };
  /** How players do against each bot level. */
  bots: { level: number; games: number; score: number }[];
  cards: CardStat[];
  referrals: {
    invited: number;
    played: number;
    top: { name: string; invited: number; played: number }[];
    /** Inviters whose friends signed up in a bunch on one day and never played (fake accounts?). */
    suspicious: { name: string; day: string; count: number }[];
  };
  economy: { gold: number; shards: number; purchases: number; revenue: number; buyers: number };
}

const DAY = 864e5;
const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);

function emptyCard(id: string): CardStat {
  return { id, games: 0, score: 0, pvpGames: 0, pvpScore: 0, moves: 0, captures: 0, abilities: 0, inDecks: 0 };
}

/** The distinct cards of a deck. */
function deckCards(d: Deck): string[] {
  return [...new Set([...d.pawnVersions, d.rook1, d.rook2, d.bishop1, d.bishop2, d.knight1, d.knight2, d.queen, d.king])].filter((id) => CARD_BY_ID[id]);
}

export function computeAdminStats(input: {
  now: number;
  days: number;
  users: UserRow[];
  activeDecks: Deck[];
  matches: MatchRow[];
  pvp: PvpRow[];
  purchases: PurchaseRow[];
}): AdminStats {
  const { now, days, users, activeDecks, matches, pvp, purchases } = input;
  const since = days ? now - days * DAY : 0;
  const real = users.filter((u) => u.passHash && !u.deleted);
  const cards = new Map(CARDS.map((c) => [c.id, emptyCard(c.id)]));
  const byKind: Record<GameKind, number> = { bot: 0, training: 0, trial: 0, ranked: 0, friend: 0 };
  const reasons: Record<string, number> = {};
  const perDay = new Map<string, number>();
  const bots = new Map<number, { games: number; score: number }>();
  let moves = 0;
  let draws = 0;
  let pvpWhite = 0;
  let pvpGames = 0;

  /** One side's deck in a finished game: games and score for its cards. */
  const side = (deck: Deck, score: number, isPvp: boolean) => {
    for (const id of deckCards(deck)) {
      const c = cards.get(id)!;
      c.games++;
      c.score += score;
      if (isPvp) {
        c.pvpGames++;
        c.pvpScore += score;
      }
    }
  };
  /** Moves, captures and presses of each card, from the record (piece ids come from the setup). */
  const actions = (white: Deck, black: Deck, list: Action[], only?: Color) => {
    let owner: Map<string, string>;
    try {
      owner = new Map(setupPosition(white, black).board.filter((p) => p).map((p) => [p!.id, p!.cardId]));
    } catch {
      return;
    }
    for (const a of list) {
      const id = a.type === 'move' ? a.move.pieceId : a.type === 'ability' ? a.pieceId : null;
      if (!id || (only && !id.startsWith(`${only}-`))) continue;
      const c = cards.get(owner.get(id) ?? '');
      if (!c) continue;
      if (a.type === 'move') {
        c.moves++;
        c.captures += a.move.captures.length;
      } else c.abilities++;
    }
  };
  const game = (at: number, reason: string, n: number, winner: Color | null, kind: GameKind) => {
    byKind[kind]++;
    reasons[reason] = (reasons[reason] ?? 0) + 1;
    moves += n;
    if (winner === null) draws++;
    perDay.set(dayOf(at), (perDay.get(dayOf(at)) ?? 0) + 1);
  };

  for (const m of matches) {
    if (m.createdAt < since || !m.result) continue;
    const r = JSON.parse(m.result) as { outcome: 'win' | 'loss' | 'draw'; reason: string; moves: number };
    const mode = m.mode || (m.ranked ? 'bot' : 'training');
    const kind: GameKind = mode.startsWith('trial:') ? 'trial' : mode === 'bot' ? 'bot' : 'training';
    const score = r.outcome === 'win' ? 1 : r.outcome === 'draw' ? 0.5 : 0;
    game(m.createdAt, r.reason, r.moves ?? 0, r.outcome === 'draw' ? null : r.outcome === 'win' ? m.color : m.color === 'w' ? 'b' : 'w', kind);
    // Bot-ladder levels lie between presets (the trophies): count them with the nearest one.
    const level = Math.round(m.botLevel);
    const b = bots.get(level) ?? { games: 0, score: 0 };
    b.games++;
    b.score += score;
    bots.set(level, b);
    // The classic trial plays fixed decks: they say nothing about the cards.
    if (mode === 'trial:classic') continue;
    side(m.playerDeck, score, false);
    const [w, bl] = m.color === 'w' ? [m.playerDeck, m.botDeck] : [m.botDeck, m.playerDeck];
    actions(w, bl, m.actions, m.color);
  }
  for (const p of pvp) {
    if (p.updatedAt < since || !p.result) continue;
    const r = JSON.parse(p.result) as { winner: Color | null; reason: string; moves: number };
    game(p.updatedAt, r.reason, r.moves ?? 0, r.winner, p.ranked ? 'ranked' : 'friend');
    const ws = r.winner === null ? 0.5 : r.winner === 'w' ? 1 : 0;
    side(p.whiteDeck, ws, true);
    side(p.blackDeck, 1 - ws, true);
    pvpGames++;
    pvpWhite += ws;
    actions(p.whiteDeck, p.blackDeck, JSON.parse(p.actions) as Action[]);
  }
  for (const d of activeDecks) for (const id of deckCards(d)) cards.get(id)!.inDecks++;

  const total = Object.values(byKind).reduce((a, b) => a + b, 0);
  const days14: { day: string; games: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const day = dayOf(now - i * DAY);
    days14.push({ day, games: perDay.get(day) ?? 0 });
  }

  // Invites: everyone who came through a link (all time) and how far they got.
  const invited = real.filter((u) => u.referredBy);
  const byInviter = new Map<string, UserRow[]>();
  for (const u of invited) byInviter.set(u.referredBy, [...(byInviter.get(u.referredBy) ?? []), u]);
  const nameOf = (id: string) => users.find((u) => u.id === id)?.name ?? '?';
  const top = [...byInviter.entries()]
    .map(([id, list]) => ({ name: nameOf(id), invited: list.length, played: list.filter((u) => u.refStage >= 2).length }))
    .sort((a, b) => b.invited - a.invited)
    .slice(0, 15);
  const suspicious: AdminStats['referrals']['suspicious'] = [];
  for (const [id, list] of byInviter) {
    const perDayJoined = new Map<string, UserRow[]>();
    for (const u of list) perDayJoined.set(dayOf(u.createdAt), [...(perDayJoined.get(dayOf(u.createdAt)) ?? []), u]);
    for (const [day, joined] of perDayJoined) {
      if (joined.length >= 3 && joined.every((u) => u.refGames === 0)) suspicious.push({ name: nameOf(id), day, count: joined.length });
    }
  }

  const paid = purchases.filter((p) => p.status === 'paid' && p.createdAt >= since);
  return {
    days,
    players: {
      total: real.length,
      fresh: real.filter((u) => u.createdAt >= since).length,
      active: real.filter((u) => u.lastSeen >= since).length,
      day: real.filter((u) => u.lastSeen >= now - DAY).length,
    },
    games: {
      total,
      byKind,
      avgMoves: total ? Math.round((moves / total) * 10) / 10 : 0,
      draws,
      pvpWhiteScore: pvpWhite,
      pvpGames,
      perDay: days14,
      reasons,
    },
    bots: [...bots.entries()].map(([level, b]) => ({ level, ...b })).sort((a, b) => a.level - b.level),
    cards: [...cards.values()],
    referrals: { invited: invited.length, played: invited.filter((u) => u.refStage >= 2).length, top, suspicious },
    economy: {
      gold: real.reduce((a, u) => a + u.gold, 0),
      shards: real.reduce((a, u) => a + u.shards, 0),
      purchases: paid.length,
      revenue: paid.reduce((a, p) => a + p.amount, 0),
      buyers: new Set(paid.map((p) => p.userId)).size,
    },
  };
}
