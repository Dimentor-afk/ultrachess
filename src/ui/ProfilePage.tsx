import { useEffect, useMemo, useState } from 'react';
import type { HistoryRow } from '../api/client';
import { CARDS, CARD_BY_ID, PIECE_ORDER, RARITY_NAMES, RARITY_ORDER } from '../engine/cards';
import { Avatar } from './common';
import { AccountPanel, NAME_HINT } from './AccountPages';
import { NAME_MAX } from '../economy/account';
import { Icon } from './icons';
import { getSettings, onSettings, play, setSettings } from './settings';
import { errorText, useSession } from './state';
import { t, tr, locale } from '../i18n';
import { LangSelect } from './LangSelect';
import { PatchNotes } from './PatchNotes';
import { AchievementsPanel, TitlePlate } from './Achievements';
import { HistoryList } from './HistoryList';

export function ProfilePage() {
  const s = useSession();
  const p = s.profile;
  const [history, setHistory] = useState<HistoryRow[] | null>(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(p.name);
  const [picker, setPicker] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

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

  return (
    <section className="page profile">
      <div className="profile-hero">
        <button className="profile-avatar" onClick={() => setPicker(!picker)} title={t('Змінити аватар')}>
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
              <input value={name} maxLength={NAME_MAX} autoFocus onChange={(e) => setName(e.target.value)} aria-label={t('Нікнейм')} title={NAME_HINT} />
              <button className="btn btn-primary btn-sm">{t('Зберегти')}</button>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => setEditing(false)}>
                {t('Скасувати')}
              </button>
            </form>
          ) : (
            <h1>
              {p.name}{' '}
              <button
                className="icon-btn inline"
                onClick={() => {
                  if (p.nameChangeAt) return s.toast(t('Нікнейм можна змінювати раз на 7 днів: наступна зміна {0}.', new Date(p.nameChangeAt).toLocaleDateString(locale())), 'error');
                  setName(p.name);
                  setEditing(true);
                }}
                aria-label={t('Змінити нікнейм')}
              >
                <Icon name="edit" />
              </button>
            </h1>
          )}
          {!editing && <TitlePlate id={p.title} />}
          {editing && <small className="muted tiny">{NAME_HINT}{t('. Змінити нікнейм можна раз на 7 днів.')}</small>}
          <div className="profile-tags">
            <span className="tag-chip" title={t('За цим кодом вас можна знайти в друзях')}>
              #{p.tag}
            </span>
            <span className="muted small">{p.role === 'admin' ? t('Адміністратор · ') : ''}{t('з {0}', new Date(p.createdAt).toLocaleDateString(locale()))}</span>
          </div>
          <a className="profile-arena" href="#/leagues/pvp">
            <span className="trophies">⚔ 🏆 {p.ladders.pvp.trophies}</span>
            <span className="muted">
              {t('{0} · рекорд {1}', tr(p.ladders.pvp.leagueName), p.ladders.pvp.best)}
            </span>
          </a>
          <a className="profile-arena" href="#/leagues/bot">
            <span className="trophies">🤖 🏆 {p.ladders.bot.trophies}</span>
            <span className="muted">
              {t('{0} · рекорд {1}', tr(p.ladders.bot.leagueName), p.ladders.bot.best)}
            </span>
          </a>
        </div>
        <div className="profile-side">
          {p.role === 'admin' && (
            <a className="btn btn-sm" href="#/admin">
              <Icon name="shield" /> {t('Адмін-панель')}
            </a>
          )}
          <a className="btn btn-sm" href="#/help">
            <Icon name="info" /> {t('Як грати')}
          </a>
          <button className="btn btn-ghost btn-sm" onClick={() => s.logout()}>
            <Icon name="logout" /> {t('Вийти з акаунта')}
          </button>
          {s.api.resetDemo && (
            <button
              className="btn btn-ghost btn-sm demo-reset"
              title={t('Видаляє всі демо-акаунти в цьому браузері: можна зареєструватись і відкрити стартовий пак знову')}
              onClick={async () => {
                if (!confirmReset) return setConfirmReset(true);
                await s.api.resetDemo!();
                await s.logout().catch(() => undefined);
              }}
              onBlur={() => setConfirmReset(false)}
            >
              {confirmReset ? t('Точно видалити все?') : t('Почати демо з нуля')}
            </button>
          )}
        </div>
      </div>

      {picker && (
        <div className="panel avatar-picker">
          <div className="section-head">
            <h2>{t('Аватар')}</h2>
            <span className="muted small">{t('Будь-яка ваша картка')}</span>
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
        <Stat label={t('Перемоги')} value={p.wins} tone="ok" />
        <Stat label={t('Поразки')} value={p.losses} tone="bad" />
        <Stat label={t('Нічиї')} value={p.draws} />
        <Stat label={t('Відсоток перемог')} value={`${winrate}%`} />
        <Stat label={t('Карток зібрано')} value={`${owned.length}/${CARDS.length}`} />
        <Stat label={t('Рекорд кубків')} value={`🏆 ${Math.max(p.ladders.pvp.best, p.ladders.bot.best)}`} />
      </div>

      <AchievementsPanel />

      <div className="panel">
        <h2>{t('Колекція за рідкістю')}</h2>
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

      <AccountPanel />

      <div className="section-head">
        <h2>{t('Історія матчів')}</h2>
      </div>
      {!history ? (
        <p className="muted">{t('Завантаження…')}</p>
      ) : history.length === 0 ? (
        <div className="panel">
          <p className="muted">{t('Ще немає зіграних партій.')}</p>
        </div>
      ) : (
        <HistoryList rows={history} />
      )}
    </section>
  );
}

function SettingsPanel() {
  const [st, setSt] = useState(getSettings());
  const [notes, setNotes] = useState(false);
  useEffect(() => onSettings(() => setSt(getSettings())), []);
  const rows: { key: 'sound' | 'animations' | 'coordinates'; label: string; hint: string }[] = [
    { key: 'sound', label: t('Звуки'), hint: t('Ходи, взяття, шах, відкриття паків') },
    { key: 'animations', label: t('Анімації'), hint: t('Рух фігур, тряска паків, світіння') },
    { key: 'coordinates', label: t('Координати дошки'), hint: t('Літери й цифри навколо дошки') },
  ];
  return (
    <div className="panel settings">
      <h2>{t('Налаштування')}</h2>
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
      <div className="setting-row">
        <span>
          <b>{t('Чорні фігури')}</b>
          <small className="muted">{t('Кольорові з червоним обідком чи темні версії')}</small>
        </span>
        <span className="seg" role="radiogroup" aria-label={t('Чорні фігури')}>
          {(
            [
              ['team', t('Кольорові')],
              ['dark', t('Темні')],
            ] as const
          ).map(([v, label]) => (
            <button key={v} role="radio" aria-checked={st.blackStyle === v} className={st.blackStyle === v ? 'on' : ''} onClick={() => setSettings({ blackStyle: v })}>
              {label}
            </button>
          ))}
        </span>
      </div>
      <div className="setting-row">
        <span>
          <b>{t('Мова')}</b>
          <small className="muted">Language · Sprache · Lingua · Idioma</small>
        </span>
        <LangSelect />
      </div>
      <div className="setting-row">
        <span>
          <b>{t('Що нового')}</b>
          <small className="muted">{t('Зміни останнього оновлення')}</small>
        </span>
        <button className="btn btn-sm" onClick={() => setNotes(true)}>
          {t('Відкрити')}
        </button>
      </div>
      {notes && <PatchNotes onClose={() => setNotes(false)} />}
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
