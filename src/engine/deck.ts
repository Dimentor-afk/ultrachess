import { CARD_BY_ID, CLASSIC_CARD } from './cards';
import type { Deck, PieceType } from './types';

export const FORMATION_PRESETS = ['11112222', '22221111', '12121212', '21212121'];

export const DECK_SLOTS: { key: keyof Deck; type: PieceType; label: string }[] = [
  { key: 'rook1', type: 'rook', label: 'Тура №1' },
  { key: 'rook2', type: 'rook', label: 'Тура №2' },
  { key: 'bishop1', type: 'bishop', label: 'Слон №1' },
  { key: 'bishop2', type: 'bishop', label: 'Слон №2' },
  { key: 'knight1', type: 'knight', label: 'Кінь №1' },
  { key: 'knight2', type: 'knight', label: 'Кінь №2' },
  { key: 'queen', type: 'queen', label: 'Ферзь' },
  { key: 'king', type: 'king', label: 'Король' },
];

export function classicDeck(id = 'classic', name = 'Класична колода'): Deck {
  return {
    id,
    name,
    pawnVersions: [CLASSIC_CARD.pawn],
    pawnFormation: FORMATION_PRESETS[0],
    rook1: CLASSIC_CARD.rook,
    rook2: CLASSIC_CARD.rook,
    bishop1: CLASSIC_CARD.bishop,
    bishop2: CLASSIC_CARD.bishop,
    knight1: CLASSIC_CARD.knight,
    knight2: CLASSIC_CARD.knight,
    queen: CLASSIC_CARD.queen,
    king: CLASSIC_CARD.king,
  };
}

/** Card ids on the 16 board positions (8 pawns + 8 pieces). */
export function deckPositions(deck: Deck): string[] {
  const pawns: string[] = [];
  for (let i = 0; i < 8; i++) {
    const v = deck.pawnVersions.length === 2 && deck.pawnFormation[i] === '2' ? 1 : 0;
    pawns.push(deck.pawnVersions[v]);
  }
  return [...pawns, ...DECK_SLOTS.map((s) => deck[s.key] as string)];
}

export function mythicCount(deck: Deck): number {
  return deckPositions(deck).filter((id) => CARD_BY_ID[id]?.rarity === 'mythological').length;
}

/** Violated deck rules (spec §2.2), in Ukrainian; empty when the deck is valid. */
export function validateDeck(deck: Deck): string[] {
  const errors: string[] = [];
  if (!deck.name.trim()) errors.push('Вкажіть назву колоди.');

  const versions = deck.pawnVersions;
  if (versions.length < 1 || versions.length > 2) {
    errors.push('Для пішаків потрібно обрати 1 або 2 версії.');
  } else if (new Set(versions).size !== versions.length) {
    errors.push('Дві версії пішаків мають бути різними картками.');
  }
  for (const id of versions) {
    const c = CARD_BY_ID[id];
    if (!c || c.pieceType !== 'pawn') errors.push(`«${c?.name ?? id}» — не картка пішака.`);
  }
  if (versions.length === 2) {
    const f = deck.pawnFormation;
    if (!/^[12]{8}$/.test(f)) {
      errors.push('Формація пішаків — рядок із 8 символів «1» або «2».');
    } else if (!f.includes('1') || !f.includes('2')) {
      errors.push('Формація має використовувати обидві версії пішаків.');
    }
  }

  for (const slot of DECK_SLOTS) {
    const c = CARD_BY_ID[deck[slot.key] as string];
    if (!c) errors.push(`${slot.label}: картку не обрано.`);
    else if (c.pieceType !== slot.type) errors.push(`${slot.label}: «${c.name}» не підходить для цієї позиції.`);
  }

  if (mythicCount(deck) > 1) errors.push('У колоді може бути не більше 1 міфологічної картки.');
  return errors;
}

/** Deck board squares: 0–7 = back rank a–h, 8–15 = pawns a–h. */
export const BACK_SLOTS: (keyof Deck)[] = ['rook1', 'knight1', 'bishop1', 'queen', 'king', 'bishop2', 'knight2', 'rook2'];

export function slotType(index: number): PieceType {
  if (index >= 8) return 'pawn';
  return DECK_SLOTS.find((s) => s.key === BACK_SLOTS[index])!.type;
}

export function cardAt(deck: Deck, index: number): string {
  return index >= 8 ? deckPositions(deck)[index - 8] : (deck[BACK_SLOTS[index]] as string);
}

/** Rebuild pawn versions and formation from the 8 pawn cards (a–h). */
export function withPawns(deck: Deck, pawns: string[]): Deck {
  const versions = [...new Set(pawns)];
  const pawnFormation = versions.length === 2 ? pawns.map((p) => (p === versions[0] ? '1' : '2')).join('') : deck.pawnFormation;
  return { ...deck, pawnVersions: versions, pawnFormation };
}

export type PlaceResult = { deck: Deck; error?: undefined } | { deck?: undefined; error: string };

/**
 * Put a card on a deck square (drag & drop builder). `allPawns` fills the
 * whole pawn row. Returns an error when a deck rule would break.
 */
export function placeCard(deck: Deck, index: number, cardId: string, allPawns = false): PlaceResult {
  const card = CARD_BY_ID[cardId];
  const type = slotType(index);
  if (!card) return { error: 'Невідома картка.' };
  if (card.pieceType !== type) {
    return { error: `«${card.name}» — картка для іншої фігури. Сюди потрібна картка: ${TYPE_LABEL[type]}.` };
  }
  if (card.rarity === 'mythological') {
    const others = DECK_SLOTS.filter((s) => s.key !== BACK_SLOTS[index]).some(
      (s) => CARD_BY_ID[deck[s.key] as string]?.rarity === 'mythological',
    );
    if (others) return { error: 'У колоді вже є міфологічна картка — дозволено лише одну.' };
  }
  if (type === 'pawn') {
    let pawns = deckPositions(deck).slice(0, 8);
    if (allPawns) pawns.fill(cardId);
    else {
      const old = pawns[index - 8];
      pawns[index - 8] = cardId;
      // A third version replaces the version it was dropped on, on every square.
      if (new Set(pawns).size > 2) pawns = pawns.map((p) => (p === old ? cardId : p));
    }
    return { deck: withPawns(deck, pawns) };
  }
  return { deck: { ...deck, [BACK_SLOTS[index]]: cardId } };
}

const TYPE_LABEL: Record<PieceType, string> = {
  pawn: 'пішак',
  knight: 'кінь',
  bishop: 'слон',
  rook: 'тура',
  queen: 'ферзь',
  king: 'король',
};
