import { type CSSProperties, useEffect, useState } from 'react';
import type { MatchStart, WeeklyClaim, WeeklyView } from '../api/client';
import { captureFxById } from '../economy/captureFx';
import { packName } from '../economy/packs';
import { SKIN_BY_ID } from '../economy/skins';
import {
  DIVISIONS,
  SEASON,
  WEEKLY_GAMES,
  WEEKLY_LIVE,
  WEEKLY_MIN_TROPHIES,
  WEEKLY_MODES,
  WEEKLY_TIERS,
  type WeeklyMode,
  type WeeklyReward,
  divisionByN,
  weeklyReward,
} from '../economy/weekly';
import { TitlePlate } from './Achievements';
import { packArt } from './cardArt';
import { useCountdown } from './cosmetics';
import type { FxName } from './fxSprites';
import { Game } from './LazyGame';
import { currentPath, onNavigate } from './router';
import { seasonStart, weekMoment, weekSchedule } from './weeklyTime';
import { errorText, useSession } from './state';
import { t, tr } from '../i18n';

/** The emblem of a division: its numeral on a shield of its colour. */
export function DivisionBadge({ n, size = 'md' }: { n: number; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <span className={`div-badge div-${n} ${size}`} aria-hidden="true">
      <span>{divisionByN(n).roman}</span>
    </span>
  );
}

const skinsLabel = (n: number) => (n === 1 ? t('скін') : n < 5 ? t('{0} скіни', n) : t('{0} скінів', n));

/** What a reward holds, as chips: skins (a tap shows them up close), the plate, packs, gold and shards. */
export function RewardChips({ reward, big }: { reward: WeeklyReward; big?: boolean }) {
  const [preview, setPreview] = useState(false);
  const packs = reward.packs.reduce<Record<string, number>>((acc, p) => ({ ...acc, [p]: (acc[p] ?? 0) + 1 }), {});
  return (
    <span className={`reward-chips ${big ? 'big' : ''}`}>
      {reward.skins.length > 0 && (
        <button type="button" className="rc rc-skins" onClick={() => setPreview(true)} title={reward.skins.map((id) => tr(SKIN_BY_ID[id].name)).join(', ')}>
          {reward.skins.map((id) => (
            <img key={id} src={SKIN_BY_ID[id].board} alt="" />
          ))}
          <small>{skinsLabel(reward.skins.length)}</small>
        </button>
      )}
      {preview && <SkinPreview skins={reward.skins} onClose={() => setPreview(false)} />}
      {reward.plate && (
        <span className="rc rc-plate">
          <TitlePlate id={reward.plate} small />
        </span>
      )}
      {Object.entries(packs).map(([type, n]) => (
        <span key={type} className="rc rc-pack" title={packName(type as never)}>
          <img className="pixel" src={packArt(type as never)} alt="" />
          {n > 1 && <b>×{n}</b>}
        </span>
      ))}
      {reward.gold > 0 && <span className="rc rc-gold">🪙 {reward.gold}</span>}
      {reward.shards > 0 && <span className="rc rc-shards">💎 {reward.shards}</span>}
    </span>
  );
}

/**
 * "Тиждень слави": the weekly league against bots. This week's state, the division, the 15 games,
 * the reward road and every division's rewards; games are played right here.
 */
export function WeeklyPage() {
  const s = useSession();
  const { api, profile } = s;
  const [view, setView] = useState<WeeklyView | null>(null);
  const [game, setGame] = useState<{ start: MatchStart; key: number } | null>(null);
  const [claim, setClaim] = useState<WeeklyClaim | null>(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<WeeklyMode>(modeFromPath);
  useEffect(() => onNavigate(() => setMode(modeFromPath())), []);

  const load = () => api.weekly().then(setView, (e) => s.toast(errorText(e), 'error'));
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const countdown = useCountdown(view ? (view.open ? view.closesAt : view.nextOpensAt) : null);

  const play = async () => {
    setBusy(true);
    try {
      setGame({ start: await api.startMatch({ ranked: false, weekly: true }), key: Date.now() });
    } catch (e) {
      s.toast(errorText(e), 'error');
      void load();
    } finally {
      setBusy(false);
    }
  };

  const take = async () => {
    setBusy(true);
    try {
      const c = await api.claimWeekly();
      setClaim(c);
      s.setProfile(c.profile);
      s.setPacks(await api.packs());
      void load();
    } catch (e) {
      s.toast(errorText(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  if (game) {
    return (
      <Game
        key={game.key}
        start={game.start}
        playerName={profile.name}
        playerAvatar={profile.avatar}
        playerTitle={profile.title}
        captureFx={{ [game.start.color]: captureFxById(profile.captureFx).sprite as FxName }}
        trophies={profile.ladders.bot.trophies}
        onAction={(action, v) => api.matchAction(game.start.matchId, action, v)}
        onFinish={async (resigned) => {
          const v = await api.finishMatch(game.start.matchId, resigned);
          s.setProfile(v.profile);
          return v;
        }}
        onExit={() => {
          setGame(null);
          void load();
        }}
        rematchLabel={t('Наступний матч')}
        onRematch={
          s.profile.weekly.open && !s.profile.weekly.settled && s.profile.weekly.played < WEEKLY_GAMES
            ? () => {
                setGame(null);
                void play();
              }
            : undefined
        }
      />
    );
  }

  const run = view?.run ?? null;
  const division = run ? run.division : view?.division ?? null;
  const wins = run ? run.results.filter((x) => x === 'w').length : 0;
  const played = run ? run.results.length : 0;
  const nextTier = WEEKLY_TIERS.find((x) => x > wins);
  const d = division ? divisionByN(division) : null;
  const claimable = !!view?.claimable;

  let action: { label: string; onClick: () => void; kind: string } | null = null;
  if (view) {
    if (claimable) action = { label: run?.lastWeek ? t('Забрати нагороди минулого тижня') : t('Забрати нагороди'), onClick: take, kind: 'claim' };
    else if (view.open && view.eligible && run?.playing) action = { label: t('Продовжити матч {0}/{1}', played + 1, WEEKLY_GAMES), onClick: play, kind: 'play' };
    else if (view.open && view.eligible && !run?.over) action = { label: run && !run.lastWeek ? t('Грати матч {0}/{1}', played + 1, WEEKLY_GAMES) : t('Почати тиждень'), onClick: play, kind: 'play' };
  }

  return (
    <section className="page weekly">
      <ModeSwitch mode={mode} />

      {mode === 'pvp' ? (
        <PvpSoon />
      ) : (
        <>
          <WeeklyHero open={view?.open ?? null} countdown={countdown} />
          {view && !view.eligible && !run && (
            <div className="panel wk-locked">
              <b>🔒 {t('Вхід з {0} кубків у лізі ботів', WEEKLY_MIN_TROPHIES)}</b>
              <div className="bar small-bar" aria-hidden="true">
                <span style={{ width: `${Math.min(100, (view.trophies / WEEKLY_MIN_TROPHIES) * 100)}%` }} />
              </div>
              <span className="muted small">{t('У вас {0} 🏆, ще {1}', view.trophies, WEEKLY_MIN_TROPHIES - view.trophies)}</span>
              <a className="btn btn-sm" href="#/play">
                {t('До ліги ботів')}
              </a>
            </div>
          )}

          {view && d && (view.eligible || run) && (
            <div className="wk-main">
              <div className="panel wk-division">
                <DivisionBadge n={d.n} size="lg" />
                <div>
                  <span className="eyebrow">{t('Дивізіон {0}', d.roman)}</span>
                  <h2>{tr(d.name)}</h2>
                  <span className="muted small">
                    {run
                      ? t('Ваш рейтинг тижня: {0}. Кожен матч новий бот: від вашого рейтингу до {1}, точна сила прихована.', run.rating, d.max ? d.max - 1 : '3000+')
                      : t('За вашими кубками ({0}) ви потрапите сюди. Дивізіон закріплюється на тиждень з першим матчем.', view.trophies)}
                  </span>
                  <span className="wk-note">🃏 {t('Колоди ботів з будь-якими картками, навіть міфологічними.')}</span>
                </div>
              </div>

              <div className="panel wk-progress">
                <div className="wk-score">
                  <b>{wins}</b>
                  <span>
                    {t('перемог')}
                    <small className="muted">{t('зіграно {0} з {1}', played, WEEKLY_GAMES)}</small>
                  </span>
                </div>
                <ol className="wk-results" aria-label={t('Матчі тижня')}>
                  {Array.from({ length: WEEKLY_GAMES }, (_, i) => {
                    const r = run?.results[i];
                    return (
                      <li key={i} className={r ? `r-${r}` : i === played && run?.playing ? 'now' : ''} title={r === 'w' ? t('Перемога') : r === 'l' ? t('Поразка') : r === 'd' ? t('Нічия') : ''}>
                        {r === 'w' ? '✓' : r === 'l' ? '✕' : r === 'd' ? '=' : i + 1}
                      </li>
                    );
                  })}
                </ol>
                <div className="wk-road" style={{ '--fill': `${Math.min(1, wins / WEEKLY_GAMES)}` } as CSSProperties}>
                  <span className="wk-road-bar" aria-hidden="true" />
                  {WEEKLY_TIERS.map((need, i) => (
                    <span key={need} className={`wk-node ${wins >= need ? 'got' : ''} ${run && i === run.tier ? 'mine' : ''}`} style={{ '--at': `${need / WEEKLY_GAMES}` } as CSSProperties}>
                      <b>{need}</b>
                    </span>
                  ))}
                </div>
                <p className="wk-next">
                  {run?.over
                    ? run.tier >= 0
                      ? run.claimed
                        ? t('Нагороди тижня отримано. До зустрічі в понеділок!')
                        : t('Тиждень завершено: ваша нагорода за {0} перемог готова.', WEEKLY_TIERS[run.tier])
                      : t('Цього тижня без нагороди: потрібно щонайменше 3 перемоги.')
                    : nextTier
                      ? t('До нагороди за {0} перемог: ще {1}', nextTier, nextTier - wins)
                      : t('Найвища нагорода тижня вже ваша')}
                </p>
                {run && run.tier >= 0 && run.reward && (
                  <div className="wk-current">
                    <span className="eyebrow">{run.over ? t('Ваша нагорода') : t('Зараз ви заробили')}</span>
                    <RewardChips reward={run.reward} />
                  </div>
                )}
              </div>
            </div>
          )}

          {action && (
            <button className={`btn btn-battle wk-action ${action.kind}`} disabled={busy} onClick={action.onClick}>
              {action.kind === 'claim' ? '🎁 ' : '⚔ '}
              {action.label}
            </button>
          )}
          {view && !view.open && !claimable && view.eligible && <p className="center muted">{t('Тиждень слави відпочиває до {0}.', weekMoment(view.nextOpensAt))}</p>}

          <RewardsPanel division={division} mineTier={run ? run.tier : null} />
        </>
      )}

      {claim && <ClaimModal claim={claim} onClose={() => setClaim(null)} />}
    </section>
  );
}

const modeFromPath = (): WeeklyMode => (currentPath().split('/')[2] === 'pvp' ? 'pvp' : 'bot');

/** The two weeks on one schedule: against bots now, against players soon. */
function ModeSwitch({ mode }: { mode: WeeklyMode }) {
  const { profile } = useSession();
  return (
    <div className="ladder-switch wk-modes" role="tablist" aria-label={t('Режим')}>
      {WEEKLY_MODES.map((m) => (
        <a key={m} role="tab" aria-selected={mode === m} href={m === 'bot' ? '#/weekly' : '#/weekly/pvp'} className={`ladder-tab ${mode === m ? 'on' : ''}`}>
          <span className="ladder-icon">{m === 'bot' ? '🤖' : '⚔'}</span>
          <span>
            <b>{m === 'bot' ? t('З ботами') : t('З гравцями')}</b>
            <small>{WEEKLY_LIVE[m] ? `🏆 ${profile.ladders[m].trophies}` : t('скоро')}</small>
          </span>
        </a>
      ))}
    </div>
  );
}

/** The season, the week's schedule in the player's own time, and how long until it opens or closes. */
function WeeklyHero({ open, countdown }: { open: boolean | null; countdown: string }) {
  const { from, to } = weekSchedule();
  return (
    <header className={`wk-hero ${open ? 'open' : 'closed'}`}>
      <span className="wk-rays" aria-hidden="true" />
      <img className="wk-hero-art" src={SKIN_BY_ID[SEASON.skins[4]].art} alt="" />
      <div className="wk-hero-text">
        <span className="wk-season-row">
          <span className="wk-season">{tr(SEASON.name)}</span>
          <small className="wk-season-dates">{t('старт {0} · кінець ?', seasonStart())}</small>
        </span>
        <h1>{t('Тиждень слави')}</h1>
        <p className="wk-when">
          {open === null ? (
            '…'
          ) : open ? (
            <>
              <span className="wk-live">● {t('Іде зараз')}</span>
              <span>{t('ще {0}', countdown)}</span>
            </>
          ) : (
            <span>{t('Наступний через {0}', countdown)}</span>
          )}
        </p>
        <small className="wk-sched">{t('{0} до {1}, ваш час', from, to)}</small>
        <small className="wk-sched">{t('{0} матчів проти ботів', WEEKLY_GAMES)}</small>
      </div>
    </header>
  );
}

/** Every division's rewards, five tiers each; the player's division opens first. */
function RewardsPanel({ division, mineTier }: { division: number | null; mineTier: number | null }) {
  const [tab, setTab] = useState<number | null>(null);
  const shown = tab ?? division ?? 5;
  return (
    <div className="panel wk-rewards">
      <div className="section-head">
        <h2>{t('Нагороди')}</h2>
        <span className="muted small">{t('за кожен рівень свої, не сумуються')}</span>
      </div>
      <div className="wk-tabs" role="tablist" aria-label={t('Дивізіони')}>
        {DIVISIONS.map((x) => (
          <button key={x.n} role="tab" aria-selected={shown === x.n} className={`wk-tab ${shown === x.n ? 'on' : ''} ${division === x.n ? 'mine' : ''}`} onClick={() => setTab(x.n)}>
            <DivisionBadge n={x.n} size="sm" />
            <span>
              <b>{tr(x.name)}</b>
              <small>{x.max ? `${x.min}–${x.max - 1}` : `${x.min}+`} 🏆</small>
            </span>
          </button>
        ))}
      </div>
      <ol className="wk-tiers">
        {WEEKLY_TIERS.map((need, i) => (
          <li key={need} className={`wk-tier ${division === shown && mineTier === i ? 'mine' : ''} ${i >= 3 ? 'season' : ''}`}>
            <span className="wk-tier-need">
              <b>{need}</b>
              <small>{t('перемог')}</small>
            </span>
            <RewardChips reward={weeklyReward(divisionByN(shown).n, i)} />
          </li>
        ))}
      </ol>
      <p className="muted small">
        {t('Нагороди видаються, коли зіграно всі {0} матчів, коли вищий рівень уже не досягти, або коли тиждень закінчився.', WEEKLY_GAMES)}
      </p>
    </div>
  );
}

/** The week against players: not here yet, a placeholder. */
function PvpSoon() {
  return (
    <div className="panel wk-soon-panel">
      <span className="wk-soon-icon" aria-hidden="true">
        ⚔
      </span>
      <h2>{t('Тиждень слави з гравцями')}</h2>
      <span className="pill">{t('скоро')}</span>
    </div>
  );
}

/** Skins up close: one at a time, big, with the arrows (or a tap on a thumbnail) to the others. */
function SkinPreview({ skins, onClose }: { skins: string[]; onClose: () => void }) {
  // The finest first: that is the one to look at.
  const list = [...skins].sort((a, b) => SKIN_BY_ID[b].tier - SKIN_BY_ID[a].tier);
  const [at, setAt] = useState(0);
  const k = SKIN_BY_ID[list[at]];
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') setAt((i) => Math.min(list.length - 1, i + 1));
      if (e.key === 'ArrowLeft') setAt((i) => Math.max(0, i - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [list.length, onClose]);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className={`modal skin-preview skin-t${k.tier}`} role="dialog" aria-modal="true" aria-label={tr(k.name)} onClick={(e) => e.stopPropagation()}>
        <button className="icon-btn skin-preview-close" onClick={onClose} aria-label={t('Закрити')}>
          ✕
        </button>
        <span className="wk-rays" aria-hidden="true" />
        <img key={k.id} className="skin-preview-art" src={k.art} alt="" />
        <span className="eyebrow">{t('Скін {0}/{1} · {2}', k.tier, SEASON.skins.length, tr(SEASON.name))}</span>
        <h2>{tr(k.name)}</h2>
        {list.length > 1 && (
          <div className="skin-preview-nav">
            <button className="btn patch-arrow" onClick={() => setAt(at - 1)} disabled={at === 0} aria-label={t('Назад')}>
              ←
            </button>
            <span className="skin-preview-thumbs">
              {list.map((id, i) => (
                <button key={id} type="button" className={i === at ? 'on' : ''} onClick={() => setAt(i)} aria-label={tr(SKIN_BY_ID[id].name)}>
                  <img src={SKIN_BY_ID[id].board} alt="" />
                </button>
              ))}
            </span>
            <button className="btn patch-arrow" onClick={() => setAt(at + 1)} disabled={at === list.length - 1} aria-label={t('Далі')}>
              →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** The weekly reward, opened: new skins first (one tap puts the best on), the plate, packs, gold. */
function ClaimModal({ claim, onClose }: { claim: WeeklyClaim; onClose: () => void }) {
  const s = useSession();
  const best = [...claim.skinsNew].sort((a, b) => SKIN_BY_ID[b].tier - SKIN_BY_ID[a].tier)[0];
  const [worn, setWorn] = useState(false);
  const wear = async () => {
    try {
      s.setProfile(await s.api.setSkin(SKIN_BY_ID[best].card, best));
      setWorn(true);
    } catch (e) {
      s.toast(errorText(e), 'error');
    }
  };
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal wk-claim" role="dialog" aria-modal="true" aria-label={t('Нагороди тижня')} onClick={(e) => e.stopPropagation()}>
        <span className="wk-rays" aria-hidden="true" />
        <h2>{t('Нагороди тижня')}</h2>
        {claim.skinsNew.length > 0 && (
          <div className="wk-claim-skins">
            {claim.skinsNew.map((id) => (
              <figure key={id} className={`skin-t${SKIN_BY_ID[id].tier}`}>
                <img src={SKIN_BY_ID[id].art} alt="" />
                <figcaption>
                  <small>{t('Новий скін')}</small>
                  <b>{tr(SKIN_BY_ID[id].name)}</b>
                </figcaption>
              </figure>
            ))}
          </div>
        )}
        {claim.skinsOwned.length > 0 && <p className="muted small">{t('Скіни, які вже були ({0}), замінено на 🪙 {1}', claim.skinsOwned.length, claim.dupeGold)}</p>}
        {claim.reward.plate && (
          <div className="wk-claim-plate">
            <small className="muted">{t('Нова плашка')}</small>
            <TitlePlate id={claim.reward.plate} />
          </div>
        )}
        <RewardChips reward={{ ...claim.reward, skins: [], plate: null }} big />
        <div className="editor-actions">
          {best && !worn && (
            <button className="btn btn-primary" onClick={wear}>
              {t('Вдягнути «{0}»', tr(SKIN_BY_ID[best].name))}
            </button>
          )}
          <button className={`btn ${best && !worn ? '' : 'btn-primary'}`} onClick={onClose}>
            {worn ? t('✓ Вдягнуто') : t('Чудово')}
          </button>
        </div>
        {claim.packs.length > 0 && <p className="muted small">{t('Паки чекають на головній.')}</p>}
      </div>
    </div>
  );
}
