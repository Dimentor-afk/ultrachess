// Board colour themes sold for gold in the shop.

export interface BoardTheme {
  id: string;
  name: string;
  light: string;
  dark: string;
  /** Price in gold; 0 = owned by everyone. */
  price: number;
}

export const BOARD_THEMES: BoardTheme[] = [
  { id: 'classic', name: 'Класична', light: '#ecdcb9', dark: '#a57a52', price: 0 },
  { id: 'emerald', name: 'Смарагдова', light: '#eeeed2', dark: '#769656', price: 300 },
  { id: 'ocean', name: 'Океан', light: '#dee3e6', dark: '#7d9bb0', price: 500 },
  { id: 'sand', name: 'Пустеля', light: '#f4e4bc', dark: '#c79a5b', price: 500 },
  { id: 'sakura', name: 'Сакура', light: '#fbe4ea', dark: '#d58ca3', price: 800 },
  { id: 'ice', name: 'Крига', light: '#e8f5fb', dark: '#86b6d3', price: 800 },
  { id: 'night', name: 'Ніч', light: '#a9b3d6', dark: '#4a5584', price: 1200 },
  { id: 'lava', name: 'Лава', light: '#f7c894', dark: '#b2472e', price: 1500 },
  { id: 'toxic', name: 'Отрута', light: '#d9f2a6', dark: '#5f8f3a', price: 1500 },
  { id: 'royal', name: 'Королівська', light: '#f3d98b', dark: '#6b3fa0', price: 2500 },
];

export const DEFAULT_THEME = 'classic';

export function themeById(id: string | null | undefined): BoardTheme {
  return BOARD_THEMES.find((t) => t.id === id) ?? BOARD_THEMES[0];
}
