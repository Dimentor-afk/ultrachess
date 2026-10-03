import { useEffect, useState } from 'react';
import type { PurchaseView, ShardProduct } from '../api/client';
import { PACKS, RARITIES, type PackType } from '../economy/packs';
import { formatPrice, productById } from '../economy/payments';
import { RARITY_NAMES } from '../engine/cards';
import { locale } from '../i18n';
import { navigate } from './router';
import { errorText, useSession } from './state';
import { t } from '../i18n';

const STATUS: Record<PurchaseView['status'], string> = {
  pending: t('очікує оплати'),
  paid: t('оплачено'),
  failed: t('не пройшла'),
  expired: t('час вийшов'),
  refunded: t('повернено'),
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
      // The test page lives in the app; a real payment page is Lemon Squeezy's.
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
        <h2>{t('💎 Уламки')}</h2>
        {offer.test && <span className="tag-chip">{t('тестова оплата')}</span>}
      </div>
      {!offer.enabled ? (
        <p className="muted small">{t('Покупка уламків за гроші скоро з’явиться. Поки уламки дають повторки карток.')}</p>
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
            {offer.test ? t('Тестова оплата: гроші не списуються.') : t('Оплата карткою, PayPal чи Apple/Google Pay на сторінці Lemon Squeezy — він продавець і рахує податки.')}{' '}
            {t('Уламки зараховуються одразу після оплати. Купуючи, ви погоджуєтесь з')}{' '}<a href="#/terms">{t('умовами продажу')}</a>.
          </p>
        </>
      )}
      {mine.length > 0 && (
        <details className="purchase-list">
          <summary>{t('Мої покупки ({0})', mine.length)}</summary>
          {mine.slice(0, 10).map((p) => (
            <div key={p.id} className={`purchase-row st-${p.status}`}>
              <span>💎 {p.shards}</span>
              <span>{formatPrice(p.amount)}</span>
              <span className="purchase-status">{STATUS[p.status]}</span>
              <span className="muted tiny">{new Date(p.createdAt).toLocaleString(locale(), { dateStyle: 'short', timeStyle: 'short' })}</span>
            </div>
          ))}
        </details>
      )}
    </div>
  );
}

/** Back from the payment page (#/shop/paid/<id>): wait for the payment service's word. */
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
          if (r.purchase.status === 'paid') s.toast(t('+{0} 💎 — дякуємо за покупку!', r.purchase.shards));
          return;
        }
      } catch (e) {
        if (!stop) setError(errorText(e));
        return;
      }
      // The payment service's notice usually comes in seconds; keep asking for a few minutes.
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
        <p className="muted">{t('Перевіряємо оплату…')}</p>
      ) : p.status === 'pending' ? (
        <p>{t('⏳ Чекаємо підтвердження оплати: {0} 💎 за {1}. Зазвичай це кілька секунд.', p.shards, formatPrice(p.amount))}</p>
      ) : p.status === 'paid' ? (
        <p>{t('✅ Оплату отримано: +{0} 💎 уже на вашому рахунку.', p.shards)}</p>
      ) : (
        <p>{p.status === 'refunded' ? t('❌ Оплата: {0}. Гроші повернено.', STATUS[p.status]) : t('❌ Оплата: {0}. Гроші не списано.', STATUS[p.status])}</p>
      )}
      <button className="btn btn-sm btn-ghost" onClick={close}>
        {t('Закрити')}
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
        <span className="tag-chip">{t('Тестова оплата — гроші не списуються')}</span>
        <h1>{t('Оплата')}</h1>
        {error ? (
          <p className="error-text">{error}</p>
        ) : !p ? (
          <p className="muted">{t('Завантаження…')}</p>
        ) : p.status !== 'pending' ? (
          <p>{t('Цю покупку вже завершено ({0}).', STATUS[p.status])}</p>
        ) : (
          <>
            <p className="test-pay-sum">
              {formatPrice(p.amount)} <span className="muted">· Ultrachess: {product?.shards ?? p.shards} 💎</span>
            </p>
            <p className="muted small">{t('На справжньому сайті тут була б сторінка оплати Lemon Squeezy. Оберіть, чим закінчиться оплата:')}</p>
            <div className="test-pay-actions">
              <button className="btn btn-primary" disabled={busy} onClick={() => finish(true)}>
                {t('Оплатити')}
              </button>
              <button className="btn btn-ghost" disabled={busy} onClick={() => finish(false)}>
                {t('Відхилити')}
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
  const caps = Object.entries(def.limits).map(([r, n]) => t('не більше {0} шт. рідкості «{1}» або вищої', n, RARITY_NAMES[r as keyof typeof RARITY_NAMES].toLowerCase()));
  return (
    <details className="pack-odds">
      <summary>{t('Шанси')}</summary>
      <p className="tiny">
        {t('Для кожної з {0} карток: {1}.', def.cards, rarities.map((r) => `${RARITY_NAMES[r].toLowerCase()} ${pct(def.odds[r])}`).join(' · '))}
        {def.guarantee && t(' Гарантовано щонайменше одна картка рідкості «{0}» або вищої.', RARITY_NAMES[def.guarantee].toLowerCase())}
        {caps.length > 0 && t(' У паку {0}: зайва така картка стає на рідкість нижчою.', caps.join(', '))} {t('Сама картка всередині рідкості — випадкова, з рівними шансами.')}
      </p>
    </details>
  );
}
