import { useState } from 'react';
import { PACKS, PACK_SHARD_PRICE, SHARDS_PER_DUPE, type PackType } from '../economy/packs';
import { type BoardTheme, themeById } from '../economy/themes';
import { type CaptureFx, captureFxById } from '../economy/captureFx';
import { RARITY_NAMES } from '../engine/cards';
import type { Rarity } from '../engine/types';
import { packArt } from './cardArt';
import { FxSwatch, ThemeSwatch, priceTier, useCountdown, useShopOffer } from './cosmetics';
import { Icon } from './icons';
import { errorText, useSession } from './state';
import { PackOdds, PaymentReturn, ShardStore } from './Payments';
import { useRoutePath } from './router';

type ShopPack = Exclude<PackType, 'starter'>;

/**
 * Today's showcase first: three boards and three capture effects for gold,
 * new every day. Then packs for shards. What you own is put on in the deck
 * page's style tab.
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
  const paid = /^\/shop\/paid\/(\w+)$/.exec(useRoutePath())?.[1];

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
      s.setPacks(await s.api.packs());
      s.toast(`${r.pack.name} куплено — відкрийте його на головній.`);
    });

  const buyTheme = (t: BoardTheme) =>
    run(t.id, async () => {
      s.setProfile(await s.api.buyTheme(t.id));
      s.toast(`Дошка «${t.name}» ваша і вже стоїть у грі!`);
    });

  const buyFx = (f: CaptureFx) =>
    run(f.id, async () => {
      s.setProfile(await s.api.buyCaptureFx(f.id));
      s.toast(`Ефект «${f.name}» ваш — побачите його в наступному бою!`);
    });

  const priceButton = (id: string, price: number, buy: () => void) => {
    const short = price - profile.gold;
    if (short > 0) {
      return (
        <button className="btn btn-sm btn-price" disabled>
          🪙 {price}
          <small>бракує {short}</small>
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
        {confirm === id ? `Купити за 🪙 ${price}?` : `🪙 ${price}`}
      </button>
    );
  };

  const ownedTag = (active: boolean) => (
    <a className="owned-tag" href="#/deck/style">
      {active ? '✓ У грі' : '✓ Ваша'}
    </a>
  );

  return (
    <section className="page shop">
      <div className="page-head">
        <h1>Магазин</h1>
        <p className="muted">
          Щодня тут нові три дошки й три ефекти взяття за золото 🪙. Паки купуються за осколки 💎: вони дають повторки карт, а ще їх можна купити.
        </p>
      </div>

      {paid && <PaymentReturn id={paid} />}

      <div className="showcase panel">
        <div className="showcase-head">
          <div>
            <span className="eyebrow">Щоденна вітрина</span>
            <h2>Сьогодні в продажу</h2>
          </div>
          <span className="showcase-timer" title="Вітрина однакова для всіх гравців і оновлюється щодня">
            <Icon name="clock" />
            {offer ? <>Нова через {left}</> : 'Завантаження…'}
          </span>
        </div>

        <h3 className="showcase-sub">Дошки</h3>
        <div className="offer-row">
          {offer
            ? offer.themes.map((id) => {
                const t = themeById(id);
                const owned = profile.themes.includes(id);
                return (
                  <article key={id} className={`offer-card r-${priceTier(t.price)} ${owned ? 'owned' : ''}`}>
                    <ThemeSwatch theme={t} />
                    <b>{t.name}</b>
                    {owned ? ownedTag(profile.boardTheme === id) : priceButton(id, t.price, () => buyTheme(t))}
                  </article>
                );
              })
            : [0, 1, 2].map((i) => <div key={i} className="offer-card skeleton" />)}
        </div>

        <h3 className="showcase-sub">Ефекти взяття</h3>
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
            Куплене залишається назавжди. Змінити дошку чи ефект — у розділі <b>Колода → Стиль</b>.
          </span>
        </a>
      </div>

      <ShardStore />

      <div className="section-head">
        <h2>💎 Паки за осколки</h2>
        <span className="muted small">
          У вас <b className="shards-text">{profile.shards}</b> осколків
        </span>
      </div>
      <div className="shop-packs">
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
                  {def.cards} карток · {def.description}
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
        Осколки за одну повторку:{' '}
        {(Object.entries(SHARDS_PER_DUPE) as [Rarity, number][]).map(([r, n]) => `${RARITY_NAMES[r].toLowerCase()} ${n}`).join(' · ')}.
      </p>
      <p className="muted tiny legal-links">
        <a href="#/terms">Публічна оферта</a> · <a href="#/privacy">Конфіденційність</a>
      </p>
    </section>
  );
}
