import type { HistoryRow } from '../api/client';
import { locale, t, tr } from '../i18n';

const KIND: Record<HistoryRow['kind'], string> = { ranked: t('Ліга гравців'), bot: t('Ліга ботів'), training: t('Тренування'), friend: t('Друг'), trial: t('Випробування') };
const OUTCOME: Record<HistoryRow['outcome'], string> = { win: t('Перемога'), loss: t('Поразка'), draw: t('Нічия') };

/** Finished games, newest first; each opens its replay (#/replay/<m|p>/<id>). */
export function HistoryList({ rows }: { rows: HistoryRow[] }) {
  return (
    <div className="history-list">
      {rows.map((h) => (
        <a key={h.id} className={`history-row out-${h.outcome}`} href={`#/replay/${h.kind === 'ranked' || h.kind === 'friend' ? 'p' : 'm'}/${h.id}`} title={t('Переглянути партію')}>
          <span className="history-outcome">{OUTCOME[h.outcome]}</span>
          <span className="history-main">
            <b>{tr(h.opponent)}</b>
            <small className="muted">
              {KIND[h.kind]} · {tr(h.reason)} · {t('{0} ход.', h.moves)}
            </small>
          </span>
          {h.kind === 'ranked' && (
            <span className={`history-delta ${h.trophiesDelta >= 0 ? 'up' : 'down'}`}>
              🏆 {h.trophiesDelta >= 0 ? '+' : ''}
              {h.trophiesDelta}
            </span>
          )}
          <span className="muted tiny history-date">{new Date(h.at).toLocaleString(locale(), { dateStyle: 'short', timeStyle: 'short' })}</span>
          <span className="history-open" aria-hidden="true">▶</span>
        </a>
      ))}
    </div>
  );
}
