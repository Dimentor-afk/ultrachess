import { afterEach, describe, expect, it } from 'vitest';
import { kyivMoment } from '../../economy/weekly';
import { utcOffset, weekScheduleLine } from '../weeklyTime';

const zone = process.env.TZ;
afterEach(() => {
  process.env.TZ = zone;
});

describe('weekly schedule text', () => {
  // A Wednesday of a summer week: the league runs Mon 10:00 to Fri 22:00 on Kyiv's clock.
  const now = kyivMoment(2026, 7, 15, 12);

  it('in Kyiv: 10:00 to 22:00, UTC+3', () => {
    process.env.TZ = 'Europe/Kyiv';
    expect(weekScheduleLine(now)).toMatch(/10:00 до .*22:00 \(UTC\+3\)$/);
  });

  it('elsewhere the same moments on the player’s clock, with its offset', () => {
    process.env.TZ = 'Europe/Warsaw';
    expect(weekScheduleLine(now)).toMatch(/09:00 до .*21:00 \(UTC\+2\)$/);
    process.env.TZ = 'America/New_York';
    expect(weekScheduleLine(now)).toMatch(/03:00 до .*15:00 \(UTC-4\)$/);
    process.env.TZ = 'Asia/Kolkata';
    expect(utcOffset(now)).toBe('UTC+5:30');
  });
});
