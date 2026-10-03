import { useEffect, useState } from 'react';
import type { PurchaseView, ShardProduct } from '../api/client';
import { PACKS, RARITIES, type PackType } from '../economy/packs';
import { formatPrice, productById } from '../economy/payments';
import { RARITY_NAMES } from '../engine/cards';
import { navigate } from './router';
import { errorText, useSession } from './state';

const STATUS: Record<PurchaseView['status'], string> = {
  pending: 'очікує оплати',
  paid: 'оплачено',
  failed: 'не пройшла',
  expired: 'час вийшов',
  refunded: 'повернено',
};

/** Shards for money: the bundles, and the last purchases. */
export function ShardStore() {
  const s = useSession();
  const [offer, setOffer] = useState<{ products: ShardProduct[]; enabled: boolean; test: boolean } | null>(null);
  const [mine, setMine] = useState<PurchaseView[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    s.api.shardOffer().then(setOffer, () => setOffer(null));
    s.api.purchases().then(setMine, () => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!offer) return null;
  const buy = async (p: ShardProduct) => {
    setBusy(p.id);
    try {
      const r = await s.api.buyShards(p.id);
      const hash = r.pageUrl.indexOf('#/pay/test/');
      // The test page lives in the app; a real payment page is the bank's.
      if (hash >= 0) navigate(r.pageUrl.slice(hash + 1));
      else window.location.href = r.pageUrl;
    } catch (e) {
      s.toast(errorText(e), 'error');
      setBusy(null);
    }
  };

  return (
    <div className="panel shard-store">
      <div className="section-head">
        <h2>💎 Осколки</h2>
        {offer.test && <span className="tag-chip">тестова оплата</span>}
      </div>
      {!offer.enabled ? (
        <p className="muted small">Покупка осколків за гроші скоро з’явиться. Поки осколки дають повторки карток.</p>
      ) : (
        <>
          <div className="shard-bundles">
            {offer.products.map((p) => (
              <button key={p.id} className="shard-bundle" disabled={!!busy} onClick={() => buy(p)}>
                <span className="shard-amount">💎 {p.shards}</span>
                {p.bonus > 0 && <span className="shard-bonus">+{p.bonus}%</span>}
                <span className="shard-price">{busy === p.id ? '…' : formatPrice(p.price)}</span>
              </button>
            ))}
          </div>
          <p className="muted tiny">
            Оплата карткою через {offer.test ? 'тестову сторінку (гроші не списуються)' : 'monobank'}. Осколки зараховуються одразу після
            оплати. Купуючи, ви погоджуєтесь з <a href="#/terms">умовами (публічна оферта)</a>.
          </p>
        </>
      )}
      {mine.length > 0 && (
        <details className="purchase-list">
          <summary>Мої покупки ({mine.length})</summary>
          {mine.slice(0, 10).map((p) => (
            <div key={p.id} className={`purchase-row st-${p.status}`}>
              <span>💎 {p.shards}</span>
              <span>{formatPrice(p.amount)}</span>
              <span className="purchase-status">{STATUS[p.status]}</span>
              <span className="muted tiny">{new Date(p.createdAt).toLocaleString('uk-UA', { dateStyle: 'short', timeStyle: 'short' })}</span>
            </div>
          ))}
        </details>
      )}
    </div>
  );
}

/** Back from the payment page (#/shop/paid/<id>): wait for the bank's word. */
export function PaymentReturn({ id }: { id: string }) {
  const s = useSession();
  const [p, setP] = useState<PurchaseView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stop = false;
    let tries = 0;
    const check = async () => {
      try {
        const r = await s.api.purchase(id);
        if (stop) return;
        setP(r.purchase);
        if (r.purchase.status !== 'pending') {
          s.setProfile(r.profile);
          if (r.purchase.status === 'paid') s.toast(`+${r.purchase.shards} 💎 — дякуємо за покупку!`);
          return;
        }
      } catch (e) {
        if (!stop) setError(errorText(e));
        return;
      }
      // The bank's notice usually comes in seconds; keep asking for a few minutes.
      if (++tries < 90 && !stop) setTimeout(check, 2000);
    };
    void check();
    return () => {
      stop = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const close = () => navigate('/shop');
  return (
    <div className={`panel payment-return ${p ? `st-${p.status}` : ''}`} role="status">
      {error ? (
        <p className="error-text">{error}</p>
      ) : !p ? (
        <p className="muted">Перевіряємо оплату…</p>
      ) : p.status === 'pending' ? (
        <p>⏳ Чекаємо підтвердження від банку: {p.shards} 💎 за {formatPrice(p.amount)}. Зазвичай це кілька секунд.</p>
      ) : p.status === 'paid' ? (
        <p>✅ Оплату отримано: <b>+{p.shards} 💎</b> уже на вашому рахунку.</p>
      ) : (
        <p>❌ Оплата {STATUS[p.status]}. Гроші не списано{p.status === 'refunded' ? ' (або повернено)' : ''}.</p>
      )}
      <button className="btn btn-sm btn-ghost" onClick={close}>
        Закрити
      </button>
    </div>
  );
}

/** #/pay/test/<id>: the "bank page" of test payments. */
export function TestPayPage({ id }: { id: string }) {
  const s = useSession();
  const [p, setP] = useState<PurchaseView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    s.api.purchase(id).then((r) => setP(r.purchase), (e) => setError(errorText(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const finish = async (ok: boolean) => {
    setBusy(true);
    try {
      await s.api.completeTestPayment(id, ok);
      navigate(`/shop/paid/${id}`);
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };
  const product = p ? productById(p.product) : undefined;
  return (
    <section className="page">
      <div className="panel test-pay">
        <span className="tag-chip">Тестова оплата — гроші не списуються</span>
        <h1>Оплата</h1>
        {error ? (
          <p className="error-text">{error}</p>
        ) : !p ? (
          <p className="muted">Завантаження…</p>
        ) : p.status !== 'pending' ? (
          <p>Цю покупку вже завершено ({STATUS[p.status]}).</p>
        ) : (
          <>
            <p className="test-pay-sum">
              {formatPrice(p.amount)} <span className="muted">· Ultrachess: {product?.shards ?? p.shards} 💎</span>
            </p>
            <p className="muted small">На справжньому сайті тут була б сторінка monobank. Оберіть, чим закінчиться оплата:</p>
            <div className="test-pay-actions">
              <button className="btn btn-primary" disabled={busy} onClick={() => finish(true)}>
                Оплатити
              </button>
              <button className="btn btn-ghost" disabled={busy} onClick={() => finish(false)}>
                Відхилити
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

const pct = (n: number) => `${String(n).replace('.', ',')} %`;

/** A pack's drop chances, shown under it in the shop (packs bought with shards bought with money are loot boxes). */
export function PackOdds({ type }: { type: Exclude<PackType, 'starter'> }) {
  const def = PACKS[type];
  const rarities = RARITIES.filter((r) => def.odds[r] > 0);
  const caps = Object.entries(def.limits).map(([r, n]) => `не більше ${n} ${n === 1 ? 'картки' : 'карток'} рідкості «${RARITY_NAMES[r as keyof typeof RARITY_NAMES].toLowerCase()}» або вищої`);
  return (
    <details className="pack-odds">
      <summary>Шанси</summary>
      <p className="tiny">
        Для кожної з {def.cards} карток: {rarities.map((r) => `${RARITY_NAMES[r].toLowerCase()} ${pct(def.odds[r])}`).join(' · ')}.
        {def.guarantee && ` Гарантовано щонайменше одна картка рідкості «${RARITY_NAMES[def.guarantee].toLowerCase()}» або вищої.`}
        {caps.length > 0 && ` У паку ${caps.join(', ')}: зайва така картка стає на рідкість нижчою.`} Сама картка всередині
        рідкості — випадкова, з рівними шансами.
      </p>
    </details>
  );
}
