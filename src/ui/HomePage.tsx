import { useEffect, useRef, useState } from 'react';
import type { MatchStart, PackView } from '../api/client';
import { ARENAS, DAILY_PACK_LIMIT, PACKS, PACK_SHARD_PRICE, RARITIES, STARTER_PACK, WIN_GOLD, packName } from '../economy/packs';
import { RARITY_NAMES } from '../engine/cards';
import type { Rarity } from '../engine/types';
import { Game } from './MatchPage';
import { PackOpening } from './PackOpening';
import { MiniBoard } from './DeckPage';
import { packArt } from './cardArt';
import { Icon } from './icons';
import { play } from './settings';
import { errorText, useSession } from './state';

const LEVELS = [
  { level: 1, name: 'Легкий' },
  { level: 2, name: 'Середній' },
  { level: 3, name: 'Складний' },
];

export function HomePage() {
  const s = useSession();
  const { api, profile, decks, packs } = s;
  const [game, setGame] = useState<{ start: MatchStart; key: number } | null>(null);
  const [opening, setOpening] = useState<PackView | null>(null);
  const [level, setLevel] = useState(2);
  const [busy, setBusy] = useState(false);
  const [showOdds, setShowOdds] = useState(false);

  const activeDeck = decks.find((d) => d.id === profile.activeDeckId) ?? decks[0];
  const arena = ARENAS[profile.arenaIndex];
  const next = profile.nextArena;
  const progress = next ? (profile.trophies - arena.minTrophies) / (next.minTrophies - arena.minTrophies) : 1;

  // The starter pack opens by itself on the first visit.
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

  if (game) {
    return (
      <Game
        key={game.key}
        start={game.start}
        playerName={profile.name}
        playerAvatar={profile.avatar}
        trophies={profile.trophies}
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

  return (
    <section className="page home">
      <div className="home-top">
        <div className="arena-card">
          <div className="arena-art" aria-hidden="true">
            <img src={packArt(['common', 'rare', 'epic', 'legendary', 'mythic'][profile.arenaIndex] as never)} alt="" />
          </div>
          <div className="arena-info">
            <span className="eyebrow">Арена {profile.arenaIndex + 1}</span>
            <h1>{profile.arena}</h1>
            <div className="trophy-row">
              <span className="trophies">🏆 {profile.trophies}</span>
              {next && <span className="muted small">до «{next.name}»: {next.minTrophies - profile.trophies}</span>}
            </div>
            <div className="bar">
              <span style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }} />
            </div>
            <span className="muted small">
              Перемоги {profile.wins} · Поразки {profile.losses} · Нічиї {profile.draws}
            </span>
          </div>
        </div>

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
          <button className="btn btn-battle" disabled={busy || !activeDeck} onClick={() => startMatch(true)}>
            <Icon name="sword" /> Бій
          </button>
          {!activeDeck && <p className="muted small center">Відкрийте стартовий пак — з нього збереться перша колода.</p>}
          <div className="next-reward">
            <img src={packArt(profile.nextReward)} alt="" />
            <span>
              {profile.packsToday < profile.packsLimit ? (
                <>
                  Нагорода за перемогу: <b>{packName(profile.nextReward)}</b> і 🪙 {WIN_GOLD}
                </>
              ) : (
                <>Ліміт паків на сьогодні вичерпано — за перемогу 🪙 {WIN_GOLD} і кубки</>
              )}
            </span>
          </div>
          <div className="training">
            <span className="muted small">Тренування без кубків:</span>
            <div className="chip-row">
              {LEVELS.map((l) => (
                <button key={l.level} className={`chip ${level === l.level ? 'on' : ''}`} onClick={() => setLevel(l.level)}>
                  {l.name}
                </button>
              ))}
              <button className="btn btn-sm" disabled={busy || !activeDeck} onClick={() => startMatch(false)}>
                Грати
              </button>
            </div>
          </div>
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
        <span className="daily" title="Паки за перемоги в рейтингу оновлюються щодня">
          Паки за перемоги сьогодні: <b>{profile.packsToday}</b> / {profile.packsLimit}
        </span>
        <button className="btn btn-ghost btn-sm" onClick={() => setShowOdds(!showOdds)}>
          <Icon name="info" /> Шанси
        </button>
      </div>
      {packs.length === 0 ? (
        <div className="panel empty-packs">
          <p className="muted">
            Паків немає. Перемагайте в рейтингових боях — кожна перемога одразу дає пак (до {profile.packsLimit} на день). Паки також
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
          autoStart={opening.type === 'starter'}
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
        Перемога в рейтингу дає +30 кубків, 🪙 {WIN_GOLD} і одразу пак (цикл: звичайні, рідкісні, епічний, легендарний), але не більше{' '}
        {DAILY_PACK_LIMIT} паків на день. Поразка — −20 кубків. Повторки карт автоматично стають осколками 💎, за які в магазині купуються паки.
      </p>
    </div>
  );
}
