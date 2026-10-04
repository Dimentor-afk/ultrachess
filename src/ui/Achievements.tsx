import { useEffect, useRef, useState } from 'react';
import { currentPath } from './router';
import type { AchievementView } from '../api/client';
import { ACHIEVEMENT_BY_ID } from '../economy/achievements';
import { t } from '../i18n';
import { errorText, useSession } from './state';

const TIER = ['', 'bronze', 'silver', 'gold', 'legend'] as const;

/** The plate under a player's name: an achievement they chose to show. */
export function TitlePlate({ id, small }: { id: string | null | undefined; small?: boolean }) {
  const a = id ? ACHIEVEMENT_BY_ID[id] : null;
  if (!a) return null;
  return (
    <span className={`title-plate tier-${TIER[a.tier]} ${small ? 'small' : ''}`} title={a.text}>
      <span className="title-plate-icon">{a.icon}</span>
      {a.name}
    </span>
  );
}

function reward(a: AchievementView): string {
  return [a.reward.gold ? `🪙 ${a.reward.gold}` : '', a.reward.shards ? `💎 ${a.reward.shards}` : ''].filter(Boolean).join(' · ');
}

/** Every achievement: rewards to take, progress, and the plate to show under the name. */
export function AchievementsPanel() {
  const s = useSession();
  const [list, setList] = useState<AchievementView[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'done' | 'open'>('all');

  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    s.api.achievements().then((l) => {
      // Names and texts in the chosen language (the server sends Ukrainian).
      setList(l.map((a) => ({ ...a, name: ACHIEVEMENT_BY_ID[a.id]?.name ?? a.name, text: ACHIEVEMENT_BY_ID[a.id]?.text ?? a.text })));
      // From the game summary: straight to the achievements.
      if (currentPath() === '/profile/achievements') setTimeout(() => ref.current?.scrollIntoView({ block: 'start' }), 50);
    }, (e) => s.toast(errorText(e), 'error'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.profile.achievementsReady]);

  if (!list) return null;
  const run = async (id: string, fn: () => Promise<void>) => {
    setBusy(id);
    try {
      await fn();
    } catch (e) {
      s.toast(errorText(e), 'error');
    } finally {
      setBusy(null);
    }
  };
  const claim = (a: AchievementView) =>
    run(a.id, async () => {
      const r = await s.api.claimAchievement(a.id);
      s.setProfile(r.profile);
      setList(r.list.map((x) => ({ ...x, name: ACHIEVEMENT_BY_ID[x.id]?.name ?? x.name, text: ACHIEVEMENT_BY_ID[x.id]?.text ?? x.text })));
      s.toast(t('🏅 {0}: {1}', a.name, reward(a)));
    });
  const wear = (a: AchievementView) => run(a.id, async () => s.setProfile(await s.api.setTitle(s.profile.title === a.id ? null : a.id)));

  const rank = (a: AchievementView) => (a.done && !a.claimed ? 0 : !a.done ? 1 : 2);
  const shown = list
    .filter((a) => (filter === 'done' ? a.done : filter === 'open' ? !a.done : true))
    .sort((a, b) => rank(a) - rank(b) || (b.progress / b.target) - (a.progress / a.target));
  const doneCount = list.filter((a) => a.done).length;

  return (
    <div className="panel achievements" ref={ref}>
      <div className="section-head">
        <h2>{t('Досягнення')}</h2>
        <span className="muted small">
          {doneCount}/{list.length}
        </span>
      </div>
      <p className="muted small">{t('Кожне здобуте досягнення дає нагороду й плашку: її бачитимуть під вашим ніком у партіях.')}</p>
      <div className="ach-filter" role="tablist">
        {(
          [
            ['all', t('Усі')],
            ['done', t('Здобуті')],
            ['open', t('Ще попереду')],
          ] as const
        ).map(([k, label]) => (
          <button key={k} role="tab" aria-selected={filter === k} className={`chip ${filter === k ? 'on' : ''}`} onClick={() => setFilter(k)}>
            {label}
          </button>
        ))}
      </div>
      <div className="ach-grid">
        {shown.map((a) => (
          <div key={a.id} className={`ach tier-${TIER[a.tier]} ${a.done ? 'done' : 'locked'} ${a.done && !a.claimed ? 'ready' : ''}`}>
            <span className="ach-icon">{a.icon}</span>
            <span className="ach-body">
              <b>{a.name}</b>
              <small>{a.text}</small>
              {a.stat && !a.done && (
                <span className="ach-progress">
                  <span className="bar small-bar">
                    <span style={{ width: `${(a.progress / a.target) * 100}%` }} />
                  </span>
                  <small className="muted">
                    {a.progress}/{a.target}
                  </small>
                </span>
              )}
              <small className="ach-reward">{reward(a)}</small>
            </span>
            <span className="ach-actions">
              {a.done && !a.claimed && (
                <button className="btn btn-primary btn-sm" disabled={busy === a.id} onClick={() => void claim(a)}>
                  {t('Забрати')}
                </button>
              )}
              {a.done && (
                <button className={`btn btn-sm ${s.profile.title === a.id ? 'btn-primary' : 'btn-ghost'}`} disabled={busy === a.id} onClick={() => void wear(a)}>
                  {s.profile.title === a.id ? t('✓ Плашка') : t('Плашка')}
                </button>
              )}
              {!a.done && <span className="ach-lock">🔒</span>}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
