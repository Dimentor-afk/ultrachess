import { useEffect, useState } from 'react';
import type { MatchStart, PackView } from '../api/client';
import { ARENAS, PACKS, PACK_SLOTS, RARITIES, STARTER_PACK, packName } from '../economy/packs';
import { RARITY_NAMES } from '../engine/cards';
import { Game } from './MatchPage';
import { PackOpening } from './PackOpening';
import { MiniBoard } from './DeckPage';
import { packArt } from './cardArt';
import { Icon } from './icons';
import { errorText, useSession } from './state';

const LEVELS = [
  { level: 1, name: 'Легкий' },
  { level: 2, name: 'Середній' },
  { level: 3, name: 'Складний' },
];

function useNow(): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function formatLeft(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h ? `${h} год ${m} хв` : m ? `${m} хв ${String(sec).padStart(2, '0')} с` : `${sec} с`;
}

export function HomePage() {
  const s = useSession();
  const { api, profile, decks, packs } = s;
  const [game, setGame] = useState<{ start: MatchStart; key: number } | null>(null);
  const [opening, setOpening] = useState<PackView | null>(null);
  const [level, setLevel] = useState(2);
  const [busy, setBusy] = useState(false);
  const [showOdds, setShowOdds] = useState(false);
  const now = useNow();

  const activeDeck = decks.find((d) => d.id === profile.activeDeckId) ?? decks[0];
  const arena = ARENAS[profile.arenaIndex];
  const next = profile.nextArena;
  const progress = next ? (profile.trophies - arena.minTrophies) / (next.minTrophies - arena.minTrophies) : 1;
  const slotPacks = packs.filter((p) => p.slot);
  const extraPacks = packs.filter((p) => !p.slot);
  const unlocking = slotPacks.some((p) => p.status === 'unlocking' && (p.unlockAt ?? 0) > now);

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

  const slotAction = async (p: PackView) => {
    try {
      if (p.status === 'ready' || (p.status === 'unlocking' && (p.unlockAt ?? 0) <= now)) return setOpening(p);
      if (p.status === 'locked') {
        s.setPacks(await api.startUnlock(p.id));
        s.toast(`${p.name}: відкриття почалось`);
      }
    } catch (e) {
      s.toast(errorText(e), 'error');
    }
  };

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
          {!activeDeck && <p className="muted small center">Відкрийте стартовий пак нижче — з нього збереться перша колода.</p>}
          <div className="next-reward">
            <img src={packArt(profile.nextReward)} alt="" />
            <span>
              Наступна нагорода за перемогу: <b>{packName(profile.nextReward)}</b>
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

      <div className="section-head">
        <h2>Слоти паків</h2>
        <button className="btn btn-ghost btn-sm" onClick={() => setShowOdds(!showOdds)}>
          <Icon name="info" /> Шанси
        </button>
      </div>
      <div className="slots">
        {Array.from({ length: PACK_SLOTS }, (_, i) => {
          const p = slotPacks[i];
          if (!p) {
            return (
              <div key={i} className="slot empty">
                <span className="muted small">Порожній слот</span>
                <span className="muted tiny">Перемагайте в рейтингу</span>
              </div>
            );
          }
          const ready = p.status === 'ready' || (p.status === 'unlocking' && (p.unlockAt ?? 0) <= now);
          return (
            <button key={p.id} className={`slot pack-${p.type} ${ready ? 'ready' : ''}`} onClick={() => slotAction(p)}>
              <img src={packArt(p.type)} alt="" />
              <b>{p.name}</b>
              {ready ? (
                <span className="slot-state ready">Відкрити!</span>
              ) : p.status === 'unlocking' ? (
                <span className="slot-state">
                  <Icon name="clock" /> {formatLeft((p.unlockAt ?? 0) - now)}
                </span>
              ) : (
                <span className="slot-state" title={unlocking ? 'Інший пак уже відкривається' : ''}>
                  <Icon name="lock" /> {p.unlockMinutes} хв
                </span>
              )}
              {profile.role === 'admin' && !ready && (
                <span
                  className="admin-skip"
                  role="button"
                  tabIndex={0}
                  onClick={async (e) => {
                    e.stopPropagation();
                    await api.adminFinishUnlock(p.id);
                    s.setPacks(await api.packs());
                  }}
                >
                  адмін: зараз
                </span>
              )}
            </button>
          );
        })}
      </div>

      {extraPacks.length > 0 && (
        <>
          <div className="section-head">
            <h2>Готові паки</h2>
          </div>
          <div className="ready-packs">
            {extraPacks.map((p) => (
              <button key={p.id} className={`ready-pack pack-${p.type}`} onClick={() => setOpening(p)}>
                <img src={packArt(p.type)} alt="" />
                <span>
                  <b>{p.name}</b>
                  <small className="muted">{p.source}</small>
                </span>
                <span className="slot-state ready">Відкрити</span>
              </button>
            ))}
          </div>
        </>
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
              <th>Відкриття</th>
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
              <td>одразу</td>
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
                <td>{p.unlockMinutes >= 60 ? `${p.unlockMinutes / 60} год` : `${p.unlockMinutes} хв`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted small">
        Перемога в рейтингу дає +30 кубків і пак у вільний слот (цикл: звичайні, рідкісні, епічний, легендарний), поразка — −20. Паки зі
        слотів відкриваються по одному за таймером. Повторки карт збираються в скрині повторок і міняються на паки.
      </p>
    </div>
  );
}
