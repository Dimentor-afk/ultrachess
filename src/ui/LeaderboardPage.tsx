import { useEffect, useState } from 'react';
import type { LeaderRow } from '../api/client';
import { ARENAS } from '../economy/packs';
import { errorText, useSession } from './state';

export function LeaderboardPage() {
  const s = useSession();
  const [rows, setRows] = useState<LeaderRow[] | null>(null);
  useEffect(() => {
    s.api.leaderboard().then(setRows, (e) => s.toast(errorText(e), 'error'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="page">
      <div className="page-head">
        <h1>Рейтинг</h1>
        <p className="muted">
          Кубки за рейтингові бої: +30 за перемогу, −20 за поразку. Арени:{' '}
          {ARENAS.map((a) => `${a.name} (${a.minTrophies}+)`).join(', ')}.
        </p>
      </div>
      <div className="panel">
        {!rows ? (
          <p className="muted">Завантаження…</p>
        ) : rows.length === 0 ? (
          <p className="muted">Поки порожньо — зіграйте перший рейтинговий бій.</p>
        ) : (
          <div className="table-wrap">
            <table className="leaders">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Гравець</th>
                  <th>Арена</th>
                  <th className="num">Перемоги</th>
                  <th className="num">Кубки</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className={r.name === s.profile.name ? 'me' : ''}>
                    <td className={`place place-${i + 1}`}>{i + 1}</td>
                    <td>
                      <b>{r.name}</b>
                    </td>
                    <td className="muted">{r.arena}</td>
                    <td className="num">{r.wins}</td>
                    <td className="num gold">🏆 {r.trophies}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
