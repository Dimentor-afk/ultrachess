// The weekly league runs on Kyiv time; every player sees those moments in their own time
// (the browser's time zone), with the weekday, since far away it can fall on another day.

import { SEASON, kyivMoment, weekWindow } from '../economy/weekly';
import { locale } from '../i18n';

const at = (opts: Intl.DateTimeFormatOptions) => (t: number) => new Intl.DateTimeFormat(locale(), opts).format(t);

/** "пн, 10:00", "Mon 10:00": a moment of the week in the player's time. */
export const weekMoment = at({ weekday: 'short', hour: '2-digit', minute: '2-digit' });

/** This week's opening and closing (next week's once this one has closed), in the player's time. */
export function weekSchedule(now = Date.now()): { from: string; to: string } {
  const w = weekWindow(now);
  const shown = now < w.closesAt ? w : weekWindow(w.nextOpensAt);
  return { from: weekMoment(shown.opensAt), to: weekMoment(shown.closesAt) };
}

/** The season's first opening, "пн, 12 жовтня", in the player's time. */
export function seasonStart(): string {
  const [y, m, d] = SEASON.start.split('-').map(Number);
  return at({ weekday: 'short', day: 'numeric', month: 'long' })(kyivMoment(y, m, d, 10));
}
