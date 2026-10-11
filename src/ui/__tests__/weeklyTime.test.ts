import { afterEach, describe, expect, it } from 'vitest';
import { kyivMoment } from '../../economy/weekly';
import { weekSchedule, weekScheduleLine } from '../weeklyTime';

const zone = process.env.TZ;
afterEach(() => {
  process.env.TZ = zone;
});

describe('weekly schedule text', () => {
  // A Wednesday of a summer week: the league runs Mon 10:00 to Fri 22:00 on Kyiv's clock.
  const now = kyivMoment(2026, 7, 15, 12);

  it('on Kyiv time, only the Kyiv line', () => {
    process.env.TZ = 'Europe/Kyiv';
    const s = weekSchedule(now);
    expect(s.local).toBeNull();
    expect(s.kyiv).toMatch(/10:00.*22:00 за Києвом/);
    expect(weekScheduleLine(now)).toBe(s.kyiv);
  });

  it('elsewhere, the same moments on the player’s clock first', () => {
    process.env.TZ = 'Europe/Warsaw';
    const s = weekSchedule(now);
    expect(s.local).toMatch(/09:00.*21:00 у вас/);
    expect(s.kyiv).toMatch(/10:00.*22:00 за Києвом/);
    expect(weekScheduleLine(now)).toBe(`${s.local} (${s.kyiv})`);
  });
});
