import { useEffect, useState } from 'react';
import type { LeaderRow } from '../api/client';
import { LADDER_NAMES, LADDER_TROPHIES, type Ladder } from '../economy/leagues';
import { PlayerModal } from './PlayerModal';
import { Avatar } from './common';
import { errorText, useSession } from './state';

export function LeaderboardPage() {
  const s = useSession();
  const [rows, setRows] = useState<LeaderRow[] | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const [ladder, setLadder] = useState<Ladder>('pvp');
  useEffect(() => {
    s.api.leaderboard().then(setRows, (e) => s.toast(errorText(e), 'error'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="page">
      <div className="page-head">
        <h1>Рейтинг</h1>
        <p className="muted">
          {LADDER_NAMES[ladder]}: +{LADDER_TROPHIES[ladder].win} кубків за перемогу, {LADDER_TROPHIES[ladder].loss} за поразку.{' '}
          <a href={`#/leagues/${ladder}`}>Усі ліги</a>
        </p>
      </div>
      <div className="chip-row">
        {(['pvp', 'bot'] as Ladder[]).map((l) => (
          <button key={l} className={`chip ${ladder === l ? 'on' : ''}`} onClick={() => setLadder(l)}>
            {l === 'bot' ? '🤖' : '⚔'} {LADDER_NAMES[l]}
          </button>
        ))}
      </div>
      <div className="panel">
        {!rows ? (
          <p className="muted">Завантаження…</p>
        ) : rows.length === 0 ? (
          <p className="muted">Поки порожньо — зіграйте перший бій у лізі.</p>
        ) : (
          <div className="table-wrap">
            <table className="leaders">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Гравець</th>
                  <th className="hide-sm">Ліга</th>
                  <th className="num hide-sm">Перемоги</th>
                  <th className="num">Кубки</th>
                </tr>
              </thead>
              <tbody>
                {[...rows]
                  .sort((a, b) => (ladder === 'bot' ? b.botTrophies - a.botTrophies : b.trophies - a.trophies))
                  .map((r, i) => (
                  <tr key={r.id} className={`clickable ${r.id === s.profile.id ? 'leader-me' : ''}`} onClick={() => setViewing(r.id)}>
                    <td className={`place place-${i + 1}`}>{i + 1}</td>
                    <td>
                      <span className="leader-who">
                        <Avatar card={r.avatar} size="sm" />
                        <span className="leader-name">
                          <b>{r.name}</b>
                          {/* On a phone the league sits under the name instead of in its own column. */}
                          <small className="muted leader-league-sm">{ladder === 'bot' ? r.botLeague : r.arena}</small>
                        </span>
                      </span>
                    </td>
                    <td className="muted hide-sm">{ladder === 'bot' ? r.botLeague : r.arena}</td>
                    <td className="num hide-sm">{r.wins}</td>
                    <td className="num gold">🏆 {ladder === 'bot' ? r.botTrophies : r.trophies}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {viewing && <PlayerModal userId={viewing} onClose={() => setViewing(null)} />}
    </section>
  );
}
