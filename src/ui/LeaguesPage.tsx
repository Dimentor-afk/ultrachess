import { useEffect, useRef, useState } from 'react';
import { LADDER_NAMES, LADDER_PACK_LIMIT, LADDER_TROPHIES, LADDER_WIN_GOLD, LEAGUES, type Ladder } from '../economy/leagues';
import { packName } from '../economy/packs';
import { botLevel } from '../engine/bot/levels';
import { RARITY_NAMES } from '../engine/cards';
import { packArt } from './cardArt';
import { currentPath, onNavigate } from './router';
import { useSession } from './state';

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
        <h1>Ліги</h1>
        <p className="muted">
          Дві окремі драбини з власними кубками. Ліга ботів — тренувальна: суперники-боти від ~250 Elo, скромніші нагороди. Ліга гравців —
          живі суперники й повні нагороди. За перший вихід у кожну лігу — бонус.
        </p>
      </div>

      <div className="ladder-switch" role="tablist" aria-label="Драбина">
        {(['bot', 'pvp'] as Ladder[]).map((l) => (
          <a key={l} role="tab" aria-selected={ladder === l} href={`#/leagues/${l}`} className={`ladder-tab ${ladder === l ? 'on' : ''}`}>
            <span className="ladder-icon">{l === 'bot' ? '🤖' : '⚔'}</span>
            <span>
              <b>{LADDER_NAMES[l]}</b>
              <small>
                🏆 {profile.ladders[l].trophies} · {profile.ladders[l].leagueName}
              </small>
            </span>
          </a>
        ))}
      </div>

      <div className="panel ladder-rules">
        <span>
          Перемога: <b>+{LADDER_TROPHIES[ladder].win} 🏆</b>, 🪙 {LADDER_WIN_GOLD[ladder]} і пак
        </span>
        <span>
          Поразка: <b>{LADDER_TROPHIES[ladder].loss} 🏆</b>
        </span>
        <span>
          Паків за перемоги: до <b>{LADDER_PACK_LIMIT[ladder]}</b> на день (сьогодні {lv.packsToday})
        </span>
        <span>{ladder === 'bot' ? 'Паки не вище рідкісного' : 'Цикл паків аж до легендарного'}</span>
        <span>
          Рекорд: <b>{lv.best}</b> 🏆
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
                    Ліга {i + 1} · від {l.minTrophies} 🏆
                  </span>
                  <b className="league-name">{l.name}</b>
                  {bot && (
                    <span className="small">
                      Бот: <b>{bot.name}</b> (~{bot.elo} Elo) · картки до «{RARITY_NAMES[l.botMaxRarity!].toLowerCase()}»
                    </span>
                  )}
                  {state === 'current' && next && (
                    <div className="bar small-bar" aria-label="Прогрес до наступної ліги">
                      <span style={{ width: `${inLeague * 100}%` }} />
                    </div>
                  )}
                </div>
                <div className="league-reward">
                  {l.reward.gold > 0 || l.reward.pack ? (
                    <>
                      <small className="muted">за вихід</small>
                      {l.reward.pack && <img src={packArt(l.reward.pack)} alt={packName(l.reward.pack)} title={packName(l.reward.pack)} />}
                      {l.reward.gold > 0 && <span className="gold">🪙 {l.reward.gold}</span>}
                    </>
                  ) : (
                    <small className="muted">старт</small>
                  )}
                </div>
                <span className="league-state">{state === 'passed' ? '✓' : state === 'current' ? 'ви тут' : '🔒'}</span>
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
          Грати в «{LADDER_NAMES[ladder]}»
        </a>
      </p>
    </section>
  );
}
