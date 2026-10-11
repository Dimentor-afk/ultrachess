// The weekly league runs on Kyiv time; every player sees those moments in their own time
// (the browser's time zone), with the weekday, since far away it can fall on another day.

import { SEASON, WEEKLY_TZ, kyivMoment, weekWindow } from '../economy/weekly';
import { locale, t } from '../i18n';

const at = (opts: Intl.DateTimeFormatOptions) => (t: number) => new Intl.DateTimeFormat(locale(), opts).format(t);

/** "пн, 10:00", "Mon 10:00": a moment of the week in the player's time. */
export const weekMoment = at({ weekday: 'short', hour: '2-digit', minute: '2-digit' });

/** The same moment on Kyiv's clock. */
const kyivMomentText = at({ weekday: 'short', hour: '2-digit', minute: '2-digit', timeZone: WEEKLY_TZ });

/**
 * This week's opening and closing (next week's once this one has closed): in the player's time,
 * and on Kyiv's clock, which the week keeps (Mon 10:00 in Kyiv is Mon 9:00 in Warsaw).
 */
export function weekSchedule(now = Date.now()) {
  const w = weekWindow(now);
  const shown = now < w.closesAt ? w : weekWindow(w.nextOpensAt);
  const local = { from: weekMoment(shown.opensAt), to: weekMoment(shown.closesAt) };
  const kyiv = { from: kyivMomentText(shown.opensAt), to: kyivMomentText(shown.closesAt) };
  const sameAsKyiv = local.from === kyiv.from && local.to === kyiv.to;
  return {
    /** "пн, 09:00 до пт, 21:00 у вас" (or, on Kyiv's clock, the Kyiv line alone). */
    local: sameAsKyiv ? null : t('{0} до {1} у вас', local.from, local.to),
    /** "пн, 10:00 до пт, 22:00 за Києвом". */
    kyiv: t('{0} до {1} за Києвом', kyiv.from, kyiv.to),
  };
}

/** The schedule in one line: the player's time first, Kyiv's in brackets. */
export function weekScheduleLine(now = Date.now()): string {
  const s = weekSchedule(now);
  return s.local ? `${s.local} (${s.kyiv})` : s.kyiv;
}

/** The season's first opening, "пн, 12 жовтня", in the player's time. */
export function seasonStart(): string {
  const [y, m, d] = SEASON.start.split('-').map(Number);
  return at({ weekday: 'short', day: 'numeric', month: 'long' })(kyivMoment(y, m, d, 10));
}
