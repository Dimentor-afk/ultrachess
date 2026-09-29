import { useEffect, useMemo, useState } from 'react';
import type { HistoryRow } from '../api/client';
import { ARENAS } from '../economy/packs';
import { CARDS, CARD_BY_ID, PIECE_ORDER, RARITY_NAMES, RARITY_ORDER } from '../engine/cards';
import { Avatar } from './common';
import { Icon } from './icons';
import { type Settings, getSettings, onSettings, play, setSettings } from './settings';
import { errorText, useSession } from './state';

const KIND: Record<HistoryRow['kind'], string> = { ranked: 'Рейтинг', training: 'Тренування', friend: 'Друг' };
const OUTCOME: Record<HistoryRow['outcome'], string> = { win: 'Перемога', loss: 'Поразка', draw: 'Нічия' };

export function ProfilePage() {
  const s = useSession();
  const p = s.profile;
  const [history, setHistory] = useState<HistoryRow[] | null>(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(p.name);
  const [picker, setPicker] = useState(false);

  useEffect(() => {
    s.api.history().then(setHistory, (e) => s.toast(errorText(e), 'error'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async (patch: { name?: string; avatar?: string }) => {
    try {
      s.setProfile(await s.api.updateProfile(patch));
      setEditing(false);
      setPicker(false);
    } catch (e) {
      s.toast(errorText(e), 'error');
    }
  };

  const games = p.wins + p.losses + p.draws;
  const winrate = games ? Math.round((p.wins / games) * 100) : 0;
  const owned = Object.keys(s.collection.owned);
  const ownedCards = useMemo(
    () =>
      CARDS.filter((c) => s.collection.owned[c.id]).sort(
        (a, b) => RARITY_ORDER.indexOf(b.rarity) - RARITY_ORDER.indexOf(a.rarity) || PIECE_ORDER.indexOf(a.pieceType) - PIECE_ORDER.indexOf(b.pieceType),
      ),
    [s.collection.owned],
  );
  const byRarity = RARITY_ORDER.map((r) => ({
    r,
    have: owned.filter((id) => CARD_BY_ID[id]?.rarity === r).length,
    all: CARDS.filter((c) => c.rarity === r).length,
  }));
  const arena = ARENAS[p.arenaIndex];

  return (
    <section className="page profile">
      <div className="profile-hero">
        <button className="profile-avatar" onClick={() => setPicker(!picker)} title="Змінити аватар">
          <Avatar card={p.avatar} size="xl" />
          <span className="profile-avatar-edit">
            <Icon name="edit" />
          </span>
        </button>
        <div className="profile-main">
          {editing ? (
            <form
              className="name-form"
              onSubmit={(e) => {
                e.preventDefault();
                void save({ name });
              }}
            >
              <input value={name} maxLength={24} autoFocus onChange={(e) => setName(e.target.value)} aria-label="Нікнейм" />
              <button className="btn btn-primary btn-sm">Зберегти</button>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => setEditing(false)}>
                Скасувати
              </button>
            </form>
          ) : (
            <h1>
              {p.name}{' '}
              <button className="icon-btn inline" onClick={() => setEditing(true)} aria-label="Змінити нікнейм">
                <Icon name="edit" />
              </button>
            </h1>
          )}
          <div className="profile-tags">
            <span className="tag-chip" title="За цим кодом вас можна знайти в друзях">
              #{p.tag}
            </span>
            <span className="muted small">{p.role === 'admin' ? 'Адміністратор · ' : ''}з {new Date(p.createdAt).toLocaleDateString('uk-UA')}</span>
          </div>
          <div className="profile-arena">
            <span className="trophies">🏆 {p.trophies}</span>
            <span className="muted">
              {arena.name} · рекорд {p.bestTrophies}
            </span>
          </div>
        </div>
        <div className="profile-side">
          {p.role === 'admin' && (
            <a className="btn btn-sm" href="#/admin">
              <Icon name="shield" /> Адмін-панель
            </a>
          )}
          <a className="btn btn-sm" href="#/help">
            <Icon name="info" /> Як грати
          </a>
          <button className="btn btn-ghost btn-sm" onClick={() => s.logout()}>
            <Icon name="logout" /> Вийти
          </button>
        </div>
      </div>

      {picker && (
        <div className="panel avatar-picker">
          <div className="section-head">
            <h2>Аватар</h2>
            <span className="muted small">Будь-яка ваша картка</span>
          </div>
          <div className="avatar-grid">
            {ownedCards.map((c) => (
              <button key={c.id} className={`avatar-choice ${p.avatar === c.id ? 'on' : ''}`} onClick={() => save({ avatar: c.id })} title={c.name}>
                <Avatar card={c.id} size="lg" />
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="stat-grid">
        <Stat label="Перемоги" value={p.wins} tone="ok" />
        <Stat label="Поразки" value={p.losses} tone="bad" />
        <Stat label="Нічиї" value={p.draws} />
        <Stat label="Відсоток перемог" value={`${winrate}%`} />
        <Stat label="Карток зібрано" value={`${owned.length}/${CARDS.length}`} />
        <Stat label="Золото / осколки" value={`${p.gold} / ${p.shards}`} />
      </div>

      <div className="panel">
        <h2>Колекція за рідкістю</h2>
        <div className="rarity-bars">
          {byRarity.map(({ r, have, all }) => (
            <div key={r} className={`rarity-bar r-${r}`}>
              <span>{RARITY_NAMES[r]}</span>
              <div className="bar">
                <span style={{ width: `${(have / all) * 100}%` }} />
              </div>
              <span className="rarity-count">
                {have}/{all}
              </span>
            </div>
          ))}
        </div>
      </div>

      <SettingsPanel />

      <div className="section-head">
        <h2>Історія матчів</h2>
      </div>
      {!history ? (
        <p className="muted">Завантаження…</p>
      ) : history.length === 0 ? (
        <div className="panel">
          <p className="muted">Ще немає зіграних партій.</p>
        </div>
      ) : (
        <div className="history-list">
          {history.map((h) => (
            <div key={h.id} className={`history-row out-${h.outcome}`}>
              <span className="history-outcome">{OUTCOME[h.outcome]}</span>
              <span className="history-main">
                <b>{h.opponent}</b>
                <small className="muted">
                  {KIND[h.kind]} · {h.reason} · {h.moves} ход.
                </small>
              </span>
              {h.kind === 'ranked' && (
                <span className={`history-delta ${h.trophiesDelta >= 0 ? 'up' : 'down'}`}>
                  🏆 {h.trophiesDelta >= 0 ? '+' : ''}
                  {h.trophiesDelta}
                </span>
              )}
              <span className="muted tiny history-date">{new Date(h.at).toLocaleString('uk-UA', { dateStyle: 'short', timeStyle: 'short' })}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function SettingsPanel() {
  const [st, setSt] = useState(getSettings());
  useEffect(() => onSettings(() => setSt(getSettings())), []);
  const rows: { key: keyof Settings; label: string; hint: string }[] = [
    { key: 'sound', label: 'Звуки', hint: 'Ходи, взяття, шах, відкриття паків' },
    { key: 'animations', label: 'Анімації', hint: 'Рух фігур, тряска паків, світіння' },
    { key: 'coordinates', label: 'Координати дошки', hint: 'Літери й цифри навколо дошки' },
  ];
  return (
    <div className="panel settings">
      <h2>Налаштування</h2>
      {rows.map((r) => (
        <label key={r.key} className="setting-row">
          <span>
            <b>{r.label}</b>
            <small className="muted">{r.hint}</small>
          </span>
          <input
            type="checkbox"
            className="switch"
            checked={st[r.key]}
            onChange={(e) => {
              setSettings({ [r.key]: e.target.checked });
              if (r.key === 'sound' && e.target.checked) play('click');
            }}
          />
        </label>
      ))}
      <p className="muted tiny">Налаштування зберігаються на цьому пристрої.</p>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: 'ok' | 'bad' }) {
  return (
    <div className={`stat ${tone ? `stat-${tone}` : ''}`}>
      <b>{value}</b>
      <span>{label}</span>
    </div>
  );
}
