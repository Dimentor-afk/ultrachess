import { useState } from 'react';
import type { MatchStart } from '../api/client';
import { captureFxById } from '../economy/captureFx';
import { TRIALS, type Trial } from '../economy/leagues';
import { packName } from '../economy/packs';
import { botLevel } from '../engine/bot/levels';
import { packArt } from './cardArt';
import type { FxName } from './fxSprites';
import { Game } from './MatchPage';
import { errorText, useSession } from './state';

/** Trials: pay shards to enter, win every game in a row, take the prize. */
export function TrialsPage() {
  const s = useSession();
  const { api, profile } = s;
  const [game, setGame] = useState<{ start: MatchStart; key: number } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      s.toast(errorText(e), 'error');
      s.setProfile((await api.me()) ?? profile);
    } finally {
      setBusy(null);
    }
  };

  const enter = (t: Trial) =>
    run(t.id, async () => {
      s.setProfile(await api.enterTrial(t.id));
      s.toast(`Вхід оплачено: ${t.name}. Удачі!`);
    });

  const play = (t: Trial) =>
    run(t.id, async () => {
      setGame({ start: await api.startMatch({ ranked: false, trial: t.id }), key: Date.now() });
    });

  if (game) {
    const t = TRIALS.find((x) => x.id === game.start.trial?.id)!;
    return (
      <Game
        key={game.key}
        start={game.start}
        playerName={profile.name}
        playerAvatar={profile.avatar}
        captureFx={{ [game.start.color]: captureFxById(profile.captureFx).sprite as FxName }}
        trophies={profile.trophies}
        onFinish={async (actions, resigned) => {
          const v = await api.finishMatch(game.start.matchId, actions, resigned);
          s.setProfile(v.profile);
          s.setPacks(await api.packs());
          return v;
        }}
        onExit={() => setGame(null)}
        rematchLabel="Наступний раунд"
        onRematch={
          profile.trials[t.id]?.status === 'active'
            ? () => {
                setGame(null);
                void play(t);
              }
            : undefined
        }
      />
    );
  }

  return (
    <section className="page trials">
      <div className="page-head">
        <h1>Випробування</h1>
        <p className="muted">
          Серія партій проти ботів, які сильнішають з кожним раундом. Потрібно виграти всі поспіль: одна поразка чи нічия — і спробу завершено.
          Вхід платний, але нагорода варта того.
        </p>
      </div>

      <div className="trial-list">
        {TRIALS.map((t) => {
          const r = profile.trials[t.id];
          const active = r?.status === 'active';
          return (
            <article key={t.id} className={`trial-card ${active ? 'active' : ''}`}>
              <div className="trial-head">
                <img src={packArt(t.reward)} alt="" />
                <div>
                  <h2>{t.name}</h2>
                  <p className="muted">{t.description}</p>
                  <span className="pill">Нагорода: {packName(t.reward)}</span>
                </div>
              </div>

              <ol className="trial-rounds">
                {t.opponents.map((lvl, i) => {
                  const b = botLevel(lvl);
                  const done = r && (r.status !== 'lost' || i < r.wins) && i < r.wins;
                  const current = active && i === r.wins;
                  const failed = r?.status === 'lost' && i === r.wins;
                  return (
                    <li key={i} className={`trial-round ${done ? 'done' : ''} ${current ? 'current' : ''} ${failed ? 'failed' : ''}`}>
                      <span className="trial-round-n">{done ? '✓' : failed ? '✗' : i + 1}</span>
                      <span>
                        <b>{b.name}</b>
                        <small className="muted">~{b.elo} Elo</small>
                      </span>
                    </li>
                  );
                })}
                <li className={`trial-round prize ${r?.status === 'won' ? 'done' : ''}`}>
                  <img src={packArt(t.reward)} alt="" />
                  <span>
                    <b>{packName(t.reward)}</b>
                  </span>
                </li>
              </ol>

              <div className="trial-actions">
                {active ? (
                  <>
                    <button className="btn btn-battle" disabled={busy === t.id} onClick={() => play(t)}>
                      Раунд {r.wins + 1} з {t.opponents.length}: грати
                    </button>
                    <span className="muted small">Не залишайте партію: незавершена гра зараховується як поразка.</span>
                  </>
                ) : (
                  <>
                    {r?.status === 'won' && <span className="pill pill-ok">Минулого разу пройдено!</span>}
                    {r?.status === 'lost' && (
                      <span className="pill">
                        Минула спроба: {r.wins} з {t.opponents.length}
                      </span>
                    )}
                    <button className="btn btn-primary btn-price" disabled={busy === t.id || profile.shards < t.cost} onClick={() => enter(t)}>
                      Увійти за 💎 {t.cost}
                    </button>
                    {profile.shards < t.cost && <span className="muted small">У вас {profile.shards} осколків</span>}
                  </>
                )}
              </div>
            </article>
          );
        })}
      </div>
      <p className="muted small">Нові випробування з’являтимуться згодом.</p>
    </section>
  );
}
