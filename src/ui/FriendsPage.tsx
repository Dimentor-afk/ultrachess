import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ChallengesView, FriendsView, PlayerCard, PvpState } from '../api/client';
import type { Action } from '../engine/match';
import { Game, type RemoteGame } from './MatchPage';
import { PlayerModal } from './PlayerModal';
import { Avatar } from './common';
import { Icon } from './icons';
import { errorText, useSession } from './state';

function lastSeenText(p: PlayerCard): string {
  if (p.online) return 'онлайн';
  if (!p.lastSeen) return 'давно не заходив';
  const min = Math.round((Date.now() - p.lastSeen) / 60000);
  if (min < 60) return `був ${min} хв тому`;
  const h = Math.round(min / 60);
  if (h < 24) return `був ${h} год тому`;
  return `був ${new Date(p.lastSeen).toLocaleDateString('uk-UA')}`;
}

export function FriendsPage() {
  const s = useSession();
  const [friends, setFriends] = useState<FriendsView | null>(null);
  const [ch, setCh] = useState<ChallengesView | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlayerCard[] | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const [playing, setPlaying] = useState<PvpState | null>(null);

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
    if (playing) return;
    void load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [load, playing]);

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

  const open = async (id: string) => {
    try {
      setPlaying(await s.api.pvpState(id));
    } catch (e) {
      s.toast(errorText(e), 'error');
    }
  };

  const remote = useMemo<RemoteGame | null>(() => {
    if (!playing) return null;
    const id = playing.id;
    return {
      opponentName: playing.opponent.name,
      opponentAvatar: playing.opponent.avatar,
      initialActions: playing.actions,
      resignedBy: playing.resignedBy,
      poll: async () => {
        const st = await s.api.pvpState(id);
        return { actions: st.actions, resignedBy: st.resignedBy };
      },
      send: async (action: Action, expected: number) => {
        await s.api.pvpAction(id, action, expected);
      },
      resign: async () => {
        await s.api.pvpResign(id);
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing?.id]);

  if (playing && remote) {
    const mine = playing.color === 'w' ? playing.whiteDeck : playing.blackDeck;
    const theirs = playing.color === 'w' ? playing.blackDeck : playing.whiteDeck;
    return (
      <Game
        key={playing.id}
        start={{ matchId: playing.id, ranked: false, color: playing.color, botLevel: 0, playerDeck: mine, botDeck: theirs }}
        playerName={s.profile.name}
        playerAvatar={s.profile.avatar}
        trophies={s.profile.trophies}
        remote={remote}
        onExit={() => {
          setPlaying(null);
          void load();
        }}
      />
    );
  }

  const friendIds = new Set([...(friends?.friends ?? []), ...(friends?.incoming ?? []), ...(friends?.outgoing ?? [])].map((f) => f.id));
  const activeGames = ch?.games.filter((g) => g.status === 'active') ?? [];
  const pastGames = ch?.games.filter((g) => g.status === 'finished').slice(0, 8) ?? [];

  return (
    <section className="page friends">
      <div className="page-head page-head-row">
        <div>
          <h1>Друзі</h1>
          <p className="muted">
            Ваш код: <span className="tag-chip">#{s.profile.tag}</span> — дайте його другу, щоб він вас знайшов.
          </p>
        </div>
      </div>
      {s.api.mode === 'local' && (
        <p className="panel small muted demo-banner">
          Демо-режим без сервера: друзі — це інші акаунти в цьому браузері. Справжні друзі та ігри між різними пристроями запрацюють, коли сайт
          запущено з сервером (<code>npm start</code>).
        </p>
      )}

      <form className="search-row" onSubmit={search}>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Нікнейм або код #ABC123" aria-label="Пошук гравця" />
        <button className="btn btn-primary" disabled={query.trim().length < 2}>
          Знайти
        </button>
      </form>
      {results && (
        <div className="panel">
          {results.length === 0 ? (
            <p className="muted small">Нікого не знайдено.</p>
          ) : (
            <div className="player-list">
              {results.map((p) => (
                <PlayerRow key={p.id} p={p} onOpen={() => setViewing(p.id)}>
                  {friendIds.has(p.id) ? (
                    <span className="muted small">уже в списку</span>
                  ) : (
                    <button className="btn btn-sm btn-primary" onClick={() => run(() => s.api.addFriend(p.id), `Заявку надіслано: ${p.name}`)}>
                      + Додати
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
            <h2>⚔ Вас викликають</h2>
          </div>
          <div className="player-list">
            {ch!.incoming.map((c) => (
              <PlayerRow key={c.id} p={c.from} onOpen={() => setViewing(c.from.id)} highlight>
                <button
                  className="btn btn-sm btn-primary"
                  onClick={() =>
                    run(async () => {
                      const r = await s.api.respondChallenge(c.id, true, s.profile.activeDeckId ?? undefined);
                      if (r.pvpId) await open(r.pvpId);
                    })
                  }
                >
                  Прийняти
                </button>
                <button className="btn btn-sm" onClick={() => run(() => s.api.respondChallenge(c.id, false))}>
                  Відхилити
                </button>
              </PlayerRow>
            ))}
          </div>
        </>
      )}

      {activeGames.length > 0 && (
        <>
          <div className="section-head">
            <h2>Ігри з друзями</h2>
          </div>
          <div className="player-list">
            {activeGames.map((g) => (
              <PlayerRow key={g.id} p={g.opponent} onOpen={() => setViewing(g.opponent.id)} highlight={g.yourTurn}>
                <span className={`pill ${g.yourTurn ? 'pill-ok' : ''}`}>{g.yourTurn ? 'ваш хід' : 'хід друга'}</span>
                <button className="btn btn-sm btn-primary" onClick={() => open(g.id)}>
                  {g.yourTurn ? 'Ходити' : 'Відкрити'}
                </button>
              </PlayerRow>
            ))}
          </div>
        </>
      )}

      {(friends?.incoming.length ?? 0) > 0 && (
        <>
          <div className="section-head">
            <h2>Заявки в друзі</h2>
          </div>
          <div className="player-list">
            {friends!.incoming.map((f) => (
              <PlayerRow key={f.linkId} p={f} onOpen={() => setViewing(f.id)} highlight>
                <button className="btn btn-sm btn-primary" onClick={() => run(() => s.api.respondFriend(f.linkId, true), `${f.name} тепер ваш друг`)}>
                  Прийняти
                </button>
                <button className="btn btn-sm" onClick={() => run(() => s.api.respondFriend(f.linkId, false))}>
                  Відхилити
                </button>
              </PlayerRow>
            ))}
          </div>
        </>
      )}

      <div className="section-head">
        <h2>
          Друзі <span className="muted small">{friends?.friends.length ?? 0}</span>
        </h2>
      </div>
      {!friends ? (
        <p className="muted">Завантаження…</p>
      ) : friends.friends.length === 0 ? (
        <div className="panel empty-friends">
          <Icon name="users" />
          <p className="muted">Поки порожньо. Знайдіть друга за нікнеймом або кодом і надішліть заявку.</p>
        </div>
      ) : (
        <div className="player-list">
          {friends.friends.map((f) => {
            const sent = ch?.outgoing.find((c) => c.to.id === f.id);
            return (
              <PlayerRow key={f.linkId} p={f} onOpen={() => setViewing(f.id)}>
                {sent ? (
                  <button className="btn btn-sm" onClick={() => run(() => s.api.respondChallenge(sent.id, false), 'Виклик скасовано')}>
                    Скасувати виклик
                  </button>
                ) : (
                  <button
                    className="btn btn-sm btn-primary"
                    onClick={() =>
                      run(() => s.api.challengeFriend(f.id, s.profile.activeDeckId ?? undefined), `Виклик надіслано: ${f.name}. Гра почнеться, коли друг прийме.`)
                    }
                  >
                    ⚔ Викликати
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
            <h2>Надіслані заявки</h2>
          </div>
          <div className="player-list">
            {friends!.outgoing.map((f) => (
              <PlayerRow key={f.linkId} p={f} onOpen={() => setViewing(f.id)}>
                <button className="btn btn-sm btn-ghost" onClick={() => run(() => s.api.removeFriend(f.linkId))}>
                  Відкликати
                </button>
              </PlayerRow>
            ))}
          </div>
        </>
      )}

      {pastGames.length > 0 && (
        <>
          <div className="section-head">
            <h2>Минулі ігри</h2>
          </div>
          <div className="player-list">
            {pastGames.map((g) => (
              <PlayerRow key={g.id} p={g.opponent} onOpen={() => setViewing(g.opponent.id)}>
                <span className={`pill out-${g.outcome}`}>{g.outcome === 'win' ? 'перемога' : g.outcome === 'loss' ? 'поразка' : 'нічия'}</span>
                <button className="btn btn-sm btn-ghost" onClick={() => open(g.id)}>
                  Переглянути
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
            return f ? () => run(() => s.api.removeFriend(f.linkId), 'Прибрано з друзів').then(() => setViewing(null)) : undefined;
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
