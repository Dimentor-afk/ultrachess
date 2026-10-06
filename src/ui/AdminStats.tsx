// The admin's statistics tab: players, games, bots, cards (for balance) and
// invites. Admin-only and read by the author, so the text is Ukrainian only.

import { useEffect, useMemo, useState } from 'react';
import type { AdminStats } from '../api/client';
import type { CardStat } from '../economy/adminStats';
import { formatPrice } from '../economy/payments';
import { BOT_LEVELS } from '../engine/bot/levels';
import { CARD_BY_ID, PIECE_NAMES, RARITY_NAMES } from '../engine/cards';
import type { PieceType } from '../engine/types';
import { CardArt } from './common';
import { errorText, useSession } from './state';

const PERIODS: [number, string][] = [
  [1, 'Доба'],
  [7, '7 днів'],
  [30, '30 днів'],
  [0, 'Увесь час'],
];

const KIND_NAMES: Record<string, string> = { bot: 'Ліга ботів', training: 'Тренування', trial: 'Випробування', ranked: 'Ліга гравців', friend: 'З другом' };

type Sort = 'games' | 'win' | 'pvp' | 'captures' | 'abilities' | 'decks';
const SORTS: [Sort, string][] = [
  ['games', 'Частота'],
  ['win', 'Перемоги'],
  ['pvp', 'Перемоги з людьми'],
  ['captures', 'Взяття'],
  ['abilities', 'Кнопки'],
  ['decks', 'У колодах'],
];
const PIECES: (PieceType | 'all')[] = ['all', 'pawn', 'knight', 'bishop', 'rook', 'queen', 'king'];

/** Below this many games a win rate is noise: shown grey, never flagged. */
const MIN_GAMES = 20;

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

export function AdminStatsTab() {
  const s = useSession();
  const [days, setDays] = useState(7);
  const [st, setSt] = useState<AdminStats | null>(null);
  const [sort, setSort] = useState<Sort>('games');
  const [piece, setPiece] = useState<PieceType | 'all'>('all');

  useEffect(() => {
    setSt(null);
    s.api.adminStats(days).then(setSt, (e) => s.toast(errorText(e), 'error'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  const decks = st ? Math.max(1, st.cards.reduce((m, c) => Math.max(m, c.inDecks), 0)) : 1;
  const rows = useMemo(() => {
    if (!st) return [];
    const key = (c: CardStat): number => {
      if (sort === 'win') return c.games >= MIN_GAMES ? c.score / c.games : -1;
      if (sort === 'pvp') return c.pvpGames >= MIN_GAMES ? c.pvpScore / c.pvpGames : -1;
      if (sort === 'captures') return c.games ? c.captures / c.games : 0;
      if (sort === 'abilities') return c.abilities;
      if (sort === 'decks') return c.inDecks;
      return c.games;
    };
    return st.cards.filter((c) => piece === 'all' || CARD_BY_ID[c.id]?.pieceType === piece).sort((a, b) => key(b) - key(a));
  }, [st, sort, piece]);

  if (!st) return <p className="muted">Рахуємо статистику…</p>;
  const g = st.games;
  const maxDay = Math.max(1, ...g.perDay.map((d) => d.games));

  return (
    <div className="admin-stats-tab">
      <div className="chip-row">
        {PERIODS.map(([d, label]) => (
          <button key={d} className={`chip ${days === d ? 'on' : ''}`} onClick={() => setDays(d)}>
            {label}
          </button>
        ))}
      </div>

      <div className="stat-grid admin-stats">
        <Tile n={st.players.total} label="гравців усього" />
        <Tile n={st.players.fresh} label="нових за період" />
        <Tile n={st.players.active} label="заходили за період" />
        <Tile n={st.players.day} label="заходили за добу" />
        <Tile n={g.total} label="партій" />
        <Tile n={g.avgMoves} label="ходів у середньому" />
        <Tile n={`${pct(g.draws, g.total)}%`} label="нічиїх" />
        <Tile n={g.pvpGames ? `${pct(g.pvpWhiteScore, g.pvpGames)}%` : '—'} label="перемог білих з людьми" />
      </div>

      <div className="panel">
        <h2>Партії за 14 днів</h2>
        <div className="ast-days">
          {g.perDay.map((d) => (
            <span key={d.day} className="ast-day" title={`${d.day}: ${d.games}`}>
              <span className="ast-bar" style={{ height: `${(d.games / maxDay) * 100}%` }} />
              <small>{d.day.slice(8)}</small>
            </span>
          ))}
        </div>
        <div className="ast-split">
          <div>
            <h3>Режими</h3>
            {Object.entries(g.byKind).map(([k, n]) => (
              <Line key={k} label={KIND_NAMES[k] ?? k} n={n} total={g.total} />
            ))}
          </div>
          <div>
            <h3>Як закінчуються</h3>
            {Object.entries(g.reasons)
              .sort((a, b) => b[1] - a[1])
              .map(([k, n]) => (
                <Line key={k} label={k} n={n} total={g.total} />
              ))}
          </div>
        </div>
      </div>

      <div className="panel">
        <h2>Гравці проти ботів</h2>
        <p className="muted small">Відсоток перемог гравця на кожному рівні, нічия рахується як половина. Якщо на слабкому рівні гравці майже не виграють, бот засильний для своєї ліги.</p>
        <table className="ast-table">
          <thead>
            <tr>
              <th>Бот</th>
              <th className="num">Партій</th>
              <th className="num">Гравець виграв</th>
            </tr>
          </thead>
          <tbody>
            {st.bots.map((b) => (
              <tr key={b.level}>
                <td>
                  {BOT_LEVELS[b.level]?.name ?? b.level} <small className="muted">~{BOT_LEVELS[b.level]?.elo}</small>
                </td>
                <td className="num">{b.games}</td>
                <td className="num">{pct(b.score, b.games)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="panel">
        <h2>Картки</h2>
        <p className="muted small">
          «Перемоги» показують, як часто виграє гравець з цією карткою в колоді (у партіях з ботом рахується лише колода гравця). «З людьми» те саме, але тільки в партіях між
          гравцями, це найчесніша оцінка. Від {MIN_GAMES} партій 🔥 означає 60% перемог і більше (кандидат на ослаблення), 🧊 означає 40% і менше. Взяття й кнопки показують, що
          фігури цієї картки реально роблять.
        </p>
        <div className="chip-row">
          {PIECES.map((p) => (
            <button key={p} className={`chip ${piece === p ? 'on' : ''}`} onClick={() => setPiece(p)}>
              {p === 'all' ? 'Усі' : PIECE_NAMES[p]}
            </button>
          ))}
        </div>
        <div className="chip-row ast-sort">
          <span className="muted small">Сортувати:</span>
          {SORTS.map(([k, label]) => (
            <button key={k} className={`chip ${sort === k ? 'on' : ''}`} onClick={() => setSort(k)}>
              {label}
            </button>
          ))}
        </div>
        <div className="table-wrap">
          <table className="ast-table ast-cards">
            <thead>
              <tr>
                <th>Картка</th>
                <th className="num">У колодах</th>
                <th className="num">Партій</th>
                <th className="num">Перемоги</th>
                <th className="num">З людьми</th>
                <th className="num">Ходів / партію</th>
                <th className="num">Взять / партію</th>
                <th className="num">Кнопок</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const card = CARD_BY_ID[c.id];
                const win = pct(c.score, c.games);
                const flag = c.games >= MIN_GAMES ? (win >= 60 ? 'hot' : win <= 40 ? 'cold' : '') : 'few';
                return (
                  <tr key={c.id} className={`ast-${flag}`}>
                    <td>
                      <span className={`ast-card r-${card.rarity}`}>
                        <CardArt cardId={c.id} />
                        <span>
                          <b>{card.name}</b>
                          <small className="muted">{RARITY_NAMES[card.rarity]}</small>
                        </span>
                      </span>
                    </td>
                    <td className="num">{pct(c.inDecks, decks)}%</td>
                    <td className="num">{c.games}</td>
                    <td className="num">
                      {c.games ? `${win}%` : '—'} {flag === 'hot' ? '🔥' : flag === 'cold' ? '🧊' : ''}
                    </td>
                    <td className="num">{c.pvpGames ? `${pct(c.pvpScore, c.pvpGames)}% (${c.pvpGames})` : '—'}</td>
                    <td className="num">{c.games ? (c.moves / c.games).toFixed(1) : '—'}</td>
                    <td className="num">{c.games ? (c.captures / c.games).toFixed(2) : '—'}</td>
                    <td className="num">{c.abilities || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="muted tiny">«У колодах» рахується від найпопулярнішої картки серед активних колод гравців.</p>
      </div>

      <div className="panel">
        <h2>Запрошення</h2>
        <div className="stat-grid admin-stats">
          <Tile n={st.referrals.invited} label="прийшли за посиланням" />
          <Tile n={st.referrals.played} label="зіграли 10 партій" />
          <Tile n={`${pct(st.referrals.played, st.referrals.invited)}%`} label="дійшли до 10 партій" />
        </div>
        {st.referrals.top.length > 0 && (
          <table className="ast-table">
            <thead>
              <tr>
                <th>Хто запросив</th>
                <th className="num">Прийшло</th>
                <th className="num">Зіграли 10</th>
              </tr>
            </thead>
            <tbody>
              {st.referrals.top.map((r) => (
                <tr key={r.name}>
                  <td>{r.name}</td>
                  <td className="num">{r.invited}</td>
                  <td className="num">{r.played}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {st.referrals.suspicious.length > 0 && (
          <div className="ast-warn">
            <b>Підозріло.</b> 3 і більше реєстрацій за одним посиланням за день, і жоден з цих акаунтів не зіграв.
            <ul>
              {st.referrals.suspicious.map((x, i) => (
                <li key={i}>
                  {x.name}: {x.count} акаунтів {x.day}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="panel">
        <h2>Економіка</h2>
        <div className="stat-grid admin-stats">
          <Tile n={st.economy.gold.toLocaleString('uk-UA')} label="🪙 золота в гравців" />
          <Tile n={st.economy.shards.toLocaleString('uk-UA')} label="💎 уламків у гравців" />
          <Tile n={st.economy.purchases} label="покупок за період" />
          <Tile n={formatPrice(st.economy.revenue)} label="оплачено за період" />
          <Tile n={st.economy.buyers} label="покупців" />
        </div>
      </div>
    </div>
  );
}

function Tile({ n, label }: { n: number | string; label: string }) {
  return (
    <div className="stat">
      <b>{n}</b>
      <span>{label}</span>
    </div>
  );
}

function Line({ label, n, total }: { label: string; n: number; total: number }) {
  return (
    <div className="ast-line">
      <span>{label}</span>
      <span className="bar small-bar">
        <span style={{ width: `${pct(n, total)}%` }} />
      </span>
      <b>{n}</b>
    </div>
  );
}
