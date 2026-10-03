import { useEffect, useState } from 'react';
import type { AdminUser } from '../api/client';
import { PACKS, type PackType, packName } from '../economy/packs';
import { packArt } from './cardArt';
import { errorText, useSession } from './state';

const PACK_TYPES: PackType[] = ['starter', ...(Object.keys(PACKS) as PackType[])];

export function AdminPage() {
  const s = useSession();
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [packType, setPackType] = useState<PackType>('legendary');

  const load = () => s.api.adminUsers().then(setUsers, (e) => s.toast(errorText(e), 'error'));
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = async (fn: () => Promise<void>, ok: string) => {
    try {
      await fn();
      s.toast(ok);
      await load();
      await s.refresh();
    } catch (e) {
      s.toast(errorText(e), 'error');
    }
  };

  return (
    <section className="page">
      <div className="page-head">
        <h1>Адмін-панель</h1>
        <p className="muted">
          Гравці, паки й кубки. Режим: {s.api.mode === 'server' ? 'сервер (спільна база даних)' : 'демо в браузері'}.
        </p>
      </div>
      <div className="panel admin-tools">
        <span>Пак для видачі:</span>
        <div className="chip-row">
          {PACK_TYPES.map((t) => (
            <button key={t} className={`chip ${packType === t ? 'on' : ''}`} onClick={() => setPackType(t)}>
              <img className="chip-pack" src={packArt(t)} alt="" /> {packName(t)}
            </button>
          ))}
        </div>
      </div>
      <div className="panel">
        {!users ? (
          <p className="muted">Завантаження…</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Гравець</th>
                  <th>Роль</th>
                  <th className="num">Кубки ⚔ / 🤖</th>
                  <th className="num">Карток</th>
                  <th className="num">🪙 / 💎</th>
                  <th className="num">W / L</th>
                  <th>Дії</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <b>{u.name}</b>
                      <br />
                      <small className="muted">
                        {u.email}
                        {!u.claimed && ' · ще не зареєструвався'}
                      </small>
                    </td>
                    <td>{u.role === 'admin' ? <span className="pill pill-ok">адмін</span> : 'гравець'}</td>
                    <td className="num">
                      <input
                        className="num-input"
                        type="number"
                        defaultValue={u.trophies}
                        aria-label={`Кубки ліги гравців ${u.name}`}
                        onBlur={(e) => {
                          const v = Number(e.target.value);
                          if (v !== u.trophies) void run(() => s.api.adminSetTrophies(u.id, v), `Кубки: ${u.name} → ${v}`);
                        }}
                      />
                      <input
                        className="num-input"
                        type="number"
                        defaultValue={u.botTrophies}
                        aria-label={`Кубки ліги ботів ${u.name}`}
                        onBlur={(e) => {
                          const v = Number(e.target.value);
                          if (v !== u.botTrophies) void run(() => s.api.adminSetTrophies(u.id, v, 'bot'), `Кубки ліги ботів: ${u.name} → ${v}`);
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
                    <td>
                      <div className="chip-row">
                        <button className="btn btn-sm btn-primary" onClick={() => run(() => s.api.adminGrantPack(u.id, packType), `${packName(packType)} → ${u.name}`)}>
                          Дати пак
                        </button>
                        <button className="btn btn-sm" onClick={() => run(() => s.api.adminGrantAllCards(u.id), `Усі карти → ${u.name}`)}>
                          Усі карти
                        </button>
                        <button
                          className="btn btn-sm"
                          onClick={() => run(() => s.api.adminGrantCurrency(u.id, 1000, 1000), `+1000 🪙 і +1000 💎 → ${u.name}`)}
                        >
                          +1000 🪙💎
                        </button>
                        {u.id !== s.profile.id && (
                          <button
                            className="btn btn-sm"
                            onClick={() => run(() => s.api.adminSetRole(u.id, u.role === 'admin' ? 'player' : 'admin'), 'Роль змінено')}
                          >
                            {u.role === 'admin' ? 'Зняти адміна' : 'Зробити адміном'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <AdminPurchases />
    </section>
  );
}

const STATUS: Record<string, string> = { pending: 'очікує', paid: 'оплачено', failed: 'не пройшла', expired: 'прострочено', refunded: 'повернено' };

/** The journal of real-money purchases, newest first. */
function AdminPurchases() {
  const s = useSession();
  const [rows, setRows] = useState<Awaited<ReturnType<typeof s.api.adminPurchases>> | null>(null);
  useEffect(() => {
    s.api.adminPurchases().then(setRows, () => setRows([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!rows) return null;
  const paid = rows.filter((r) => r.status === 'paid');
  const total = paid.reduce((sum, r) => sum + r.amount, 0) / 100;
  return (
    <div className="panel">
      <div className="section-head">
        <h2>Покупки</h2>
        <span className="muted small">
          оплачено {paid.length} на {total.toLocaleString('uk-UA')} ₴ (останні {rows.length})
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="muted">Покупок ще не було.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Коли</th>
                <th>Гравець</th>
                <th>Осколки</th>
                <th>Сума</th>
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="muted tiny">{new Date(r.createdAt).toLocaleString('uk-UA', { dateStyle: 'short', timeStyle: 'short' })}</td>
                  <td>
                    {r.name} <small className="muted">{r.email}</small>
                  </td>
                  <td>💎 {r.shards}</td>
                  <td>{r.price}</td>
                  <td>{STATUS[r.status] ?? r.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
