import { classicDeck, validateDeck } from '../engine/deck';
import type { Deck } from '../engine/types';

// Decks live in this browser only (accounts are out of scope, spec §1).
const DECKS_KEY = 'ultrachess.decks.v1';
const ACTIVE_KEY = 'ultrachess.activeDeck.v1';

export const CLASSIC_DECK = classicDeck();

export function loadDecks(): Deck[] {
  try {
    const raw = localStorage.getItem(DECKS_KEY);
    const list = raw ? (JSON.parse(raw) as Deck[]) : [];
    return Array.isArray(list) ? list.filter((d) => d && validateDeck(d).length === 0) : [];
  } catch {
    return [];
  }
}

export function saveDecks(decks: Deck[]): void {
  try {
    localStorage.setItem(DECKS_KEY, JSON.stringify(decks));
  } catch {
    // Storage unavailable (private mode): decks live for this session only.
  }
}

export function loadActiveDeckId(): string {
  try {
    return localStorage.getItem(ACTIVE_KEY) ?? CLASSIC_DECK.id;
  } catch {
    return CLASSIC_DECK.id;
  }
}

export function saveActiveDeckId(id: string): void {
  try {
    localStorage.setItem(ACTIVE_KEY, id);
  } catch {
    // ignore
  }
}

export function allDecks(saved: Deck[]): Deck[] {
  return [CLASSIC_DECK, ...saved];
}

export function newDeckId(): string {
  return `deck-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}
