// Skins: another look for a card's piece. A skin is won (the weekly league), not bought; the player
// picks one per card in the deck page, and both players see it on the board.

export interface Skin {
  id: string;
  /** The card it dresses. */
  card: string;
  name: string;
  /** 1 the plainest … 5 the finest of its card's set. */
  tier: 1 | 2 | 3 | 4 | 5;
  /** Image (a detailed sprite, drawn smooth rather than pixelated). */
  art: string;
}

export const SKINS: Skin[] = [
  { id: 'berserk-1', card: 'knight-berserk', name: 'Ветеран', tier: 1, art: 'assets/skins/berserk-1.png' },
  { id: 'berserk-2', card: 'knight-berserk', name: 'Сталева лють', tier: 2, art: 'assets/skins/berserk-2.png' },
  { id: 'berserk-3', card: 'knight-berserk', name: 'Кривавий чемпіон', tier: 3, art: 'assets/skins/berserk-3.png' },
  { id: 'berserk-4', card: 'knight-berserk', name: 'Пекельний', tier: 4, art: 'assets/skins/berserk-4.png' },
  { id: 'berserk-5', card: 'knight-berserk', name: 'Рагнарок', tier: 5, art: 'assets/skins/berserk-5.png' },
];

export const SKIN_BY_ID: Record<string, Skin> = Object.fromEntries(SKINS.map((s) => [s.id, s]));

export function skinsOfCard(cardId: string): Skin[] {
  return SKINS.filter((s) => s.card === cardId);
}

/** Gold paid instead of a skin the player already has. */
export const SKIN_DUPE_GOLD = 100;

/** A side's skins on the board: card id → skin id. */
export type SkinChoice = Record<string, string>;

/** The choice kept for a player, without skins they do not own (or that no longer exist). */
export function skinChoiceOf(choiceJson: string, ownedJson: string): SkinChoice {
  let choice: SkinChoice = {};
  let owned: string[] = [];
  try {
    choice = JSON.parse(choiceJson || '{}');
    owned = JSON.parse(ownedJson || '[]');
  } catch {
    return {};
  }
  const out: SkinChoice = {};
  for (const [card, id] of Object.entries(choice)) if (owned.includes(id) && SKIN_BY_ID[id]?.card === card) out[card] = id;
  return out;
}

export function ownedSkins(ownedJson: string): string[] {
  try {
    const xs = JSON.parse(ownedJson || '[]');
    return Array.isArray(xs) ? xs.filter((x): x is string => typeof x === 'string' && !!SKIN_BY_ID[x]) : [];
  } catch {
    return [];
  }
}
