// The weekly league runs on Kyiv time; every player sees those moments in their own time
// (the browser's time zone), with the weekday, since far away it can fall on another day.

import { SEASON, kyivMoment, weekWindow } from '../economy/weekly';
import { locale, t } from '../i18n';

const at = (opts: Intl.DateTimeFormatOptions) => (t: number) => new Intl.DateTimeFormat(locale(), opts).format(t);

/** "пн, 10:00", "Mon 10:00": a moment of the week in the player's time. */
export const weekMoment = at({ weekday: 'short', hour: '2-digit', minute: '2-digit' });

/** The player's offset from UTC at a moment: "UTC+3", "UTC+5:30", "UTC-4". */
export function utcOffset(t: number): string {
  const m = -new Date(t).getTimezoneOffset();
  const h = Math.floor(Math.abs(m) / 60);
  const mm = Math.abs(m) % 60;
  return `UTC${m < 0 ? '-' : '+'}${h}${mm ? `:${String(mm).padStart(2, '0')}` : ''}`;
}

/**
 * This week's opening and closing (next week's once this one has closed) in the player's time,
 * with the player's UTC offset: the week keeps Kyiv's clock, so in Warsaw it opens at 9:00 (UTC+2).
 */
export function weekSchedule(now = Date.now()): { from: string; to: string; zone: string } {
  const w = weekWindow(now);
  const shown = now < w.closesAt ? w : weekWindow(w.nextOpensAt);
  return { from: weekMoment(shown.opensAt), to: weekMoment(shown.closesAt), zone: utcOffset(shown.opensAt) };
}

/** "пн, 10:00 до пт, 22:00 (UTC+3)". */
export function weekScheduleLine(now = Date.now()): string {
  const s = weekSchedule(now);
  return `${t('{0} до {1}', s.from, s.to)} (${s.zone})`;
}

/** The season's first opening, "пн, 12 жовтня", in the player's time. */
export function seasonStart(): string {
  const [y, m, d] = SEASON.start.split('-').map(Number);
  return at({ weekday: 'short', day: 'numeric', month: 'long' })(kyivMoment(y, m, d, 10));
}
