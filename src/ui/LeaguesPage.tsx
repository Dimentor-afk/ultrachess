import { useEffect, useRef, useState } from 'react';
import { LADDER_NAMES, LADDER_PACK_LIMIT, LADDER_TROPHIES, LADDER_WIN_GOLD, LEAGUES, type Ladder } from '../economy/leagues';
import { packName } from '../economy/packs';
import { botLevel } from '../engine/bot/levels';
import { RARITY_NAMES } from '../engine/cards';
import { packArt } from './cardArt';
import { currentPath, onNavigate } from './router';
import { useSession } from './state';
import { t, tr } from '../i18n';

function ladderFromHash(): Ladder {
  return currentPath().includes('/pvp') ? 'pvp' : 'bot';
}

/** Both ladders, league by league: what each costs to reach and what it pays. */
export function LeaguesPage() {
  const { profile } = useSession();
  const [ladder, setLadder] = useState<Ladder>(ladderFromHash);
  useEffect(() => {
    return onNavigate(() => setLadder(ladderFromHash()));
  }, []);
  const lv = profile.ladders[ladder];
  const leagues = LEAGUES[ladder];
  // The road starts at the top league; open it where the player is, like a trophy road.
  const here = useRef<HTMLLIElement>(null);
  useEffect(() => {
    const t = setTimeout(() => here.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 250);
    return () => clearTimeout(t);
  }, [ladder]);

  return (
    <section className="page leagues">
      <div className="page-head">
        <h1>{t('Ліги')}</h1>
      </div>

      <div className="ladder-switch" role="tablist" aria-label={t('Драбина')}>
        {(['bot', 'pvp'] as Ladder[]).map((l) => (
          <a key={l} role="tab" aria-selected={ladder === l} href={`#/leagues/${l}`} className={`ladder-tab ${ladder === l ? 'on' : ''}`}>
            <span className="ladder-icon">{l === 'bot' ? '🤖' : '⚔'}</span>
            <span>
              <b>{LADDER_NAMES[l]}</b>
              <small>
                🏆 {profile.ladders[l].trophies} · {tr(profile.ladders[l].leagueName)}
              </small>
            </span>
          </a>
        ))}
      </div>

      <div className="panel ladder-rules">
        <span>
          {t('Перемога:')}{' '}<b>+{LADDER_TROPHIES[ladder].win} 🏆</b>, 🪙 {LADDER_WIN_GOLD[ladder]} {t('і пак')}
        </span>
        <span>
          {t('Поразка:')}{' '}<b>{LADDER_TROPHIES[ladder].loss} 🏆</b>
        </span>
        <span>
          {t('Паків за перемоги: до {0} на день (сьогодні {1})', LADDER_PACK_LIMIT[ladder], lv.packsToday)}
        </span>
        <span>{ladder === 'bot' ? t('Паки не вище рідкісного') : t('Цикл паків аж до легендарного')}</span>
        <span>
          {t('Рекорд:')}{' '}<b>{lv.best}</b> 🏆
        </span>
      </div>

      <ol className="league-road">
        {leagues
          .map((l, i) => ({ l, i }))
          .reverse()
          .map(({ l, i }) => {
            const state = i < lv.league ? 'passed' : i === lv.league ? 'current' : 'locked';
            const next = leagues[i + 1];
            const bot = l.botLevel !== undefined ? botLevel(l.botLevel) : null;
            const inLeague = state === 'current' && next ? Math.min(1, (lv.trophies - l.minTrophies) / (next.minTrophies - l.minTrophies)) : 0;
            return (
              <li key={l.name} ref={state === 'current' ? here : undefined} className={`league-step ${state}`}>
                <img className="league-art" src={packArt(l.art)} alt="" />
                <div className="league-body">
                  <span className="eyebrow">
                    {t('Ліга {0} · від {1}', i + 1, l.minTrophies)} 🏆
                  </span>
                  <b className="league-name">{l.name}</b>
                  {bot && (
                    <span className="small">
                      {t('Бот:')} <b>{bot.name}</b> {t('(~{0} Elo) · картки до «{1}»', bot.elo, RARITY_NAMES[l.botMaxRarity!].toLowerCase())}
                    </span>
                  )}
                  {state === 'current' && next && (
                    <div className="bar small-bar" aria-label={t('Прогрес до наступної ліги')}>
                      <span style={{ width: `${inLeague * 100}%` }} />
                    </div>
                  )}
                </div>
                <div className="league-reward">
                  {l.reward.gold > 0 || l.reward.pack ? (
                    <>
                      <small className="muted">{t('за вихід')}</small>
                      {l.reward.pack && <img src={packArt(l.reward.pack)} alt={packName(l.reward.pack)} title={packName(l.reward.pack)} />}
                      {l.reward.gold > 0 && <span className="gold">🪙 {l.reward.gold}</span>}
                    </>
                  ) : (
                    <small className="muted">{t('старт')}</small>
                  )}
                </div>
                <span className="league-state">{state === 'passed' ? '✓' : state === 'current' ? t('ви тут') : '🔒'}</span>
              </li>
            );
          })}
      </ol>
      <p className="center">
        <a
          className="btn btn-primary"
          href="#/play"
          onClick={() => {
            try {
              localStorage.setItem('uc.ladder', ladder);
            } catch {
              // not remembered
            }
          }}
        >
          {t('Грати в «{0}»', LADDER_NAMES[ladder])}
        </a>
      </p>
    </section>
  );
}
