// Everything the engine says (card texts, ability names, move labels, history lines,
// ability choices, leagues, bots) must come out translated in every language.
import { afterAll, describe, expect, it } from 'vitest';
import { ABILITY_DEFS, abilityOptions, abilityPieces, abilityReady } from '../../engine/abilities';
import { BOT_LEVELS } from '../../engine/bot/levels';
import { CARDS, EFFECT_NAMES } from '../../engine/cards';
import { DECK_SLOTS, classicDeck, validateDeck } from '../../engine/deck';
import { legalMoves } from '../../engine/legal';
import { createMatch, performAction, type MatchState } from '../../engine/match';
import type { Deck, PieceType } from '../../engine/types';
import { LEAGUES } from '../../economy/leagues';
import { loadLang, t, tr } from '..';

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = a;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/** Decks that together hold every card: the i-th card of each slot's pool, round robin. */
function deckNo(i: number, r: () => number): Deck {
  for (let tries = 0; tries < 30; tries++) {
    const deck = classicDeck('t', 'T');
    const pick = (type: PieceType, k: number) => {
      const pool = CARDS.filter((c) => c.pieceType === type);
      return pool[(i + k + tries) % pool.length].id;
    };
    const a = pick('pawn', 0);
    const b = pick('pawn', 3);
    deck.pawnVersions = a === b ? [a] : [a, b];
    deck.pawnFormation = '12121212';
    DECK_SLOTS.forEach((s, k) => ((deck as unknown as Record<string, string>)[s.key] = pick(s.type, k)));
    if (!validateDeck(deck).length) return deck;
    void r;
  }
  return classicDeck('t', 'T');
}

/** Engine texts seen while playing random games (moves, abilities, history). */
function collect(): Set<string> {
  const out = new Set<string>();
  for (let g = 0; g < Number(process.env.GAMES ?? 24); g++) {
    const r = rng(g + 1);
    let s: MatchState = createMatch(deckNo(g, r), deckNo(g + 7, r));
    for (let ply = 0; ply < 120 && !s.result; ply++) {
      const pc = s.pending.find((p) => p.color === s.turn);
      if (pc) {
        s = performAction(s, { type: 'choose', square: pc.options[Math.floor(r() * pc.options.length)] });
        continue;
      }
      const abilities = abilityPieces(s, s.turn).filter(({ piece, def }) => !def.viaMove && abilityReady(s, piece.id));
      if (abilities.length && r() < 0.3) {
        const { piece } = abilities[Math.floor(r() * abilities.length)];
        const opts = abilityOptions(s, piece.id);
        opts.forEach((o) => out.add(o.label));
        if (opts.length) {
          try {
            s = performAction(s, { type: 'ability', pieceId: piece.id, key: opts[Math.floor(r() * opts.length)].key });
          } catch {
            // Not allowed right now: play a move instead.
          }
        }
      }
      if (s.result || s.pending.some((p) => p.color === s.turn)) continue;
      const moves = legalMoves(s);
      if (!moves.length) break;
      moves.forEach((m) => out.add(m.label));
      s = performAction(s, { type: 'move', move: moves[Math.floor(r() * moves.length)] });
    }
    s.history.forEach((h) => out.add(h.text ?? ''));
    if (s.result) out.add(s.result.reason);
  }
  return out;
}

const UK = /[ґєіїҐЄІЇа-яА-Я]/;

describe('engine text in every language', () => {
  const seen = [...collect()].filter(Boolean);
  const fixed = [
    ...CARDS.flatMap((c) => [c.name, c.rulesText]),
    ...Object.values(ABILITY_DEFS).map((d) => d.name),
    ...Object.values(EFFECT_NAMES),
    ...BOT_LEVELS.map((b) => b.name),
    ...LEAGUES.bot.map((l) => l.name),
    ...LEAGUES.pvp.map((l) => l.name),
  ];
  afterAll(() => loadLang('uk'));

  for (const lang of ['en', 'de', 'it', 'es'] as const) {
    it(`${lang}: nothing stays in Ukrainian`, async () => {
      await loadLang(lang);
      const left = [...new Set([...fixed.map((x) => t(x)), ...seen.map((x) => tr(x))].filter((x) => UK.test(x)))];
      expect(left).toEqual([]);
    });
  }
});
