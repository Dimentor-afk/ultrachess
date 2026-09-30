import { describe, expect, it } from 'vitest';
import { CAPTURE_FX } from '../captureFx';
import { DAILY_SLOTS, dailyPicks, dayOf, shopOffer } from '../dailyShop';
import { BOARD_THEMES } from '../themes';

const DAY = 864e5;
const paidThemes = BOARD_THEMES.filter((t) => t.price > 0).map((t) => t.id);
const paidFx = CAPTURE_FX.filter((f) => f.price > 0).map((f) => f.id);

describe('daily shop', () => {
  it('offers three paid boards and three paid effects', () => {
    const o = shopOffer(Date.UTC(2026, 8, 30, 12));
    expect(o.themes).toHaveLength(DAILY_SLOTS);
    expect(o.fx).toHaveLength(DAILY_SLOTS);
    expect(new Set(o.themes).size).toBe(DAILY_SLOTS);
    expect(new Set(o.fx).size).toBe(DAILY_SLOTS);
    for (const id of o.themes) expect(paidThemes).toContain(id);
    for (const id of o.fx) expect(paidFx).toContain(id);
  });

  it('is the same all day and changes at UTC midnight', () => {
    const morning = shopOffer(Date.UTC(2026, 8, 30, 0, 0, 1));
    const night = shopOffer(Date.UTC(2026, 8, 30, 23, 59, 59));
    expect(night).toEqual(morning);
    expect(morning.refreshAt).toBe(Date.UTC(2026, 9, 1));
    expect(shopOffer(Date.UTC(2026, 9, 1)).day).toBe(morning.day + 1);
  });

  it('never repeats an item on two days in a row', () => {
    const start = dayOf(Date.UTC(2026, 0, 1));
    for (let d = start; d < start + 800; d++) {
      const a = shopOffer(d * DAY);
      const b = shopOffer((d + 1) * DAY);
      expect(a.themes.filter((id) => b.themes.includes(id))).toEqual([]);
      expect(a.fx.filter((id) => b.fx.includes(id))).toEqual([]);
    }
  });

  it('shows every item within one cycle', () => {
    // 15 boards → a 5-day cycle; 9 effects → a 3-day cycle.
    const themeDays = Math.floor(paidThemes.length / DAILY_SLOTS);
    const start = themeDays * 1000;
    const seen = new Set<string>();
    for (let d = start; d < start + themeDays; d++) for (const id of dailyPicks(paidThemes, d, 'themes')) seen.add(id);
    expect(seen.size).toBe(themeDays * DAILY_SLOTS);
  });

  it('small pools still work', () => {
    expect(dailyPicks(['a', 'b'], 5, 'x')).toEqual(['a', 'b']);
    expect(dailyPicks(['a', 'b', 'c', 'd', 'e'], 5, 'x')).toHaveLength(3);
  });
});
