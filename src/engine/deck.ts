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
