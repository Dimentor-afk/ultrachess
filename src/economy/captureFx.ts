// Capture effects sold for gold: what plays when your piece takes another.

export interface CaptureFx {
  id: string;
  name: string;
  /** Sprite strip in public/assets/fx. */
  sprite: string;
  price: number;
}

export const CAPTURE_FX: CaptureFx[] = [
  { id: 'impact', name: 'Удар', sprite: 'capture', price: 0 },
  { id: 'blast', name: 'Вибух', sprite: 'cap_blast', price: 250 },
  { id: 'plasma', name: 'Плазма', sprite: 'cap_plasma', price: 400 },
  { id: 'lightning', name: 'Блискавка', sprite: 'cap_lightning', price: 500 },
  { id: 'skull', name: 'Череп', sprite: 'cap_skull', price: 700 },
  { id: 'hearts', name: 'Сердечка', sprite: 'cap_hearts', price: 700 },
  { id: 'coins', name: 'Джекпот', sprite: 'cap_coins', price: 900 },
  { id: 'geyser', name: 'Гейзер', sprite: 'cap_geyser', price: 1100 },
  { id: 'spear', name: 'Вогняний спис', sprite: 'cap_spear', price: 1400 },
  { id: 'epic', name: 'Епічний вибух', sprite: 'cap_epic', price: 2000 },
];

export const DEFAULT_CAPTURE_FX = 'impact';

export function captureFxById(id: string | null | undefined): CaptureFx {
  return CAPTURE_FX.find((f) => f.id === id) ?? CAPTURE_FX[0];
}
