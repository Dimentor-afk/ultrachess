import { useCallback, useEffect, useState } from 'react';
import type { ChallengesView, FriendsView, PlayerCard } from '../api/client';
import { navigate } from './router';
import { PlayerModal } from './PlayerModal';
import { Avatar } from './common';
import { Icon } from './icons';
import { errorText, useSession } from './state';
import { t, locale } from '../i18n';

function lastSeenText(p: PlayerCard): string {
  if (p.online) return t('онлайн');
  if (!p.lastSeen) return t('давно не заходив');
  const min = Math.round((Date.now() - p.lastSeen) / 60000);
  if (min < 60) return t('був {0} хв тому', min);
  const h = Math.round(min / 60);
  if (h < 24) return t('був {0} год тому', h);
  return t('був {0}', new Date(p.lastSeen).toLocaleDateString(locale()));
}

export function FriendsPage() {
  const s = useSession();
  const [friends, setFriends] = useState<FriendsView | null>(null);
  const [ch, setCh] = useState<ChallengesView | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlayerCard[] | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [f, c] = await Promise.all([s.api.friends(), s.api.challenges()]);
      setFriends(f);
      setCh(c);
      void s.refreshInbox();
    } catch (e) {
      s.toast(errorText(e), 'error');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.api]);

  useEffect(() => {
    void load();
    // With the live connection the server says when something changed; the timer is the fallback.
    const t = setInterval(() => !document.hidden && void load(), s.api.live ? 30_000 : 8000);
    const onShow = () => !document.hidden && void load();
    document.addEventListener('visibilitychange', onShow);
    const offNudge = s.api.live?.onNudge(() => void load());
    // A challenge we sent was accepted: straight into the game.
    const offMatched = s.api.live?.onMatched((id) => navigate(`/game/${id}`));
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onShow);
      offNudge?.();
      offMatched?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    try {
      await fn();
      if (ok) s.toast(ok);
      await load();
    } catch (e) {
      s.toast(errorText(e), 'error');
    }
  };

  const search = async (e?: React.FormEvent) => {
    e?.preventDefault();
    try {
      setResults(await s.api.searchPlayers(query));
    } catch (err) {
      s.toast(errorText(err), 'error');
    }
  };

  // Every game has its own address: it can be reopened, shared and watched.
  const open = (id: string) => navigate(`/game/${id}`);

  const friendIds = new Set([...(friends?.friends ?? []), ...(friends?.incoming ?? []), ...(friends?.outgoing ?? [])].map((f) => f.id));
  const activeGames = ch?.games.filter((g) => g.status === 'active' && !g.ranked) ?? [];
  const pastGames = ch?.games.filter((g) => g.status === 'finished' && !g.ranked).slice(0, 8) ?? [];

  return (
    <section className="page friends">
      <div className="page-head page-head-row">
        <div>
          <h1>{t('Друзі')}</h1>
          <p className="muted">
            {t('Ваш код:')} <span className="tag-chip">#{s.profile.tag}</span> {t('— дайте його другу, щоб він вас знайшов.')}
          </p>
        </div>
      </div>
      {s.api.mode === 'local' && (
        <p className="panel small muted demo-banner">
          {t('Демо-режим без сервера: друзі — це інші акаунти в цьому браузері. Справжні друзі та ігри між різними пристроями запрацюють, коли сайт запущено з сервером (')}<code>npm start</code>).
        </p>
      )}

      <form className="search-row" onSubmit={search}>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('Нікнейм або код #ABC123')} aria-label={t('Пошук гравця')} />
        <button className="btn btn-primary" disabled={query.trim().length < 2}>
          {t('Знайти')}
        </button>
      </form>
      {results && (
        <div className="panel">
          {results.length === 0 ? (
            <p className="muted small">{t('Нікого не знайдено.')}</p>
          ) : (
            <div className="player-list">
              {results.map((p) => (
                <PlayerRow key={p.id} p={p} onOpen={() => setViewing(p.id)}>
                  {friendIds.has(p.id) ? (
                    <span className="muted small">{t('уже в списку')}</span>
                  ) : (
                    <button className="btn btn-sm btn-primary" onClick={() => run(() => s.api.addFriend(p.id), t('Заявку надіслано: {0}', p.name))}>
                      {t('+ Додати')}
                    </button>
                  )}
                </PlayerRow>
              ))}
            </div>
          )}
        </div>
      )}

      {(ch?.incoming.length ?? 0) > 0 && (
        <>
          <div className="section-head">
            <h2>{t('⚔ Вас викликають')}</h2>
          </div>
          <div className="player-list">
            {ch!.incoming.map((c) => (
              <PlayerRow key={c.id} p={c.from} onOpen={() => setViewing(c.from.id)} highlight>
                <button
                  className="btn btn-sm btn-primary"
                  onClick={() =>
                    run(async () => {
                      const r = await s.api.respondChallenge(c.id, true, s.profile.activeDeckId ?? undefined);
                      if (r.pvpId) open(r.pvpId);
                    })
                  }
                >
                  {t('Прийняти')}
                </button>
                <button className="btn btn-sm" onClick={() => run(() => s.api.respondChallenge(c.id, false))}>
                  {t('Відхилити')}
                </button>
              </PlayerRow>
            ))}
          </div>
        </>
      )}

      {activeGames.length > 0 && (
        <>
          <div className="section-head">
            <h2>{t('Ігри з друзями')}</h2>
          </div>
          <div className="player-list">
            {activeGames.map((g) => (
              <PlayerRow key={g.id} p={g.opponent} onOpen={() => setViewing(g.opponent.id)} highlight={g.yourTurn}>
                <span className={`pill ${g.yourTurn ? 'pill-ok' : ''}`}>{g.yourTurn ? t('ваш хід') : t('хід друга')}</span>
                <button className="btn btn-sm btn-primary" onClick={() => open(g.id)}>
                  {g.yourTurn ? t('Ходити') : t('Відкрити')}
                </button>
              </PlayerRow>
            ))}
          </div>
        </>
      )}

      {(friends?.live.length ?? 0) > 0 && (
        <>
          <div className="section-head">
            <h2>{t('👁 Друзі грають зараз')}</h2>
          </div>
          <div className="player-list">
            {friends!.live.map((g) => (
              <div key={g.id} className="player-row live-row">
                <span className="live-vs">
                  <Avatar card={g.white.avatar} /> <b>{g.white.name}</b> <span className="muted">vs</span> <Avatar card={g.black.avatar} />{' '}
                  <b>{g.black.name}</b>
                  <small className="muted">
                    {t('{0} · хід {1}', g.ranked ? t('ліга гравців') : t('дружня'), Math.floor(g.moves / 2) + 1)}
                  </small>
                </span>
                <button className="btn btn-sm" onClick={() => open(g.id)}>
                  {t('Дивитися')}
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {(friends?.incoming.length ?? 0) > 0 && (
        <>
          <div className="section-head">
            <h2>{t('Заявки в друзі')}</h2>
          </div>
          <div className="player-list">
            {friends!.incoming.map((f) => (
              <PlayerRow key={f.linkId} p={f} onOpen={() => setViewing(f.id)} highlight>
                <button className="btn btn-sm btn-primary" onClick={() => run(() => s.api.respondFriend(f.linkId, true), t('{0} тепер ваш друг', f.name))}>
                  {t('Прийняти')}
                </button>
                <button className="btn btn-sm" onClick={() => run(() => s.api.respondFriend(f.linkId, false))}>
                  {t('Відхилити')}
                </button>
              </PlayerRow>
            ))}
          </div>
        </>
      )}

      <div className="section-head">
        <h2>
          {t('Друзі')}{' '}<span className="muted small">{friends?.friends.length ?? 0}</span>
        </h2>
      </div>
      {!friends ? (
        <p className="muted">{t('Завантаження…')}</p>
      ) : friends.friends.length === 0 ? (
        <div className="panel empty-friends">
          <Icon name="users" />
          <p className="muted">{t('Поки порожньо. Знайдіть друга за нікнеймом або кодом і надішліть заявку.')}</p>
        </div>
      ) : (
        <div className="player-list">
          {friends.friends.map((f) => {
            const sent = ch?.outgoing.find((c) => c.to.id === f.id);
            return (
              <PlayerRow key={f.linkId} p={f} onOpen={() => setViewing(f.id)}>
                {sent ? (
                  <button className="btn btn-sm" onClick={() => run(() => s.api.respondChallenge(sent.id, false), t('Виклик скасовано'))}>
                    {t('Скасувати виклик')}
                  </button>
                ) : (
                  <button
                    className="btn btn-sm btn-primary"
                    onClick={() =>
                      run(() => s.api.challengeFriend(f.id, s.profile.activeDeckId ?? undefined), t('Виклик надіслано: {0}. Гра почнеться, коли друг прийме.', f.name))
                    }
                  >
                    {t('⚔ Викликати')}
                  </button>
                )}
              </PlayerRow>
            );
          })}
        </div>
      )}

      {(friends?.outgoing.length ?? 0) > 0 && (
        <>
          <div className="section-head">
            <h2>{t('Надіслані заявки')}</h2>
          </div>
          <div className="player-list">
            {friends!.outgoing.map((f) => (
              <PlayerRow key={f.linkId} p={f} onOpen={() => setViewing(f.id)}>
                <button className="btn btn-sm btn-ghost" onClick={() => run(() => s.api.removeFriend(f.linkId))}>
                  {t('Відкликати')}
                </button>
              </PlayerRow>
            ))}
          </div>
        </>
      )}

      {pastGames.length > 0 && (
        <>
          <div className="section-head">
            <h2>{t('Минулі ігри')}</h2>
          </div>
          <div className="player-list">
            {pastGames.map((g) => (
              <PlayerRow key={g.id} p={g.opponent} onOpen={() => setViewing(g.opponent.id)}>
                <span className={`pill out-${g.outcome}`}>{g.outcome === 'win' ? t('перемога') : g.outcome === 'loss' ? t('поразка') : t('нічия')}</span>
                <button className="btn btn-sm btn-ghost" onClick={() => open(g.id)}>
                  {t('Переглянути')}
                </button>
              </PlayerRow>
            ))}
          </div>
        </>
      )}

      {viewing && (
        <PlayerModal
          userId={viewing}
          onClose={() => setViewing(null)}
          onChanged={load}
          remove={(() => {
            const f = friends?.friends.find((x) => x.id === viewing);
            return f ? () => run(() => s.api.removeFriend(f.linkId), t('Прибрано з друзів')).then(() => setViewing(null)) : undefined;
          })()}
        />
      )}
    </section>
  );
}

export function PlayerRow({
  p,
  onOpen,
  highlight = false,
  children,
}: {
  p: PlayerCard;
  onOpen: () => void;
  highlight?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className={`player-row ${highlight ? 'highlight' : ''}`}>
      <button className="player-who" onClick={onOpen}>
        <span className="avatar-wrap">
          <Avatar card={p.avatar} />
          <span className={`presence ${p.online ? 'on' : ''}`} />
        </span>
        <span className="player-text">
          <b>{p.name}</b>
          <small className="muted">
            🏆 {p.trophies} · {lastSeenText(p)}
          </small>
        </span>
      </button>
      <span className="player-actions">{children}</span>
    </div>
  );
}
