import { useState } from 'react';
import type { MatchStart } from '../api/client';
import { captureFxById } from '../economy/captureFx';
import { TRIALS, type Trial } from '../economy/leagues';
import { packName } from '../economy/packs';
import { botLevel } from '../engine/bot/levels';
import { CARD_BY_ID, PIECE_NAMES, RARITY_NAMES } from '../engine/cards';
import { cardArt, packArt } from './cardArt';
import { navigate } from './router';
import type { FxName } from './fxSprites';
import { Game } from './MatchPage';
import { errorText, useSession } from './state';

const DIFFICULTY: Record<1 | 2 | 3, string> = { 1: 'Легке', 2: 'Середнє', 3: 'Дуже складне' };

/** Opens the battle screen on the player ladder, where the arena trial is played. */
function findOpponent() {
  try {
    localStorage.setItem('uc.ladder', 'pvp');
  } catch {
    // not remembered
  }
  navigate('/play');
}

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
          if (v.trial?.card) await s.refresh();
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
          Серії перемог поспіль — проти ботів або живих гравців. Одна поразка чи нічия завершує спробу. Вхід коштує осколки, а за найважче
          випробування дається картка, якої немає в жодному паку.
        </p>
      </div>

      <div className="trial-list">
        {TRIALS.map((t) => {
          const r = profile.trials[t.id];
          const active = r?.status === 'active';
          const prizeCard = t.rewardCard && !s.collection.owned[t.rewardCard] ? CARD_BY_ID[t.rewardCard] : null;
          const prizeName = prizeCard ? `Картка «${prizeCard.name}»` : packName(t.reward);
          const prizeArt = prizeCard ? cardArt(prizeCard.id)! : packArt(t.reward);
          return (
            <article key={t.id} className={`trial-card trial-${t.id} ${active ? 'active' : ''} ${prizeCard ? 'has-card' : ''}`}>
              <div className="trial-head">
                <span className={`trial-prize ${prizeCard ? `r-${prizeCard.rarity}` : ''}`}>
                  <img className="pixel" src={prizeArt} alt="" />
                </span>
                <div>
                  <div className="trial-tags">
                    <span className={`pill trial-diff d${t.difficulty}`}>{DIFFICULTY[t.difficulty]}</span>
                    <span className="pill">{t.kind === 'pvp' ? '⚔ з гравцями' : '🤖 з ботами'}</span>
                  </div>
                  <h2>{t.name}</h2>
                  <p className="muted">{t.description}</p>
                  <span className="pill pill-shop">Нагорода: {prizeName}</span>
                </div>
              </div>

              {prizeCard && (
                <p className="trial-card-rules small">
                  <b>{prizeCard.name}</b> · {RARITY_NAMES[prizeCard.rarity].toLowerCase()} {PIECE_NAMES[prizeCard.pieceType].toLowerCase()}:{' '}
                  {prizeCard.rulesText}
                </p>
              )}

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
                        <b>{t.kind === 'pvp' ? `Перемога ${i + 1}` : b.name}</b>
                        <small className="muted">{t.kind === 'pvp' ? 'живий суперник' : `~${b.elo} Elo`}</small>
                      </span>
                    </li>
                  );
                })}
                <li className={`trial-round prize ${r?.status === 'won' ? 'done' : ''}`}>
                  <img className="pixel" src={prizeArt} alt="" />
                  <span>
                    <b>{prizeName}</b>
                  </span>
                </li>
              </ol>

              <div className="trial-actions">
                {active ? (
                  t.kind === 'pvp' ? (
                    <>
                      <button className="btn btn-battle" onClick={() => findOpponent()}>
                        Перемога {r.wins + 1} з {t.opponents.length}: шукати суперника
                      </button>
                      <span className="muted small">Рахуються ігри в лізі гравців: поразка чи нічия завершує спробу.</span>
                    </>
                  ) : (
                    <>
                      <button className="btn btn-battle" disabled={busy === t.id} onClick={() => play(t)}>
                        Раунд {r.wins + 1} з {t.opponents.length}: грати
                      </button>
                      <span className="muted small">Не залишайте партію: незавершена гра зараховується як поразка.</span>
                    </>
                  )
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
    </section>
  );
}
