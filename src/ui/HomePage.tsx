import { useEffect, useRef, useState } from 'react';
import type { MatchStart, PackView, PvpState } from '../api/client';
import { PACKS, PACK_SHARD_PRICE, RARITIES, STARTER_PACK, packName } from '../economy/packs';
import { LADDER_NAMES, LADDER_PACK_LIMIT, LADDER_TROPHIES, LADDER_WIN_GOLD, LEAGUES, type Ladder } from '../economy/leagues';
import { PvpGame } from './PvpGame';
import { RARITY_NAMES } from '../engine/cards';
import type { Rarity } from '../engine/types';
import { Game } from './MatchPage';
import { PackOpening } from './PackOpening';
import { MiniBoard } from './DeckPage';
import { packArt } from './cardArt';
import { Icon } from './icons';
import { BOT_LEVELS, botLevel } from '../engine/bot/levels';
import { play } from './settings';
import { captureFxById } from '../economy/captureFx';
import type { FxName } from './fxSprites';
import { errorText, useSession } from './state';


/** Which ladder the home page shows (remembered per browser). */
function savedLadder(): Ladder {
  try {
    return localStorage.getItem('uc.ladder') === 'pvp' ? 'pvp' : 'bot';
  } catch {
    return 'bot';
  }
}

export function HomePage() {
  const s = useSession();
  const { api, profile, decks, packs } = s;
  const [game, setGame] = useState<{ start: MatchStart; key: number } | null>(null);
  const [pvp, setPvp] = useState<PvpState | null>(null);
  const [searching, setSearching] = useState<{ since: number; others: number } | null>(null);
  const [opening, setOpening] = useState<PackView | null>(null);
  const [level, setLevel] = useState(2);
  const [busy, setBusy] = useState(false);
  const [showOdds, setShowOdds] = useState(false);
  const [ladder, setLadderState] = useState<Ladder>(savedLadder);
  const setLadder = (l: Ladder) => {
    setLadderState(l);
    try {
      localStorage.setItem('uc.ladder', l);
    } catch {
      // private mode: not remembered
    }
  };

  const activeDeck = decks.find((d) => d.id === profile.activeDeckId) ?? decks[0];
  const lv = profile.ladders[ladder];
  const league = LEAGUES[ladder][lv.league];
  const progress = lv.next ? (lv.trophies - league.minTrophies) / (lv.next.minTrophies - league.minTrophies) : 1;

  // The starter pack comes up by itself on the first visit; a tap opens it.
  const autoOpened = useRef(false);
  useEffect(() => {
    const starter = packs.find((p) => p.type === 'starter');
    if (starter && !autoOpened.current) {
      autoOpened.current = true;
      setOpening(starter);
    }
  }, [packs]);

  const startMatch = async (ranked: boolean) => {
    if (!activeDeck) return s.toast('Спочатку відкрийте стартовий пак і зберіть колоду.', 'error');
    setBusy(true);
    try {
      setGame({ start: await api.startMatch({ ranked, level, deckId: activeDeck.id }), key: Date.now() });
    } catch (e) {
      s.toast(errorText(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  // Player ladder: keep asking the server until someone is matched.
  useEffect(() => {
    if (!searching) return;
    let stop = false;
    const tick = async () => {
      try {
        const r = await api.seek(activeDeck?.id);
        if (stop) return;
        if (r.pvpId) {
          setSearching(null);
          play('rare');
          setPvp(await api.pvpState(r.pvpId));
        } else {
          setSearching((x) => (x ? { ...x, others: r.searching } : x));
        }
      } catch (e) {
        if (!stop) {
          setSearching(null);
          s.toast(errorText(e), 'error');
        }
      }
    };
    void tick();
    const t = setInterval(tick, 2000);
    return () => {
      stop = true;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searching?.since]);

  const cancelSearch = () => {
    setSearching(null);
    void api.cancelSeek().catch(() => undefined);
  };

  const resumeRanked = async () => {
    if (!s.inbox.rankedGame) return;
    try {
      setPvp(await api.pvpState(s.inbox.rankedGame));
    } catch (e) {
      s.toast(errorText(e), 'error');
    }
  };

  if (pvp) {
    return (
      <PvpGame
        pvp={pvp}
        onExit={() => {
          setPvp(null);
          void s.refreshInbox();
        }}
        onRematch={() => {
          setPvp(null);
          setSearching({ since: Date.now(), others: 0 });
        }}
      />
    );
  }

  if (game) {
    return (
      <Game
        key={game.key}
        start={game.start}
        playerName={profile.name}
        playerAvatar={profile.avatar}
        captureFx={{ [game.start.color]: captureFxById(profile.captureFx).sprite as FxName }}
        trophies={profile.ladders.bot.trophies}
        onFinish={async (actions, resigned) => {
          const v = await api.finishMatch(game.start.matchId, actions, resigned);
          s.setProfile(v.profile);
          s.setPacks(await api.packs());
          return v;
        }}
        onExit={() => setGame(null)}
        onRematch={() => {
          setGame(null);
          void startMatch(game.start.ranked);
        }}
      />
    );
  }

  const bot = botLevel(profile.rankedBot);
  return (
    <section className="page home">
      <div className="ladder-switch" role="tablist" aria-label="Ліга">
        {(['bot', 'pvp'] as Ladder[]).map((l) => (
          <button key={l} role="tab" aria-selected={ladder === l} className={`ladder-tab ${ladder === l ? 'on' : ''}`} onClick={() => setLadder(l)}>
            <span className="ladder-icon">{l === 'bot' ? '🤖' : '⚔'}</span>
            <span>
              <b>{LADDER_NAMES[l]}</b>
              <small>
                🏆 {profile.ladders[l].trophies} · {profile.ladders[l].leagueName}
              </small>
            </span>
          </button>
        ))}
        <a className="btn btn-ghost btn-sm ladder-all" href="#/leagues">
          Усі ліги ›
        </a>
      </div>

      <div className="home-top">
        <a className={`arena-card ladder-${ladder}`} href={`#/leagues/${ladder}`} title="Переглянути всі ліги">
          <div className="arena-art" aria-hidden="true">
            <img src={packArt(league.art)} alt="" />
          </div>
          <div className="arena-info">
            <span className="eyebrow">
              {LADDER_NAMES[ladder]} · ліга {lv.league + 1} з {LEAGUES[ladder].length}
            </span>
            <h1>{lv.leagueName}</h1>
            <div className="trophy-row">
              <span className="trophies">🏆 {lv.trophies}</span>
              {lv.next && (
                <span className="muted small">
                  до «{lv.next.name}»: {lv.next.minTrophies - lv.trophies}
                </span>
              )}
            </div>
            <div className="bar">
              <span style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }} />
            </div>
            {lv.next && (lv.next.reward.gold > 0 || lv.next.reward.pack) && (
              <span className="muted small">
                За вихід у нову лігу: {lv.next.reward.gold > 0 && `🪙 ${lv.next.reward.gold}`}
                {lv.next.reward.pack && ` + ${packName(lv.next.reward.pack)}`}
              </span>
            )}
            {ladder === 'bot' && (
              <span className="muted small">
                Бот ліги: <b>{bot.name}</b> (~{bot.elo} Elo)
              </span>
            )}
          </div>
        </a>

        <div className="battle-card">
          <div className="battle-deck">
            <div>
              <span className="eyebrow">Колода в бій</span>
              <select
                id="active-deck"
                value={activeDeck?.id ?? ''}
                onChange={async (e) => s.setProfile(await api.setActiveDeck(e.target.value))}
              >
                {decks.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            {activeDeck && <MiniBoard deck={activeDeck} />}
          </div>
          {ladder === 'bot' ? (
            <button className="btn btn-battle" disabled={busy || !activeDeck} onClick={() => startMatch(true)}>
              <Icon name="sword" /> Бій з ботом
            </button>
          ) : s.inbox.rankedGame ? (
            <button className="btn btn-battle" onClick={resumeRanked}>
              <Icon name="sword" /> Повернутися до гри
            </button>
          ) : searching ? (
            <div className="searching">
              <span className="spinner" aria-hidden="true" />
              <span>
                <b>Шукаємо суперника…</b>
                <small className="muted">
                  {Math.floor((Date.now() - searching.since) / 1000)} с · зараз шукають ще: {searching.others}
                </small>
              </span>
              <button className="btn btn-sm" onClick={cancelSearch}>
                Скасувати
              </button>
            </div>
          ) : (
            <button
              className="btn btn-battle"
              disabled={!activeDeck}
              onClick={() => setSearching({ since: Date.now(), others: 0 })}
            >
              <Icon name="sword" /> Знайти суперника
            </button>
          )}
          {!activeDeck && <p className="muted small center">Відкрийте стартовий пак — з нього збереться перша колода.</p>}
          {ladder === 'pvp' && (
            <p className="muted small">
              Гра з живим гравцем за кубки. Якщо суперник не ходить 1,5 хвилини, перемогу можна забрати.
              {api.mode === 'local' && ' У демо без сервера суперником може бути лише інший акаунт у цьому браузері.'}
            </p>
          )}
          {ladder === 'bot' && profile.role === 'admin' && (
            <label className="admin-bot">
              <span className="pill">адмін</span>
              <select
                value={profile.botOverride ?? -1}
                aria-label="Сила бота в лізі"
                onChange={async (e) => {
                  const v = Number(e.target.value);
                  try {
                    s.setProfile(await api.setBotOverride(v < 0 ? null : v));
                  } catch (err) {
                    s.toast(errorText(err), 'error');
                  }
                }}
              >
                <option value={-1}>За лігою</option>
                {BOT_LEVELS.map((l) => (
                  <option key={l.level} value={l.level}>
                    {l.name} (~{l.elo})
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="next-reward">
            <img src={packArt(lv.nextPack)} alt="" />
            <span>
              {lv.packsToday < lv.packsLimit ? (
                <>
                  За перемогу: <b>{packName(lv.nextPack)}</b>, 🪙 {lv.winGold} і +{lv.win} 🏆 · паків сьогодні {lv.packsToday}/{lv.packsLimit}
                </>
              ) : (
                <>
                  Ліміт {lv.packsLimit} паків на сьогодні в цій лізі вичерпано — за перемогу 🪙 {lv.winGold} і кубки
                </>
              )}
            </span>
          </div>
          <div className="training">
            <span className="muted small">Тренування без кубків:</span>
            <div className="chip-row">
              {BOT_LEVELS.map((l) => (
                <button
                  key={l.level}
                  className={`chip ${level === l.level ? 'on' : ''}`}
                  onClick={() => setLevel(l.level)}
                  title={`Приблизно ${l.elo} Elo`}
                >
                  {l.elo}
                </button>
              ))}
              <button className="btn btn-sm" disabled={busy || !activeDeck} onClick={() => startMatch(false)}>
                Грати
              </button>
            </div>
          </div>
          <a className="trial-teaser" href="#/trials">
            🏅 <b>Випробування</b> <span className="muted small">три перемоги поспіль — легендарний пак</span> ›
          </a>
        </div>
      </div>

      {s.inbox.yourTurn + s.inbox.challenges > 0 && (
        <a className="friend-turn" href="#/friends">
          <span className="friend-turn-icon">⚔</span>
          <span>
            <b>
              {s.inbox.yourTurn > 0 ? `Ваш хід у ${s.inbox.yourTurn} ${s.inbox.yourTurn === 1 ? 'грі' : 'іграх'} з друзями` : 'Вас викликали на гру'}
            </b>
            <small className="muted">
              {s.inbox.challenges > 0 ? `Викликів: ${s.inbox.challenges} · ` : ''}відкрити «Друзі»
            </small>
          </span>
          <span className="friend-turn-go">›</span>
        </a>
      )}

      <div className="section-head">
        <h2>Щоденні завдання</h2>
        <span className="muted small">оновлюються щодня</span>
      </div>
      <div className="quests">
        {profile.quests.map((q) => {
          const done = q.progress >= q.target;
          return (
            <div key={q.id} className={`quest ${done ? 'done' : ''} ${q.claimed ? 'claimed' : ''}`}>
              <div className="quest-text">
                <b>{q.text}</b>
                <div className="bar small-bar">
                  <span style={{ width: `${(q.progress / q.target) * 100}%` }} />
                </div>
                <small className="muted">
                  {q.progress}/{q.target}
                </small>
              </div>
              {q.claimed ? (
                <span className="pill pill-ok">отримано</span>
              ) : (
                <button
                  className="btn btn-sm btn-primary btn-price"
                  disabled={!done}
                  onClick={async () => {
                    try {
                      s.setProfile(await api.claimQuest(q.id));
                      play('rare');
                      s.toast(`Нагорода: ${q.reward.gold ? `🪙 ${q.reward.gold}` : ''}${q.reward.shards ? `💎 ${q.reward.shards}` : ''}`);
                    } catch (e) {
                      s.toast(errorText(e), 'error');
                    }
                  }}
                >
                  {q.reward.gold ? `🪙 ${q.reward.gold}` : `💎 ${q.reward.shards}`}
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="section-head">
        <h2>
          Ваші паки <span className="muted small">{packs.length}</span>
        </h2>
        <span className="daily" title="Ліміти паків за перемоги в лігах оновлюються щодня">
          Паки за перемоги сьогодні: 🤖 <b>{profile.ladders.bot.packsToday}</b>/{profile.ladders.bot.packsLimit} · ⚔{' '}
          <b>{profile.ladders.pvp.packsToday}</b>/{profile.ladders.pvp.packsLimit}
        </span>
        <button className="btn btn-ghost btn-sm" onClick={() => setShowOdds(!showOdds)}>
          <Icon name="info" /> Шанси
        </button>
      </div>
      {packs.length === 0 ? (
        <div className="panel empty-packs">
          <p className="muted">
            Паків немає. Перемагайте в лігах — кожна перемога одразу дає пак (у лізі ботів до {profile.ladders.bot.packsLimit}, у лізі
            гравців до {profile.ladders.pvp.packsLimit} на день). Паки також
            купуються за осколки в <a href="#/shop">магазині</a>.
          </p>
        </div>
      ) : (
        <div className="pack-shelf">
          {packs.map((p) => (
            <button key={p.id} className={`shelf-pack pack-${p.type}`} onClick={() => setOpening(p)} title={p.source}>
              <img src={packArt(p.type)} alt="" />
              <b>{p.name}</b>
              <span className="slot-state ready">Відкрити</span>
            </button>
          ))}
        </div>
      )}

      {showOdds && <OddsTable />}

      {opening && (
        <PackOpening
          pack={opening}
          open={() => api.openPack(opening.id)}
          onClose={async (res) => {
            setOpening(null);
            if (res) await s.refresh();
          }}
        />
      )}
    </section>
  );
}

function OddsTable() {
  return (
    <div className="panel odds">
      <h2>Шанси випадіння (на кожну картку в паку)</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Пак</th>
              <th>Карток</th>
              {RARITIES.map((r) => (
                <th key={r} className={`r-${r}`}>
                  {RARITY_NAMES[r]}
                </th>
              ))}
              <th>Гарантія</th>
              <th>Ліміт у паку</th>
              <th>Золото</th>
              <th>У магазині</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <img className="odds-pack" src={packArt('starter')} alt="" /> {STARTER_PACK.name}
              </td>
              <td>6</td>
              <td colSpan={5} className="muted">
                {STARTER_PACK.description}
              </td>
              <td>—</td>
              <td className="small">без лег і міфів</td>
              <td>🪙 {STARTER_PACK.gold}</td>
              <td>—</td>
            </tr>
            {Object.values(PACKS).map((p) => (
              <tr key={p.type}>
                <td>
                  <img className="odds-pack" src={packArt(p.type)} alt="" /> {p.name}
                </td>
                <td>{p.cards}</td>
                {RARITIES.map((r) => (
                  <td key={r} className="num">
                    {p.odds[r]}%
                  </td>
                ))}
                <td>{p.guarantee ? RARITY_NAMES[p.guarantee] : '—'}</td>
                <td className="small">
                  {Object.entries(p.limits)
                    .map(([r, n]) => `${RARITY_NAMES[r as Rarity].toLowerCase()}${r === 'mythological' ? '' : '+'} ≤ ${n}`)
                    .join(', ')}
                </td>
                <td>🪙 {p.gold}</td>
                <td>💎 {PACK_SHARD_PRICE[p.type as keyof typeof PACK_SHARD_PRICE]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted small">
        Ліміт обмежує кількість сильних карток в одному паку: якщо випадає більше, зайві стають на рівень нижчими. Наприклад, міфічний пак
        дає рівно одну міфологічну, щонайбільше одну легендарну й не більше трьох епічних і вище разом.
        <br />
        Ліга гравців: перемога дає +{LADDER_TROPHIES.pvp.win} кубків, 🪙 {LADDER_WIN_GOLD.pvp} і одразу пак (цикл до легендарного), до{' '}
        {LADDER_PACK_LIMIT.pvp} паків на день; поразка — {LADDER_TROPHIES.pvp.loss}. Ліга ботів: +{LADDER_TROPHIES.bot.win} / {LADDER_TROPHIES.bot.loss}{' '}
        кубків, 🪙 {LADDER_WIN_GOLD.bot}, паки не вище рідкісного, до {LADDER_PACK_LIMIT.bot} на день. Повторки карт автоматично стають
        осколками 💎, за які в магазині купуються паки.
      </p>
    </div>
  );
}
