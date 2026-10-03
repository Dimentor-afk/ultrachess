import { useCallback, useEffect, useRef, useState } from 'react';
import type { MatchStart, PackView } from '../api/client';
import { PACKS, PACK_SHARD_PRICE, RARITIES, STARTER_PACK, packName } from '../economy/packs';
import { LADDER_NAMES, LADDER_PACK_LIMIT, LADDER_TROPHIES, LADDER_WIN_GOLD, LEAGUES, type Ladder } from '../economy/leagues';
import { currentPath, navigate } from './router';
import { RARITY_NAMES } from '../engine/cards';
import type { Rarity } from '../engine/types';
import { Game } from './LazyGame';
import { PackOpening } from './PackOpening';
import { Sheet } from './Sheet';
import { MiniBoard } from './DeckPage';
import { packArt } from './cardArt';
import { Icon } from './icons';
import { BOT_LEVELS, botLevel } from '../engine/bot/levels';
import { play } from './settings';
import { captureFxById } from '../economy/captureFx';
import type { FxName } from './fxSprites';
import type { QuestView } from '../economy/quests';
import { errorText, useSession } from './state';
import { t, tr } from '../i18n';


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
  const [searching, setSearching] = useState<{ since: number; others: number } | null>(null);
  const [opening, setOpening] = useState<PackView | null>(null);
  const [level, setLevel] = useState(2);
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState<'quests' | 'training' | 'odds' | null>(null);
  const closeSheet = useCallback(() => setSheet(null), []);
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
    if (!activeDeck) return s.toast(t('Спочатку відкрийте стартовий пак і зберіть колоду.'), 'error');
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
          navigate(`/game/${r.pvpId}`);
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
    // Live: the server says at once when someone took our search.
    const off = api.live?.onMatched((id) => {
      if (stop) return;
      stop = true;
      setSearching(null);
      play('rare');
      navigate(`/game/${id}`);
    });
    return () => {
      stop = true;
      clearInterval(t);
      off?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searching?.since]);

  // "Шукати ще" after a ladder game comes back here with /play/seek: search again.
  useEffect(() => {
    if (currentPath() !== '/play/seek') return;
    navigate('/play');
    if (activeDeck) setSearching({ since: Date.now(), others: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cancelSearch = () => {
    setSearching(null);
    void api.cancelSeek().catch(() => undefined);
  };

  const resumeRanked = async () => {
    if (!s.inbox.rankedGame) return;
    navigate(`/game/${s.inbox.rankedGame}`);
  };

  if (game) {
    return (
      <Game
        key={game.key}
        start={game.start}
        playerName={profile.name}
        playerAvatar={profile.avatar}
        captureFx={{ [game.start.color]: captureFxById(profile.captureFx).sprite as FxName }}
        trophies={profile.ladders.bot.trophies}
        onAction={(action, v) => api.matchAction(game.start.matchId, action, v)}
        onFinish={async (resigned) => {
          const v = await api.finishMatch(game.start.matchId, resigned);
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
  const claimable = profile.quests.filter((q) => q.progress >= q.target && !q.claimed).length;
  const trialActive = Object.values(profile.trials).some((t) => t.status === 'active');
  const arenaRun = profile.trials.arena?.status === 'active' ? profile.trials.arena : null;
  const slots = [0, 1, 2, 3].map((i) => packs[i] ?? null);
  const packToday = lv.packsToday < lv.packsLimit;

  const claim = async (id: string) => {
    try {
      const before = profile.quests.find((q) => q.id === id);
      s.setProfile(await api.claimQuest(id));
      play('rare');
      if (before) s.toast(t('Нагорода: {0}{1}', before.reward.gold ? `🪙 ${before.reward.gold}` : '', before.reward.shards ? `💎 ${before.reward.shards}` : ''));
    } catch (e) {
      s.toast(errorText(e), 'error');
    }
  };

  const battle =
    ladder === 'bot' ? (
      <button className="btn btn-battle hb-battle" disabled={busy || !activeDeck} onClick={() => startMatch(true)}>
        <Icon name="sword" /> {t('Бій')}
      </button>
    ) : s.inbox.rankedGame ? (
      <button className="btn btn-battle hb-battle" onClick={resumeRanked}>
        <Icon name="sword" /> {t('До гри')}
      </button>
    ) : searching ? (
      <div className="searching hb-searching">
        <span className="spinner" aria-hidden="true" />
        <span>
          <b>{t('Шукаємо суперника…')}</b>
          <small className="muted">
            {t('{0} с · шукають ще: {1}', Math.floor((Date.now() - searching.since) / 1000), searching.others)}
          </small>
        </span>
        <button className="btn btn-sm" onClick={cancelSearch}>
          {t('Скасувати')}
        </button>
      </div>
    ) : (
      <button className="btn btn-battle hb-battle" disabled={!activeDeck} onClick={() => setSearching({ since: Date.now(), others: 0 })}>
        <Icon name="sword" /> {t('Бій')}
      </button>
    );

  return (
    <section className={`page hb ladder-${ladder}`}>
      {s.inbox.yourTurn + s.inbox.challenges > 0 && (
        <a className="friend-turn hb-banner" href="#/friends">
          <span className="friend-turn-icon">⚔</span>
          <span>
            <b>
              {s.inbox.yourTurn > 0 ? s.inbox.yourTurn === 1 ? t('Ваш хід у 1 грі з друзями') : t('Ваш хід у {0} іграх з друзями', s.inbox.yourTurn) : t('Вас викликали на гру')}
            </b>
            <small className="muted">
              {s.inbox.challenges > 0 ? t('Викликів: {0} · ', s.inbox.challenges) : ''}{t('відкрити «Друзі»')}
            </small>
          </span>
          <span className="friend-turn-go">›</span>
        </a>
      )}

      {/* The deck and the battle button come first: they are what this screen is for. */}
      <div className="hb-main">
        <div className="hb-deck">
          {activeDeck ? <MiniBoard deck={activeDeck} /> : <span className="muted small">{t('Колоди ще немає')}</span>}
          <div className="hb-deck-info">
            <label className="eyebrow" htmlFor="active-deck">
              {t('Колода в бій')}
            </label>
            <div className="hb-deck-row">
              <select id="active-deck" value={activeDeck?.id ?? ''} onChange={async (e) => s.setProfile(await api.setActiveDeck(e.target.value))}>
                {decks.map((d) => (
                  <option key={d.id} value={d.id}>
                    {tr(d.name)}
                  </option>
                ))}
              </select>
              <a className="btn btn-sm hb-deck-edit" href="#/deck" aria-label={t('Змінити колоду')} title={t('Змінити колоду')}>
                <Icon name="edit" />
              </a>
            </div>
          </div>
        </div>

        <div className="hb-dock">
          {battle}
          <div className="hb-dock-extra">
            <button className="btn btn-sm" onClick={() => setSheet('training')}>
              <Icon name="target" /> {t('Тренування')}
            </button>
            <button className="btn btn-sm" onClick={() => setSheet('odds')}>
              <Icon name="dice" /> {t('Шанси паків')}
            </button>
          </div>
          <span className="hb-reward">
            {!activeDeck ? (
              t('Відкрийте стартовий пак — з нього збереться перша колода')
            ) : (
              <>
                {t('За перемогу:')}{' '}<b>+{lv.win} 🏆</b> · 🪙 {lv.winGold}
                {packToday ? (
                  <>
                    {' '}
                    · <img src={packArt(lv.nextPack)} alt="" /> {packName(lv.nextPack)}
                  </>
                ) : (
                  t(' · ліміт паків на сьогодні вичерпано')
                )}
                {ladder === 'pvp' && arenaRun && <> {t('· 🏅 Арена гравців: перемога {0} з 3', arenaRun.wins + 1)}</>}
              </>
            )}
          </span>
        </div>

        <div className="hb-slots-wrap">
          <div className="hb-slots-head">
            <b>{t('Паки')}</b>
            <span className="muted small">
              {t('за перемоги сьогодні {0}/{1}', lv.packsToday, lv.packsLimit)}
            </span>
          </div>
          <div className="hb-slots">
            {slots.map((p, i) =>
              p ? (
                <button key={p.id} className={`hb-slot pack-${p.type}`} onClick={() => setOpening(p)} title={`${tr(p.name)} · ${tr(p.source)}`}>
                  <img src={packArt(p.type)} alt="" />
                  <span className="hb-slot-open">{t('Відкрити')}</span>
                  {i === 3 && packs.length > 4 && <span className="hb-slot-more">+{packs.length - 3}</span>}
                </button>
              ) : (
                <div key={`empty-${i}`} className="hb-slot empty" title={t('Кожна перемога в лізі дає пак')}>
                  <span>{i === 0 ? t('Перемога → пак') : ''}</span>
                </div>
              ),
            )}
          </div>
        </div>

      </div>

      <div className="hb-aside">
        <div className="hb-mode" role="tablist" aria-label={t('Ліга')}>
          {(['bot', 'pvp'] as Ladder[]).map((l) => (
            <button key={l} role="tab" aria-selected={ladder === l} className={`hb-mode-tab ${ladder === l ? 'on' : ''}`} onClick={() => setLadder(l)}>
              <span className="hb-mode-icon" aria-hidden="true">
                {l === 'bot' ? '🤖' : '⚔'}
              </span>
              <span className="hb-mode-text">
                <b>{LADDER_NAMES[l]}</b>
                <small>🏆 {profile.ladders[l].trophies}</small>
              </span>
            </button>
          ))}
        </div>

        <div className="hb-stage">
          <nav className="hb-rail" aria-label={t('Швидкі дії')}>
            <button className="hb-rail-btn hb-quests-btn" onClick={() => setSheet('quests')}>
              <span className="hb-rail-icon rail-quests">
                <Icon name="list" />
                {claimable > 0 && <span className="nav-badge">{claimable}</span>}
              </span>
              <span className="hb-rail-label">{t('Завдання')}</span>
            </button>
            <a className="hb-rail-btn" href="#/trials">
              <span className="hb-rail-icon rail-trials">
                <Icon name="medal" />
                {trialActive && <span className="hb-rail-dot" />}
              </span>
              <span className="hb-rail-label">{t('Випробування')}</span>
            </a>
          </nav>

          <a className="hb-arena" href={`#/leagues/${ladder}`} title={t('Усі ліги й нагороди')}>
            <span className="hb-arena-rays" aria-hidden="true" />
            <img className="hb-arena-art" src={packArt(league.art)} alt="" />
            <span className="eyebrow">
              {t('Ліга {0} із {1}', lv.league + 1, LEAGUES[ladder].length)}
            </span>
            <h1>{tr(lv.leagueName)}</h1>
            <div className="hb-trophies">
              <span className="trophies">🏆 {lv.trophies}</span>
              {lv.next && (
                <span className="muted small" title={t('Наступна ліга: {0}', tr(lv.next.name))}>
                  {t('ще {0} до наступної', lv.next.minTrophies - lv.trophies)}
                </span>
              )}
            </div>
            <div className="bar small-bar" aria-hidden="true">
              <span style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }} />
            </div>
            {ladder === 'bot' ? (
              <span className="muted small hb-foe">
                {t('Бот')}{' '}<b>{bot.name}</b> · ~{bot.elo} Elo
              </span>
            ) : (
              <span className="muted small hb-foe">{t('Живі суперники')}</span>
            )}
          </a>

          <nav className="hb-rail" aria-label={t('Ще')}>
            <button className="hb-rail-btn" onClick={() => setSheet('training')}>
              <span className="hb-rail-icon rail-training">
                <Icon name="target" />
              </span>
              <span className="hb-rail-label">{t('Тренування')}</span>
            </button>
            <button className="hb-rail-btn" onClick={() => setSheet('odds')}>
              <span className="hb-rail-icon rail-odds">
                <Icon name="dice" />
              </span>
              <span className="hb-rail-label">{t('Шанси')}</span>
            </button>
          </nav>
        </div>

        <aside className="hb-side">
          <div className="section-head">
            <h2>{t('Щоденні завдання')}</h2>
            <span className="muted small">{t('оновлюються щодня')}</span>
          </div>
          <QuestList quests={profile.quests} onClaim={claim} />
          <a className="trial-teaser" href="#/trials">
            🏅 <b>{t('Випробування')}</b> <span className="muted small">{t('три перемоги поспіль — легендарний пак')}</span> ›
          </a>
        </aside>
      </div>

      {sheet === 'quests' && (
        <Sheet title={t('Щоденні завдання')} onClose={closeSheet}>
          <QuestList quests={profile.quests} onClaim={claim} />
        </Sheet>
      )}
      {sheet === 'training' && (
        <Sheet title={t('Тренування')} onClose={closeSheet}>
          <p className="muted small">{t('Гра з ботом без кубків і нагород: спробувати колоду чи нові картки. Оберіть силу бота:')}</p>
          <div className="training-levels">
            {BOT_LEVELS.map((l) => (
              <button key={l.level} className={`chip ${level === l.level ? 'on' : ''}`} onClick={() => setLevel(l.level)}>
                <b>{l.name}</b>
                <small>~{l.elo}</small>
              </button>
            ))}
          </div>
          <button
            className="btn btn-primary btn-lg btn-block-c"
            disabled={busy || !activeDeck}
            onClick={() => {
              closeSheet();
              void startMatch(false);
            }}
          >
            {t('Грати тренування')}
          </button>
          {profile.role === 'admin' && (
            <label className="admin-bot">
              <span className="pill">{t('адмін')}</span>
              <span className="muted small">{t('бот ліги:')}</span>
              <select
                value={profile.botOverride ?? -1}
                aria-label={t('Сила бота в лізі')}
                onChange={async (e) => {
                  const v = Number(e.target.value);
                  try {
                    s.setProfile(await api.setBotOverride(v < 0 ? null : v));
                  } catch (err) {
                    s.toast(errorText(err), 'error');
                  }
                }}
              >
                <option value={-1}>{t('За лігою')}</option>
                {BOT_LEVELS.map((l) => (
                  <option key={l.level} value={l.level}>
                    {l.name} (~{l.elo})
                  </option>
                ))}
              </select>
            </label>
          )}
        </Sheet>
      )}
      {sheet === 'odds' && (
        <Sheet title={t('Шанси паків')} onClose={closeSheet} wide>
          <OddsTable />
        </Sheet>
      )}

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

/** Daily quests with their claim buttons. */
function QuestList({ quests, onClaim }: { quests: QuestView[]; onClaim: (id: string) => void }) {
  return (
    <div className="quests">
      {quests.map((q) => {
        const done = q.progress >= q.target;
        return (
          <div key={q.id} className={`quest ${done ? 'done' : ''} ${q.claimed ? 'claimed' : ''}`}>
            <div className="quest-text">
              <b>{tr(q.text)}</b>
              <div className="bar small-bar">
                <span style={{ width: `${(q.progress / q.target) * 100}%` }} />
              </div>
              <small className="muted">
                {q.progress}/{q.target}
              </small>
            </div>
            {q.claimed ? (
              <span className="pill pill-ok">{t('отримано')}</span>
            ) : (
              <button className="btn btn-sm btn-primary btn-price" disabled={!done} onClick={() => onClaim(q.id)}>
                {q.reward.gold ? `🪙 ${q.reward.gold}` : `💎 ${q.reward.shards}`}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function OddsTable() {
  const pct = (n: number) => `${String(n).replace('.', ',')}%`;
  return (
    <div className="odds">
      <p className="muted small">{t('Шанс рідкості — для кожної картки в паку окремо.')}</p>
      <div className="odds-cards">
        <article className="odds-card">
          <header>
            <img className="odds-pack" src={packArt('starter')} alt="" />
            <b>{STARTER_PACK.name}</b>
            <span className="muted small">{t('6 карток · 🪙 {0}', STARTER_PACK.gold)}</span>
          </header>
          <p className="small muted">{STARTER_PACK.description}</p>
        </article>
        {Object.values(PACKS).map((p) => (
          <article key={p.type} className="odds-card">
            <header>
              <img className="odds-pack" src={packArt(p.type)} alt="" />
              <b>{p.name}</b>
              <span className="muted small">
                {t('{0} карток · 🪙 {1}', p.cards, p.gold)} · 💎 {PACK_SHARD_PRICE[p.type as keyof typeof PACK_SHARD_PRICE]}
              </span>
            </header>
            {/* One bar split by rarity, then the exact numbers. */}
            <div className="odds-bar" aria-hidden="true">
              {RARITIES.filter((r) => p.odds[r] > 0).map((r) => (
                <span key={r} className={`odds-seg seg-${r}`} style={{ flexGrow: p.odds[r] }} />
              ))}
            </div>
            <ul className="odds-list">
              {RARITIES.filter((r) => p.odds[r] > 0).map((r) => (
                <li key={r}>
                  <span className={`odds-dot seg-${r}`} />
                  <span className={`r-${r}`}>{RARITY_NAMES[r]}</span>
                  <b>{pct(p.odds[r])}</b>
                </li>
              ))}
            </ul>
            <p className="small muted">
              {p.guarantee ? t('Гарантовано: {0} або краща. ', RARITY_NAMES[p.guarantee].toLowerCase()) : ''}
              {t('Ліміт:')}{' '}
              {Object.entries(p.limits)
                .map(([r, n]) => t('{0}{1} — не більше {2}', RARITY_NAMES[r as Rarity].toLowerCase(), r === 'mythological' ? '' : t(' і вище'), n))
                .join(', ')}
              .
            </p>
          </article>
        ))}
      </div>
      <p className="muted small">
        {t('Ліміт обмежує кількість сильних карток в одному паку: якщо випадає більше, зайві стають на рівень нижчими. Наприклад, міфічний пак дає рівно одну міфологічну, щонайбільше одну легендарну й не більше трьох епічних і вище разом.')}
        <br />
        {t(
          'Ліга гравців: перемога дає +{0} кубків, 🪙 {1} і одразу пак (цикл до легендарного), до {2} паків на день; поразка — {3}. Ліга ботів: +{4} / {5} кубків, 🪙 {6}, паки не вище рідкісного, до {7} на день. Повторки карт автоматично стають уламками 💎, за які в магазині купуються паки.',
          LADDER_TROPHIES.pvp.win,
          LADDER_WIN_GOLD.pvp,
          LADDER_PACK_LIMIT.pvp,
          LADDER_TROPHIES.pvp.loss,
          LADDER_TROPHIES.bot.win,
          LADDER_TROPHIES.bot.loss,
          LADDER_WIN_GOLD.bot,
          LADDER_PACK_LIMIT.bot,
        )}
      </p>
    </div>
  );
}
