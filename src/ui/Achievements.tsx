import { SKIN_BY_ID } from '../economy/skins';
import { parseWeeklyPlate } from '../economy/weekly';
import { type CSSProperties, useEffect, useRef, useState } from 'react';
import type { AchievementView } from '../api/client';
import { ACHIEVEMENT_BY_ID, CREATOR_TITLE, SHOWCASE_SIZE, type AchievementDef } from '../economy/achievements';
import { FOUNDER_PLATE } from '../economy/referrals';
import { t, tr } from '../i18n';
import { cardArt, packArt } from './cardArt';
import type { PackType } from '../economy/packs';
import { currentPath, useRoutePath } from './router';
import { play } from './settings';
import { errorText, useSession } from './state';

const TIER = ['', 'bronze', 'silver', 'gold', 'legend'] as const;
const OPEN_KEY = 'uc.achievements.open';
const TIER_NAME = ['', t('Бронза'), t('Срібло'), t('Золото'), t('Легенда')];

/** A round medal in the achievement's colour: its piece sprite (or emoji) inside a rim of its tier. */
export function Medal({ a, locked, size = 'md' }: { a: AchievementDef; locked?: boolean; size?: 'sm' | 'md' | 'lg' }) {
  const art = !a.art ? null : a.art.startsWith('pack:') ? packArt(a.art.slice(5) as PackType) : cardArt(a.art);
  return (
    <span className={`medal medal-${size} tier-${TIER[a.tier]} ${locked ? 'locked' : ''}`} style={{ '--hue': a.hue } as CSSProperties} aria-hidden="true">
      <span className="medal-face">{art ? <img className="pixel" src={art} alt="" /> : <span className="medal-emoji">{a.icon}</span>}</span>
      {locked && <span className="medal-lock">🔒</span>}
    </span>
  );
}

/** One achievement up close (a medal tapped on a profile): what it is given for. */
export function AchievementInfo({ id, percent, onClose }: { id: string; percent?: number; onClose: () => void }) {
  const a = ACHIEVEMENT_BY_ID[id];
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  if (!a) return null;
  return (
    <div
      className="modal-backdrop ach-info-backdrop"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div className={`modal ach-info tier-${TIER[a.tier]}`} style={{ '--hue': a.hue } as CSSProperties} role="dialog" aria-label={a.name} onClick={(e) => e.stopPropagation()}>
        <Medal a={a} size="lg" />
        <span className="ach-info-tier">{TIER_NAME[a.tier]}</span>
        <h3>{a.name}</h3>
        <p>{a.text}</p>
        {a.online && <p className="ach-online small">🌐 {t('лише в лізі гравців')}</p>}
        {percent !== undefined && <p className="muted small">🌍 {rarityText(percent)}</p>}
        <button className="btn btn-sm" onClick={onClose}>
          {t('Закрити')}
        </button>
      </div>
    </div>
  );
}

/** "У 12% гравців", "Рідкісне: 0.4% гравців". */
export function rarityText(percent: number): string {
  const n = percent < 1 ? percent.toFixed(1) : String(Math.round(percent));
  return percent < 5 ? t('Рідкісне: у {0}% гравців', n) : t('У {0}% гравців', n);
}

/** The plate under a player's name: an achievement they chose to show. */
export function TitlePlate({ id, small }: { id: string | null | undefined; small?: boolean }) {
  // A weekly league plate: the season's name and the division, in the division's colours.
  const weekly = id ? parseWeeklyPlate(id) : null;
  if (weekly) {
    const skin = SKIN_BY_ID[weekly.season.skins[5 - weekly.division.n]];
    return (
      <span className={`title-plate weekly-plate div-${weekly.division.n} ${small ? 'small' : ''}`} title={t('{0}: 15 перемог у Тижні слави, дивізіон {1}', tr(weekly.season.name), weekly.division.roman)}>
        {skin && <img src={skin.art} alt="" />}
        {tr(weekly.season.plate)} · {weekly.division.roman}
      </span>
    );
  }
  if (id === FOUNDER_PLATE) {
    return (
      <span className={`title-plate founder ${small ? 'small' : ''}`} title={t('Засновник спільноти')}>
        <span className="creator-crown">🌱</span>
        {t('Засновник спільноти')}
      </span>
    );
  }
  if (id === CREATOR_TITLE) {
    return (
      <span className={`title-plate creator ${small ? 'small' : ''}`} title={t('Творець гри')}>
        <span className="creator-crown">👑</span>
        {t('Творець гри')}
      </span>
    );
  }
  const a = id ? ACHIEVEMENT_BY_ID[id] : null;
  if (!a) return null;
  return (
    <span className={`title-plate tier-${TIER[a.tier]} ${small ? 'small' : ''}`} style={{ '--hue': a.hue } as CSSProperties} title={a.text}>
      <Medal a={a} size="sm" />
      {a.name}
    </span>
  );
}

/**
 * Achievements as they unlock: a card slides in from the side, like a
 * console trophy. Watches the profile, so whatever unlocked one (a game, a
 * pack, a league) shows it the moment the profile is refreshed.
 */
export function AchievementPopups() {
  const s = useSession();
  // Everything already queued in this tab (the profile keeps listing an achievement until it is refreshed).
  const queued = useRef(new Set<string>());
  const [queue, setQueue] = useState<string[]>([]);
  const [leaving, setLeaving] = useState(false);

  // The server lists what the player has not seen yet: on the first visit after
  // the update that is everything they had already earned, so it all plays once.
  useEffect(() => {
    const fresh = s.profile.achievementsUnseen.filter((id) => ACHIEVEMENT_BY_ID[id] && !queued.current.has(id));
    for (const id of fresh) queued.current.add(id);
    if (fresh.length) setQueue((q) => [...q, ...fresh]);
  }, [s.profile.achievementsUnseen]);

  const current = queue[0];
  useEffect(() => {
    if (!current) return;
    play('trophy');
    setLeaving(false);
    void s.api.seeAchievements([current]).catch(() => undefined);
    // A long line of them (a player's first visit after the update) goes faster.
    const show = queue.length > 3 ? 2400 : 4200;
    const out = setTimeout(() => setLeaving(true), show);
    const next = setTimeout(() => setQueue((q) => q.slice(1)), show + 500);
    return () => {
      clearTimeout(out);
      clearTimeout(next);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  const a = current ? ACHIEVEMENT_BY_ID[current] : null;
  if (!a) return null;
  return (
    <a
      key={current}
      href="#/profile/achievements"
      className={`ach-pop tier-${TIER[a.tier]} ${leaving ? 'leaving' : ''}`}
      style={{ '--hue': a.hue } as CSSProperties}
      role="status"
      onClick={() => setQueue((q) => q.slice(1))}
    >
      <Medal a={a} size="lg" />
      <span className="ach-pop-text">
        <small>
          🏆 {t('Досягнення відкрито')} · {TIER_NAME[a.tier]}
        </small>
        <b>{a.name}</b>
        <span>{a.text}</span>
      </span>
      {queue.length > 1 && <span className="ach-pop-more">+{queue.length - 1}</span>}
    </a>
  );
}

/** Every achievement: what is reached, the progress to the rest, and the plate to show under the name. */
export function AchievementsPanel() {
  const s = useSession();
  const [list, setList] = useState<AchievementView[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'done' | 'open'>('all');
  const [info, setInfo] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  // Folded by default (the list is long); opened from a pop-up or the game summary.
  const [open, setOpen] = useState(() => {
    if (currentPath() === '/profile/achievements') return true;
    try {
      return localStorage.getItem(OPEN_KEY) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    s.api.achievements().then(
      (l) => {
        // Names and texts in the chosen language (the server sends Ukrainian).
        setList(l.map((a) => ({ ...a, name: ACHIEVEMENT_BY_ID[a.id]?.name ?? a.name, text: ACHIEVEMENT_BY_ID[a.id]?.text ?? a.text })));
        // From the game summary or a pop-up: straight to the achievements.
        if (currentPath() === '/profile/achievements') setTimeout(() => ref.current?.scrollIntoView({ block: 'start' }), 50);
      },
      (e) => s.toast(errorText(e), 'error'),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.profile.achievements.length]);

  // A pop-up tapped while the profile is already open: unfold and scroll here.
  const path = useRoutePath();
  useEffect(() => {
    if (path !== '/profile/achievements') return;
    setOpen(true);
    setTimeout(() => ref.current?.scrollIntoView({ block: 'start' }), 50);
  }, [path]);

  if (!list) return null;
  const showcase = s.profile.showcase;
  const pin = async (a: AchievementView) => {
    const on = showcase.includes(a.id);
    if (!on && showcase.length >= SHOWCASE_SIZE) return s.toast(t('На вітрині вже 3 досягнення: спершу зніміть одне.'), 'error');
    setBusy(a.id);
    try {
      s.setProfile(await s.api.setShowcase(on ? showcase.filter((x) => x !== a.id) : [...showcase, a.id]));
    } catch (e) {
      s.toast(errorText(e), 'error');
    } finally {
      setBusy(null);
    }
  };


  const toggle = () => {
    setOpen(!open);
    try {
      localStorage.setItem(OPEN_KEY, open ? '0' : '1');
    } catch {
      // Not remembered: fine.
    }
  };
  const shown = list
    .filter((a) => (filter === 'done' ? a.done : filter === 'open' ? !a.done : true))
    .sort((a, b) => Number(b.done) - Number(a.done) || b.tier - a.tier || b.progress / b.target - a.progress / a.target);
  const doneCount = list.filter((a) => a.done).length;

  return (
    <div className="panel achievements" ref={ref}>
      <div className="section-head">
        <h2>{t('Досягнення')}</h2>
        <span className="ach-count">
          🏆 {doneCount}/{list.length}
        </span>
      </div>
      <div className="bar ach-total" aria-hidden="true">
        <span style={{ width: `${(doneCount / list.length) * 100}%` }} />
      </div>
      {s.profile.plates.map((id) => (
        <div key={id} className="creator-row">
          <TitlePlate id={id} />
          <button
            className={`btn btn-sm ${s.profile.title === id ? 'btn-primary' : 'btn-ghost'}`}
            onClick={async () => {
              try {
                s.setProfile(await s.api.setTitle(s.profile.title === id ? null : id));
              } catch (e) {
                s.toast(errorText(e), 'error');
              }
            }}
          >
            {s.profile.title === id ? t('✓ Плашка') : t('Плашка')}
          </button>
        </div>
      ))}
      <div className="ach-showcase-head">
        <b>{t('Вітрина')}</b>
        <small className="muted">{showcase.length ? t('Ці досягнення бачать інші гравці у вашому профілі.') : t('Поки показуються найрідкісніші. Оберіть свої кнопкою ★ у списку.')}</small>
      </div>
      <div className="ach-showcase">
        {(showcase.length
          ? showcase.map((id) => list.find((a) => a.id === id)).filter((a): a is AchievementView => !!a)
          : list.filter((a) => a.done).sort((a, b) => (a.percent ?? 100) - (b.percent ?? 100) || b.tier - a.tier).slice(0, SHOWCASE_SIZE)
        ).map((a) => (
          <button key={a.id} className="ach-show-item" onClick={() => setInfo(a.id)}>
            <Medal a={a} />
            <small>{a.name}</small>
          </button>
        ))}
        {list.every((a) => !a.done) && <p className="muted small">{t('Ще жодного.')}</p>}
      </div>
      {info && <AchievementInfo id={info} percent={list.find((a) => a.id === info)?.percent} onClose={() => setInfo(null)} />}
      <button className="btn btn-sm ach-toggle" onClick={toggle} aria-expanded={open}>
        {open ? t('▲ Згорнути') : t('▼ Показати всі ({0})', list.length)}
      </button>
      {open && (
        <>
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
          <div key={a.id} className={`ach tier-${TIER[a.tier]} ${a.done ? 'done' : 'locked'}`} style={{ '--hue': a.hue } as CSSProperties}>
            <Medal a={a} locked={!a.done} />
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
              {a.percent !== undefined && <small className={`ach-rarity ${a.percent < 5 ? 'rare' : ''}`}>🌍 {rarityText(a.percent)}</small>}
              <small className="ach-tier">
                {TIER_NAME[a.tier]}
                {a.online && <span className="ach-online"> · 🌐 {t('лише в лізі гравців')}</span>}
              </small>
            </span>
            {a.done && (
              <span className="ach-actions">
                <button
                  className={`btn btn-sm ${showcase.includes(a.id) ? 'btn-primary' : 'btn-ghost'}`}
                  disabled={busy === a.id}
                  onClick={() => void pin(a)}
                  title={t('На вітрину профілю')}
                >
                  {showcase.includes(a.id) ? t('★ Вітрина') : t('☆ Вітрина')}
                </button>
              </span>
            )}
          </div>
        ))}
      </div>
      <button className="btn btn-sm ach-toggle" onClick={toggle}>
        {t('▲ Згорнути')}
      </button>
        </>
      )}
    </div>
  );
}
