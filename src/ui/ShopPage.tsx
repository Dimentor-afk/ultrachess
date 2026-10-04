import { useEffect, useState } from 'react';
import type { PackView } from '../api/client';
import { FREE_PACK, PACKS, PACK_SHARD_PRICE, SHARDS_PER_DUPE, type PackType } from '../economy/packs';
import { type BoardTheme, themeById } from '../economy/themes';
import { type CaptureFx, captureFxById } from '../economy/captureFx';
import { RARITY_NAMES } from '../engine/cards';
import type { Rarity } from '../engine/types';
import { packArt } from './cardArt';
import { FxSwatch, ThemeSwatch, priceTier, useCountdown, useShopOffer } from './cosmetics';
import { Icon } from './icons';
import { errorText, useSession } from './state';
import { t, tr } from '../i18n';
import { PackOdds, PaymentReturn, ShardStore } from './Payments';
import { PackOpening } from './PackOpening';
import { useRoutePath } from './router';

type ShopPack = Exclude<PackType, 'starter'>;

/**
 * Scroll to the shards for money (or, while those are hidden, the packs for
 * shards). The shard offer comes from the server a moment after the page.
 */
export function scrollToShards(): () => void {
  let tries = 0;
  const timer = setInterval(() => {
    const el = document.querySelector('.shard-store') ?? (tries > 10 ? document.getElementById('shop-packs') : null);
    if (el || ++tries > 20) clearInterval(timer);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 100);
  return () => clearInterval(timer);
}

/**
 * Today's showcase first: three boards and three capture effects for gold,
 * new every day. Then packs for shards, then shards for money. A bought pack
 * opens right here; #/shop/shards scrolls down to the shards (the wallet in
 * the header links there). What you own is put on in the deck page's style tab.
 */
export function ShopPage() {
  const s = useSession();
  const { profile } = s;
  const offer = useShopOffer();
  const left = useCountdown(offer?.refreshAt);
  const [busy, setBusy] = useState<string | null>(null);
  // Gold buys take two taps: the first asks "Купити?", so a stray tap costs nothing.
  const [confirm, setConfirm] = useState<string | null>(null);
  // Back from a payment page: #/shop/paid/<purchase>.
  const path = useRoutePath();
  const paid = /^\/shop\/paid\/(\w+)$/.exec(path)?.[1];
  // A pack just bought, waiting to be opened.
  const [opening, setOpening] = useState<PackView | null>(null);

  // #/shop/shards: to the shards for money.
  useEffect(() => {
    if (path === '/shop/shards') return scrollToShards();
  }, [path]);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setConfirm(null);
    try {
      await fn();
    } catch (e) {
      s.toast(errorText(e), 'error');
    } finally {
      setBusy(null);
    }
  };

  const buyPack = (type: ShopPack) =>
    run(type, async () => {
      const r = await s.api.buyPack(type);
      s.setProfile(r.profile);
      setOpening(r.pack);
    });

  const claimFree = () =>
    run('free', async () => {
      const r = await s.api.claimFreePack();
      s.setProfile(r.profile);
      setOpening(r.pack);
    });

  const buyTheme = (theme: BoardTheme) =>
    run(theme.id, async () => {
      s.setProfile(await s.api.buyTheme(theme.id));
      s.toast(t('Дошка «{0}» ваша і вже стоїть у грі!', theme.name));
    });

  const buyFx = (f: CaptureFx) =>
    run(f.id, async () => {
      s.setProfile(await s.api.buyCaptureFx(f.id));
      s.toast(t('Ефект «{0}» ваш — побачите його в наступному бою!', f.name));
    });

  const priceButton = (id: string, price: number, buy: () => void) => {
    const short = price - profile.gold;
    if (short > 0) {
      return (
        <button className="btn btn-sm btn-price" disabled>
          🪙 {price}
          <small>{t('бракує')}{' '}{short}</small>
        </button>
      );
    }
    return (
      <button
        className={`btn btn-sm btn-primary btn-price ${confirm === id ? 'confirming' : ''}`}
        disabled={busy === id}
        onClick={() => (confirm === id ? buy() : setConfirm(id))}
        onBlur={() => setConfirm((c) => (c === id ? null : c))}
      >
        {confirm === id ? t('Купити за 🪙 {0}?', price) : `🪙 ${price}`}
      </button>
    );
  };

  const ownedTag = (active: boolean) => (
    <a className="owned-tag" href="#/deck/style">
      {active ? t('✓ У грі') : t('✓ Ваша')}
    </a>
  );

  return (
    <section className="page shop">
      <div className="page-head">
        <h1>{t('Магазин')}</h1>
      </div>

      {paid && <PaymentReturn id={paid} />}

      <div className="showcase panel">
        <div className="showcase-head">
          <div>
            <span className="eyebrow">{t('Щоденна вітрина')}</span>
            <h2>{t('Сьогодні в продажу')}</h2>
          </div>
          <span className="showcase-timer" title={t('Вітрина однакова для всіх гравців і оновлюється щодня')}>
            <Icon name="clock" />
            {offer ? <>{t('Нова через {0}', left)}</> : t('Завантаження…')}
          </span>
        </div>

        <h3 className="showcase-sub">{t('Дошки')}</h3>
        <div className="offer-row">
          {offer
            ? offer.themes.map((id) => {
                const theme = themeById(id);
                const owned = profile.themes.includes(id);
                return (
                  <article key={id} className={`offer-card r-${priceTier(theme.price)} ${owned ? 'owned' : ''}`}>
                    <ThemeSwatch theme={theme} />
                    <b>{theme.name}</b>
                    {owned ? ownedTag(profile.boardTheme === id) : priceButton(id, theme.price, () => buyTheme(theme))}
                  </article>
                );
              })
            : [0, 1, 2].map((i) => <div key={i} className="offer-card skeleton" />)}
        </div>

        <h3 className="showcase-sub">{t('Ефекти взяття')}</h3>
        <div className="offer-row">
          {offer
            ? offer.fx.map((id) => {
                const f = captureFxById(id);
                const owned = profile.ownedFx.includes(id);
                return (
                  <article key={id} className={`offer-card r-${priceTier(f.price)} ${owned ? 'owned' : ''}`}>
                    <FxSwatch fx={f} />
                    <b>{f.name}</b>
                    {owned ? ownedTag(profile.captureFx === id) : priceButton(id, f.price, () => buyFx(f))}
                  </article>
                );
              })
            : [0, 1, 2].map((i) => <div key={i} className="offer-card skeleton" />)}
        </div>

        <a className="showcase-foot" href="#/deck/style">
          <Icon name="edit" />
          <span>
            {t('Змінити дошку чи ефект:')}{' '}<b>{t('Колода → Стиль')}</b>
          </span>
        </a>
      </div>

      <div className="section-head" id="shop-packs">
        <h2>{t('💎 Паки за уламки')}</h2>
        <span className="muted small">
          {t('У вас')} <b className="shards-text">{profile.shards}</b> 💎
        </span>
      </div>
      <div className="shop-packs">
        <article className={`shop-pack pack-${FREE_PACK} free-pack ${profile.freePack ? 'can' : 'taken'}`}>
          <span className="free-pack-tag">{t('Подарунок дня')}</span>
          <img src={packArt(FREE_PACK)} alt="" />
          <div className="shop-pack-info">
            <b>{PACKS[FREE_PACK].name}</b>
            <span className="muted tiny">{profile.freePack ? t('Безкоштовно, раз на день.') : t('Наступний — завтра.')}</span>
          </div>
          <button className="btn btn-primary btn-price" disabled={!profile.freePack || busy === 'free'} onClick={claimFree}>
            {profile.freePack ? t('Забрати') : '✓'}
          </button>
        </article>
        {(Object.keys(PACK_SHARD_PRICE) as ShopPack[]).map((type) => {
          const price = PACK_SHARD_PRICE[type];
          const def = PACKS[type];
          const can = profile.shards >= price;
          return (
            <article key={type} className={`shop-pack pack-${type} ${can ? 'can' : ''}`}>
              <img src={packArt(type)} alt="" />
              <div className="shop-pack-info">
                <b>{def.name}</b>
                <span className="muted tiny">
                  {t('{0} карток · {1}', def.cards, def.description)}
                </span>
                <div className="bar small-bar" aria-hidden="true">
                  <span style={{ width: `${Math.min(100, (profile.shards / price) * 100)}%` }} />
                </div>
                <PackOdds type={type} />
              </div>
              <button className="btn btn-primary btn-price" disabled={!can || busy === type} onClick={() => buyPack(type)}>
                💎 {price}
              </button>
            </article>
          );
        })}
      </div>
      <p className="muted small">
        {t('Уламки за одну повторку:')}{' '}
        {(Object.entries(SHARDS_PER_DUPE) as [Rarity, number][]).map(([r, n]) => `${RARITY_NAMES[r].toLowerCase()} ${n}`).join(' · ')}.
      </p>
      <ShardStore />

      <p className="muted tiny legal-links">
        <a href="#/terms">{t('Умови продажу')}</a> · <a href="#/privacy">{t('Конфіденційність')}</a>
      </p>
      {opening && (
        <PackOpening
          pack={opening}
          open={() => s.api.openPack(opening.id)}
          onClose={async (res) => {
            setOpening(null);
            // Closed unopened: it waits with the other packs on the home page.
            if (!res) s.toast(t('{0} чекає на головній.', tr(opening.name)));
            await s.refresh();
          }}
        />
      )}
    </section>
  );
}
