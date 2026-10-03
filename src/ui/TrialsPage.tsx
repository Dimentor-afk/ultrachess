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
import { Game } from './LazyGame';
import { errorText, useSession } from './state';
import { t } from '../i18n';

const DIFFICULTY: Record<1 | 2 | 3, string> = { 1: t('Легке'), 2: t('Середнє'), 3: t('Дуже складне') };

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

  const enter = (trial: Trial) =>
    run(trial.id, async () => {
      s.setProfile(await api.enterTrial(trial.id));
      s.toast(t('Вхід оплачено: {0}. Удачі!', trial.name));
    });

  const play = (trial: Trial) =>
    run(trial.id, async () => {
      setGame({ start: await api.startMatch({ ranked: false, trial: trial.id }), key: Date.now() });
    });

  if (game) {
    const trial = TRIALS.find((x) => x.id === game.start.trial?.id)!;
    return (
      <Game
        key={game.key}
        start={game.start}
        playerName={profile.name}
        playerAvatar={profile.avatar}
        captureFx={{ [game.start.color]: captureFxById(profile.captureFx).sprite as FxName }}
        trophies={profile.trophies}
        onAction={(action, v) => api.matchAction(game.start.matchId, action, v)}
        onFinish={async (resigned) => {
          const v = await api.finishMatch(game.start.matchId, resigned);
          s.setProfile(v.profile);
          s.setPacks(await api.packs());
          if (v.trial?.card) await s.refresh();
          return v;
        }}
        onExit={() => setGame(null)}
        rematchLabel={t('Наступний раунд')}
        onRematch={
          profile.trials[trial.id]?.status === 'active'
            ? () => {
                setGame(null);
                void play(trial);
              }
            : undefined
        }
      />
    );
  }

  return (
    <section className="page trials">
      <div className="page-head">
        <h1>{t('Випробування')}</h1>
        <p className="muted">
          {t('Серії перемог поспіль — проти ботів або живих гравців. Одна поразка чи нічия завершує спробу. Вхід коштує уламки, а за найважче випробування дається картка, якої немає в жодному паку.')}
        </p>
      </div>

      <div className="trial-list">
        {TRIALS.map((trial) => {
          const r = profile.trials[trial.id];
          const active = r?.status === 'active';
          const prizeCard = trial.rewardCard && !s.collection.owned[trial.rewardCard] ? CARD_BY_ID[trial.rewardCard] : null;
          const prizeName = prizeCard ? t('Картка «{0}»', prizeCard.name) : packName(trial.reward);
          const prizeArt = prizeCard ? cardArt(prizeCard.id)! : packArt(trial.reward);
          return (
            <article key={trial.id} className={`trial-card trial-${trial.id} ${active ? 'active' : ''} ${prizeCard ? 'has-card' : ''}`}>
              <div className="trial-head">
                <span className={`trial-prize ${prizeCard ? `r-${prizeCard.rarity}` : ''}`}>
                  <img className="pixel" src={prizeArt} alt="" />
                </span>
                <div>
                  <div className="trial-tags">
                    <span className={`pill trial-diff d${trial.difficulty}`}>{DIFFICULTY[trial.difficulty]}</span>
                    <span className="pill">{trial.kind === 'pvp' ? t('⚔ з гравцями') : t('🤖 з ботами')}</span>
                  </div>
                  <h2>{trial.name}</h2>
                  <p className="muted">{trial.description}</p>
                  <span className="pill pill-shop">{t('Нагорода:')}{' '}{prizeName}</span>
                </div>
              </div>

              {prizeCard && (
                <p className="trial-card-rules small">
                  <b>{prizeCard.name}</b> · {RARITY_NAMES[prizeCard.rarity].toLowerCase()} {PIECE_NAMES[prizeCard.pieceType].toLowerCase()}:{' '}
                  {prizeCard.rulesText}
                </p>
              )}

              <ol className="trial-rounds">
                {trial.opponents.map((lvl, i) => {
                  const b = botLevel(lvl);
                  const done = r && (r.status !== 'lost' || i < r.wins) && i < r.wins;
                  const current = active && i === r.wins;
                  const failed = r?.status === 'lost' && i === r.wins;
                  return (
                    <li key={i} className={`trial-round ${done ? 'done' : ''} ${current ? 'current' : ''} ${failed ? 'failed' : ''}`}>
                      <span className="trial-round-n">{done ? '✓' : failed ? '✗' : i + 1}</span>
                      <span>
                        <b>{trial.kind === 'pvp' ? t('Перемога {0}', i + 1) : b.name}</b>
                        <small className="muted">{trial.kind === 'pvp' ? t('живий суперник') : `~${b.elo} Elo`}</small>
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
                  trial.kind === 'pvp' ? (
                    <>
                      <button className="btn btn-battle" onClick={() => findOpponent()}>
                        {t('Перемога {0} з {1}: шукати суперника', r.wins + 1, trial.opponents.length)}
                      </button>
                      <span className="muted small">{t('Рахуються ігри в лізі гравців: поразка чи нічия завершує спробу.')}</span>
                    </>
                  ) : (
                    <>
                      <button className="btn btn-battle" disabled={busy === trial.id} onClick={() => play(trial)}>
                        {t('Раунд {0} з {1}: грати', r.wins + 1, trial.opponents.length)}
                      </button>
                      <span className="muted small">{t('Не залишайте партію: незавершена гра зараховується як поразка.')}</span>
                    </>
                  )
                ) : (
                  <>
                    {r?.status === 'won' && <span className="pill pill-ok">{t('Минулого разу пройдено!')}</span>}
                    {r?.status === 'lost' && (
                      <span className="pill">
                        {t('Минула спроба: {0} з {1}', r.wins, trial.opponents.length)}
                      </span>
                    )}
                    <button className="btn btn-primary btn-price" disabled={busy === trial.id || profile.shards < trial.cost} onClick={() => enter(trial)}>
                      {t('Увійти за 💎 {0}', trial.cost)}
                    </button>
                    {profile.shards < trial.cost && <span className="muted small">{t('У вас {0} уламків', profile.shards)}</span>}
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
