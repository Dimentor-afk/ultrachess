import { useEffect, useState } from 'react';
import type { AdminUser } from '../api/client';
import { PACKS, type PackType, packName } from '../economy/packs';
import { packArt } from './cardArt';
import { errorText, useSession } from './state';
import { locale, t } from '../i18n';
import { formatPrice } from '../economy/payments';

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
        <h1>{t('Адмін-панель')}</h1>
        <p className="muted">
          {t('Гравці, паки й кубки. Режим: {0}.', s.api.mode === 'server' ? t('сервер (спільна база даних)') : t('демо в браузері'))}
        </p>
      </div>
      <div className="panel admin-tools">
        <span>{t('Пак для видачі:')}</span>
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
          <p className="muted">{t('Завантаження…')}</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t('Гравець')}</th>
                  <th>{t('Роль')}</th>
                  <th className="num">{t('Кубки ⚔ / 🤖')}</th>
                  <th className="num">{t('Карток')}</th>
                  <th className="num">🪙 / 💎</th>
                  <th className="num">W / L</th>
                  <th>{t('Дії')}</th>
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
                        {!u.claimed && t(' · ще не зареєструвався')}
                      </small>
                    </td>
                    <td>{u.role === 'admin' ? <span className="pill pill-ok">{t('адмін')}</span> : t('гравець')}</td>
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
                    <td>
                      <div className="chip-row">
                        <button className="btn btn-sm btn-primary" onClick={() => run(() => s.api.adminGrantPack(u.id, packType), `${packName(packType)} → ${u.name}`)}>
                          {t('Дати пак')}
                        </button>
                        <button className="btn btn-sm" onClick={() => run(() => s.api.adminGrantAllCards(u.id), t('Усі карти → {0}', u.name))}>
                          {t('Усі карти')}
                        </button>
                        <button
                          className="btn btn-sm"
                          onClick={() => run(() => s.api.adminGrantCurrency(u.id, 1000, 1000), t('+1000 🪙 і +1000 💎 → {0}', u.name))}
                        >
                          +1000 🪙💎
                        </button>
                        {u.id !== s.profile.id && (
                          <button
                            className="btn btn-sm"
                            onClick={() => run(() => s.api.adminSetRole(u.id, u.role === 'admin' ? 'player' : 'admin'), t('Роль змінено'))}
                          >
                            {u.role === 'admin' ? t('Зняти адміна') : t('Зробити адміном')}
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

const STATUS: Record<string, string> = { pending: t('очікує'), paid: t('оплачено'), failed: t('не пройшла'), expired: t('прострочено'), refunded: t('повернено') };

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
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="muted tiny">{new Date(r.createdAt).toLocaleString(locale(), { dateStyle: 'short', timeStyle: 'short' })}</td>
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
