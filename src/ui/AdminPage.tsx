import { AdminStatsTab } from './AdminStats';
import { useEffect, useMemo, useState } from 'react';
import type { AdminUser, HistoryRow } from '../api/client';
import { HistoryList } from './HistoryList';
import { PACKS, type PackType, packName } from '../economy/packs';
import { packArt } from './cardArt';
import { errorText, useSession } from './state';
import { Sheet } from './Sheet';
import { locale, t } from '../i18n';
import { formatPrice } from '../economy/payments';

const PACK_TYPES: PackType[] = ['starter', ...(Object.keys(PACKS) as PackType[])];

/** Ban lengths offered, in hours (null: for good). */
const BAN_LENGTHS: { hours: number | null; label: string }[] = [
  { hours: 1, label: t('1 година') },
  { hours: 24, label: t('1 день') },
  { hours: 24 * 7, label: t('7 днів') },
  { hours: 24 * 30, label: t('30 днів') },
  { hours: null, label: t('Назавжди') },
];

/** The latest date JavaScript can hold: a ban "for good" (BAN_FOREVER in the service). */
const FOREVER = 8.64e15;

type Filter = 'all' | 'online' | 'admins' | 'banned';
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: t('Усі') },
  { id: 'online', label: t('Онлайн') },
  { id: 'admins', label: t('Адміни') },
  { id: 'banned', label: t('Заблоковані') },
];

/** "5 minutes ago", "3 days ago" in the chosen language. */
function ago(ms: number): string {
  if (!ms) return t('ніколи');
  const s = (ms - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(locale(), { numeric: 'auto' });
  for (const [unit, size] of [['day', 86400], ['hour', 3600], ['minute', 60]] as const) {
    if (Math.abs(s) >= size) return rtf.format(Math.round(s / size), unit);
  }
  return rtf.format(0, 'minute');
}

const dateTime = (ms: number) => new Date(ms).toLocaleString(locale(), { dateStyle: 'short', timeStyle: 'short' });

export function AdminPage() {
  const s = useSession();
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [packType, setPackType] = useState<PackType>('legendary');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const [tab, setTab] = useState<'players' | 'stats'>('players');

  const load = () => s.api.adminUsers().then(setUsers, (e) => s.toast(errorText(e), 'error'));
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = async (fn: () => Promise<void>, ok: string): Promise<boolean> => {
    try {
      await fn();
      s.toast(ok);
      await load();
      await s.refresh();
      return true;
    } catch (e) {
      s.toast(errorText(e), 'error');
      return false;
    }
  };

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (users ?? []).filter(
      (u) =>
        (!q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)) &&
        (filter === 'all' || (filter === 'online' && u.online) || (filter === 'admins' && u.role === 'admin') || (filter === 'banned' && u.bannedUntil > 0)),
    );
  }, [users, query, filter]);

  const open = users?.find((u) => u.id === openId) ?? null;
  const day = Date.now() - 864e5;

  return (
    <section className="page">
      <div className="page-head">
        <h1>{t('Адмін-панель')}</h1>
      </div>
      <div className="ladder-switch admin-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'players'} className={`ladder-tab ${tab === 'players' ? 'on' : ''}`} onClick={() => setTab('players')}>
          <b>Гравці</b>
        </button>
        <button role="tab" aria-selected={tab === 'stats'} className={`ladder-tab ${tab === 'stats' ? 'on' : ''}`} onClick={() => setTab('stats')}>
          <b>Статистика</b>
        </button>
      </div>
      {tab === 'stats' && <AdminStatsTab />}
      {tab === 'players' && (
        <>

      {users && (
        <div className="stat-grid admin-stats">
          <div className="stat">
            <b>{users.filter((u) => u.claimed).length}</b>
            <span>{t('гравців')}</span>
          </div>
          <div className="stat stat-ok">
            <b>{users.filter((u) => u.online).length}</b>
            <span>{t('онлайн зараз')}</span>
          </div>
          <div className="stat">
            <b>{users.filter((u) => u.claimed && u.createdAt > day).length}</b>
            <span>{t('нових за добу')}</span>
          </div>
          <div className="stat">
            <b>{users.filter((u) => u.role === 'admin').length}</b>
            <span>{t('адмінів')}</span>
          </div>
          <div className="stat stat-bad">
            <b>{users.filter((u) => u.bannedUntil > 0).length}</b>
            <span>{t('заблоковано')}</span>
          </div>
        </div>
      )}

      <div className="panel admin-tools">
        <span>{t('Пак для видачі:')}</span>
        <div className="chip-row">
          {PACK_TYPES.map((p) => (
            <button key={p} className={`chip ${packType === p ? 'on' : ''}`} onClick={() => setPackType(p)}>
              <img className="chip-pack" src={packArt(p)} alt="" /> {packName(p)}
            </button>
          ))}
        </div>
      </div>

      <div className="panel">
        <div className="admin-filter">
          <input type="search" placeholder={t('Пошук: нікнейм або пошта')} value={query} onChange={(e) => setQuery(e.target.value)} aria-label={t('Пошук гравця')} />
          <div className="chip-row">
            {FILTERS.map((f) => (
              <button key={f.id} className={`chip ${filter === f.id ? 'on' : ''}`} onClick={() => setFilter(f.id)}>
                {f.label}
              </button>
            ))}
          </div>
        </div>
        {!users ? (
          <p className="muted">{t('Завантаження…')}</p>
        ) : shown.length === 0 ? (
          <p className="muted">{t('Нікого не знайдено.')}</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t('Гравець')}</th>
                  <th className="num">{t('Кубки ⚔ / 🤖')}</th>
                  <th className="num">{t('Карток')}</th>
                  <th className="num">🪙 / 💎</th>
                  <th className="num">W / L</th>
                  <th>{t('Був у грі')}</th>
                  <th>{t('Дії')}</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((u) => (
                  <tr key={u.id} className={u.bannedUntil > 0 ? 'admin-banned' : ''}>
                    <td>
                      <b>{u.name}</b> <Badges u={u} />
                      <br />
                      <small className="muted">
                        {u.email}
                        {!u.claimed && t(' · ще не зареєструвався')}
                      </small>
                    </td>
                    <td className="num">
                      <input
                        className="num-input"
                        type="number"
                        defaultValue={u.trophies}
                        aria-label={t('Кубки ліги гравців {0}', u.name)}
                        onBlur={(e) => {
                          const v = Number(e.target.value);
                          if (v !== u.trophies) void run(() => s.api.adminSetTrophies(u.id, v), t('Кубки: {0} → {1}', u.name, v));
                        }}
                      />
                      <input
                        className="num-input"
                        type="number"
                        defaultValue={u.botTrophies}
                        aria-label={t('Кубки ліги ботів {0}', u.name)}
                        onBlur={(e) => {
                          const v = Number(e.target.value);
                          if (v !== u.botTrophies) void run(() => s.api.adminSetTrophies(u.id, v, 'bot'), t('Кубки ліги ботів: {0} → {1}', u.name, v));
                        }}
                      />
                    </td>
                    <td className="num">{u.cards} / 69</td>
                    <td className="num">
                      {u.gold} / {u.shards}
                    </td>
                    <td className="num">
                      {u.wins} / {u.losses}
                    </td>
                    <td className="muted small">{u.online ? <span className="admin-online">{t('онлайн')}</span> : ago(u.lastSeen)}</td>
                    <td>
                      <div className="chip-row">
                        <button className="btn btn-sm btn-primary" onClick={() => run(() => s.api.adminGrantPack(u.id, packType), `${packName(packType)} → ${u.name}`)}>
                          {t('Дати пак')}
                        </button>
                        <button className="btn btn-sm" onClick={() => setOpenId(u.id)}>
                          {t('Керувати')}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {open && <PlayerSheet u={open} run={run} onClose={() => setOpenId(null)} />}
      <AdminPurchases />
        </>
      )}
    </section>
  );
}

function Badges({ u }: { u: AdminUser }) {
  return (
    <>
      {u.owner ? (
        <span className="pill pill-ok">{t('власник')}</span>
      ) : u.role === 'admin' ? (
        <span className="pill pill-ok">{t('адмін')}</span>
      ) : null}{' '}
      {u.bannedUntil > 0 && <span className="pill pill-ban">{t('бан')}</span>}
    </>
  );
}

/** Everything about one player: currency, ban, sessions, role, deletion. */
function PlayerSheet({ u, run, onClose }: { u: AdminUser; run: (fn: () => Promise<void>, ok: string) => Promise<boolean>; onClose: () => void }) {
  const s = useSession();
  const me = s.profile;
  const [gold, setGold] = useState('');
  const [shards, setShards] = useState('');
  const [banHours, setBanHours] = useState<number | null>(24);
  const [reason, setReason] = useState('');
  const [confirm, setConfirm] = useState('');
  const [newName, setNewName] = useState('');
  const [renameWhy, setRenameWhy] = useState('');
  // Mirrors the server's rule: not oneself, never the owner, another admin only by the owner.
  const manageable = u.id !== me.id && !u.owner && (u.role !== 'admin' || me.owner);

  return (
    <Sheet title={u.name} onClose={onClose} wide>
      <div className="admin-sheet">
        <p className="muted small">
          {u.email} <Badges u={u} />
          <br />
          {t('Акаунт з {0}', dateTime(u.createdAt))} · {t('був у грі: {0}', u.online ? t('онлайн') : ago(u.lastSeen))} ·{' '}
          {u.emailVerified ? t('пошту підтверджено') : t('пошту не підтверджено')}
        </p>

        <h3>{t('Партії')}</h3>
        <AdminGames userId={u.id} />

        <h3>{t('Валюта')}</h3>
        <p className="muted small">{t('Зараз: {0} 🪙 і {1} 💎. Від’ємне число забирає (не нижче нуля).', u.gold, u.shards)}</p>
        <div className="admin-row">
          <input className="num-input" type="number" placeholder="🪙" value={gold} onChange={(e) => setGold(e.target.value)} aria-label={t('Золото')} />
          <input className="num-input" type="number" placeholder="💎" value={shards} onChange={(e) => setShards(e.target.value)} aria-label={t('Уламки')} />
          <button
            className="btn btn-sm btn-primary"
            disabled={!gold && !shards}
            onClick={async () => {
              if (await run(() => s.api.adminGrantCurrency(u.id, Number(gold) || 0, Number(shards) || 0), t('Валюту змінено: {0}', u.name))) {
                setGold('');
                setShards('');
              }
            }}
          >
            {t('Застосувати')}
          </button>
          <button className="btn btn-sm" onClick={() => run(() => s.api.adminGrantAllCards(u.id), t('Усі карти → {0}', u.name))}>
            {t('Усі карти')}
          </button>
        </div>

        {!manageable ? (
          <p className="muted small admin-note">
            {u.id === me.id ? t('Це ваш акаунт: бан, видалення й роль тут недоступні.') : u.owner ? t('Це власник гри: його не можна заблокувати, видалити чи зняти.') : t('Інших адміністраторів може змінювати лише власник гри.')}
          </p>
        ) : (
          <>
            <h3>{t('Нікнейм')}</h3>
            <div className="admin-row">
              <input type="text" maxLength={24} placeholder={t('Новий нікнейм')} value={newName} onChange={(e) => setNewName(e.target.value)} aria-label={t('Новий нікнейм')} />
              <input type="text" maxLength={200} placeholder={t('Причина (гравець її побачить)')} value={renameWhy} onChange={(e) => setRenameWhy(e.target.value)} aria-label={t('Причина перейменування')} />
              <button
                className="btn btn-sm btn-primary"
                disabled={!newName.trim()}
                onClick={async () => {
                  if (await run(() => s.api.adminRename(u.id, newName, renameWhy), t('Перейменовано: {0} → {1}', u.name, newName.trim()))) {
                    setNewName('');
                    setRenameWhy('');
                  }
                }}
              >
                {t('Перейменувати')}
              </button>
            </div>

            <h3>{t('Бан')}</h3>
            {u.bannedUntil > 0 ? (
              <>
                <p className="small">
                  {u.bannedUntil >= FOREVER ? t('Заблоковано назавжди.') : t('Заблоковано до {0}.', dateTime(u.bannedUntil))}
                  {u.banReason && <> {t('Причина: {0}', u.banReason)}</>}
                </p>
                <button className="btn btn-sm" onClick={() => run(() => s.api.adminUnban(u.id), t('Розблоковано: {0}', u.name))}>
                  {t('Розблокувати')}
                </button>
              </>
            ) : (
              <>
                <div className="chip-row">
                  {BAN_LENGTHS.map((b) => (
                    <button key={String(b.hours)} className={`chip ${banHours === b.hours ? 'on' : ''}`} onClick={() => setBanHours(b.hours)}>
                      {b.label}
                    </button>
                  ))}
                </div>
                <div className="admin-row">
                  <input type="text" maxLength={200} placeholder={t('Причина (гравець її побачить)')} value={reason} onChange={(e) => setReason(e.target.value)} aria-label={t('Причина бану')} />
                  <button className="btn btn-sm btn-danger" onClick={() => run(() => s.api.adminBan(u.id, banHours, reason), t('Заблоковано: {0}', u.name))}>
                    {t('Заблокувати')}
                  </button>
                </div>
              </>
            )}

            <h3>{t('Сесії')}</h3>
            <div className="admin-row">
              <button className="btn btn-sm" onClick={() => run(() => s.api.adminLogout(u.id), t('{0} виведено з усіх пристроїв', u.name))}>
                {t('Вийти на всіх пристроях')}
              </button>
            </div>

            {me.owner && (
              <>
                <h3>{t('Роль')}</h3>
                <button
                  className="btn btn-sm"
                  onClick={() => run(() => s.api.adminSetRole(u.id, u.role === 'admin' ? 'player' : 'admin'), t('Роль змінено'))}
                >
                  {u.role === 'admin' ? t('Зняти адміна') : t('Зробити адміном')}
                </button>
              </>
            )}

            <div className="panel danger-zone admin-delete">
              <h3>{t('Видалити акаунт')}</h3>
              <p className="muted small">{t('Скасувати не можна.')}</p>
              <div className="admin-row">
                <input type="text" placeholder={t('Нікнейм для підтвердження')} value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-label={t('Нікнейм для підтвердження')} />
                <button
                  className="btn btn-sm btn-danger"
                  disabled={confirm.trim() !== u.name}
                  onClick={async () => {
                    if (await run(() => s.api.adminDeleteUser(u.id), t('Акаунт видалено: {0}', u.name))) onClose();
                  }}
                >
                  {t('Видалити')}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}

/** A player's finished games: each opens its replay, to see what really happened in a report. */
function AdminGames({ userId }: { userId: string }) {
  const s = useSession();
  const [rows, setRows] = useState<HistoryRow[] | null>(null);
  useEffect(() => {
    s.api.adminHistory(userId).then(setRows, (e) => {
      s.toast(errorText(e), 'error');
      setRows([]);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);
  if (!rows) return <p className="muted small">{t('Завантаження…')}</p>;
  if (!rows.length) return <p className="muted small">{t('Ще немає зіграних партій.')}</p>;
  return (
    <div className="admin-games">
      <HistoryList rows={rows} />
    </div>
  );
}

const STATUS: Record<string, string> = { pending: t('очікує'), paid: t('оплачено'), failed: t('не пройшла'), expired: t('прострочено'), refunded: t('повернено') };

/** The journal of real-money purchases, newest first. */
function AdminPurchases() {
  const s = useSession();
  const [rows, setRows] = useState<Awaited<ReturnType<typeof s.api.adminPurchases>> | null>(null);
  useEffect(() => {
    s.api.adminPurchases().then(setRows, () => setRows([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Deleting takes two taps: the first one asks.
  const [confirm, setConfirm] = useState<string | null>(null);
  if (!rows) return null;
  const remove = async (id: string) => {
    setConfirm(null);
    try {
      await s.api.adminDeletePurchase(id);
      setRows(rows.filter((r) => r.id !== id));
    } catch (e) {
      s.toast(errorText(e), 'error');
    }
  };
  const paid = rows.filter((r) => r.status === 'paid');
  const total = paid.reduce((sum, r) => sum + r.amount, 0);
  return (
    <div className="panel">
      <div className="section-head">
        <h2>{t('Покупки')}</h2>
        <span className="muted small">
          {t('оплачено {0} на {1} (останні {2})', paid.length, formatPrice(total), rows.length)}
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="muted">{t('Покупок ще не було.')}</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t('Коли')}</th>
                <th>{t('Гравець')}</th>
                <th>{t('Уламки')}</th>
                <th>{t('Сума')}</th>
                <th>{t('Статус')}</th>
                {s.profile.owner && <th />}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="muted tiny">{dateTime(r.createdAt)}</td>
                  <td>
                    {r.name} <small className="muted">{r.email}</small>
                  </td>
                  <td>💎 {r.shards}</td>
                  <td>{r.price}</td>
                  <td>{STATUS[r.status] ?? r.status}</td>
                  {s.profile.owner && (
                    <td>
                      <button
                        className={`btn btn-sm ${confirm === r.id ? 'btn-danger' : 'btn-ghost'}`}
                        onClick={() => (confirm === r.id ? remove(r.id) : setConfirm(r.id))}
                        onBlur={() => setConfirm((c) => (c === r.id ? null : c))}
                        title={t('Прибрати з журналу (уламки лишаються в гравця)')}
                      >
                        {confirm === r.id ? t('Прибрати?') : '✕'}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
