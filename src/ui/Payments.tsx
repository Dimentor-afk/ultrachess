import { useEffect, useState } from 'react';
import type { PurchaseView, ShardOffer, ShardProduct } from '../api/client';
import { PACKS, RARITIES, type PackType } from '../economy/packs';
import { formatPrice, productById } from '../economy/payments';
import { packArt } from './cardArt';
import { RARITY_NAMES } from '../engine/cards';
import { getLang, locale } from '../i18n';
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
  const [offer, setOffer] = useState<ShardOffer | null>(null);
  const [mine, setMine] = useState<PurchaseView[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    s.api.shardOffer().then(setOffer, () => setOffer(null));
    s.api.purchases().then(setMine, () => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!offer || offer.hidden) return null;
  const buy = async (p: ShardProduct) => {
    setBusy(p.id);
    try {
      const r = await s.api.buyShards(p.id);
      const hash = r.pageUrl.indexOf('#/pay/');
      // Both the test page and Paddle's checkout open inside the app.
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
          {offer.products
            .filter((p) => p.once)
            .map((p) => (
              <button key={p.id} className="shard-special" disabled={!!busy} onClick={() => buy(p)}>
                <span className="shard-special-tag">{t('Спецпропозиція · лише раз')}</span>
                {p.pack && <img src={packArt(p.pack)} alt="" />}
                <span className="shard-special-what">
                  <b>💎 {p.shards}</b>
                  {p.pack && <span>+ {PACKS[p.pack].name}</span>}
                </span>
                <span className="btn btn-primary btn-price">{busy === p.id ? '…' : formatPrice(p.price)}</span>
              </button>
            ))}
          <div className="shard-bundles">
            {offer.products
              .filter((p) => !p.once)
              .map((p) => (
                <button key={p.id} className="shard-bundle" disabled={!!busy} onClick={() => buy(p)}>
                  <span className="shard-amount">💎 {p.shards}</span>
                  {p.bonus > 0 && <span className="shard-bonus">+{p.bonus}%</span>}
                  <span className="shard-price">{busy === p.id ? '…' : formatPrice(p.price)}</span>
                </button>
              ))}
          </div>
          <p className="muted tiny">
            {offer.test && <>{t('Тестова оплата: гроші не списуються.')}{' '}</>}
            {t('Купуючи, ви погоджуєтесь з')}{' '}<a href="#/terms">{t('умовами продажу')}</a>.
          </p>
        </>
      )}
      {mine.length > 0 && (
        <details className="purchase-list">
          <summary>{t('Мої покупки ({0})', mine.length)}</summary>
          {mine.slice(0, 10).map((p) => (
            <div key={p.id} className={`purchase-row st-${p.status}`}>
              <span>
                💎 {p.shards}
                {productById(p.product)?.pack && ` + ${PACKS[productById(p.product)!.pack!].name}`}
              </span>
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
          if (r.purchase.status === 'paid') {
            const pack = productById(r.purchase.product)?.pack;
            s.toast(pack ? t('+{0} 💎 і {1} — дякуємо за покупку! Пак чекає на головній.', r.purchase.shards, PACKS[pack].name) : t('+{0} 💎 — дякуємо за покупку!', r.purchase.shards));
          }
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
            <p className="muted small">{t('На справжньому сайті тут була б вікно оплати Paddle. Оберіть, чим закінчиться оплата:')}</p>
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

/** Paddle.js as much as this page uses it. */
interface PaddleJs {
  Environment: { set(env: 'sandbox'): void };
  Initialize(opts: { token: string; eventCallback: (e: { name?: string }) => void }): void;
  Checkout: { open(opts: { transactionId: string; settings: Record<string, unknown> }): void };
}

let paddleJs: Promise<PaddleJs> | null = null;

/** Paddle's script, loaded once, the first time someone pays. */
function loadPaddle(): Promise<PaddleJs> {
  return (paddleJs ??= new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = 'https://cdn.paddle.com/paddle/v2/paddle.js';
    el.onload = () => resolve((window as unknown as { Paddle: PaddleJs }).Paddle);
    el.onerror = () => {
      paddleJs = null;
      reject(new Error(t('Не вдалося завантажити сторінку оплати. Перевірте з’єднання.')));
    };
    document.head.appendChild(el);
  }));
}

/**
 * #/pay/paddle/<purchase>/<transaction>: Paddle's checkout over our page. When it
 * completes the player goes to the return page, which waits for Paddle's notice.
 */
export function PaddlePayPage({ purchaseId, transactionId }: { purchaseId: string; transactionId: string }) {
  const s = useSession();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let done = false;
    (async () => {
      const offer = await s.api.shardOffer();
      if (offer.checkout?.provider !== 'paddle') throw new Error(t('Покупки за гроші поки недоступні.'));
      const Paddle = await loadPaddle();
      if (offer.checkout.sandbox) Paddle.Environment.set('sandbox');
      Paddle.Initialize({
        token: offer.checkout.token,
        eventCallback: (e) => {
          if (e.name === 'checkout.completed') {
            done = true;
            navigate(`/shop/paid/${purchaseId}`);
          } else if (e.name === 'checkout.closed' && !done) {
            navigate('/shop');
          }
        },
      });
      const lang = getLang();
      Paddle.Checkout.open({
        transactionId,
        settings: { displayMode: 'overlay', theme: 'dark', locale: lang === 'uk' ? 'en' : lang, showAddDiscounts: false },
      });
    })().catch((e) => setError(errorText(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [purchaseId, transactionId]);

  return (
    <section className="page">
      <div className="panel test-pay">
        <h1>{t('Оплата')}</h1>
        {error ? <p className="error-text">{error}</p> : <p className="muted">{t('Відкриваємо вікно оплати Paddle…')}</p>}
        <button className="btn btn-ghost" onClick={() => navigate('/shop')}>
          {t('До магазину')}
        </button>
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
