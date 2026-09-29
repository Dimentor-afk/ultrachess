import { useState } from 'react';
import { PACKS, PACK_SHARD_PRICE, SHARDS_PER_DUPE, type PackType } from '../economy/packs';
import { BOARD_THEMES, type BoardTheme } from '../economy/themes';
import { RARITY_NAMES } from '../engine/cards';
import type { Rarity } from '../engine/types';
import { packArt } from './cardArt';
import { CAPTURE_FX } from '../economy/captureFx';
import { FxOnce } from './FxOnce';
import type { FxName } from './fxSprites';
import { errorText, useSession } from './state';

type ShopPack = Exclude<PackType, 'starter'>;

/** Packs for shards, board colours for gold. */
export function ShopPage() {
  const s = useSession();
  const { profile } = s;
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
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

  const theme = (t: BoardTheme) =>
    run(t.id, async () => {
      if (profile.themes.includes(t.id)) {
        s.setProfile(await s.api.setBoardTheme(t.id));
      } else {
        s.setProfile(await s.api.buyTheme(t.id));
        s.toast(`Дошка «${t.name}» ваша!`);
      }
    });

  const fx = (id: string, owned: boolean) =>
    run(id, async () => {
      s.setProfile(owned ? await s.api.setCaptureFx(id) : await s.api.buyCaptureFx(id));
      if (!owned) s.toast('Новий ефект взяття — побачите його в наступному бою!');
    });

  return (
    <section className="page shop">
      <div className="page-head">
        <h1>Магазин</h1>
        <p className="muted">
          Повторки карт автоматично стають осколками 💎, а за них тут купуються паки. Золото 🪙 випадає з паків і дається за перемоги — за
          нього купуються нові кольори дошки.
        </p>
      </div>

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
              <b>{def.name}</b>
              <span className="muted tiny">
                {def.cards} карток · {def.description}
              </span>
              <div className="bar small-bar" aria-hidden="true">
                <span style={{ width: `${Math.min(100, (profile.shards / price) * 100)}%` }} />
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

      <div className="section-head">
        <h2>💥 Ефекти взяття</h2>
        <span className="muted small">Грають, коли ваша фігура б'є — і в іграх з друзями їх бачить суперник</span>
      </div>
      <div className="shop-fx">
        {CAPTURE_FX.map((f) => {
          const owned = profile.ownedFx.includes(f.id);
          const active = profile.captureFx === f.id;
          return (
            <article key={f.id} className={`shop-fx-card ${active ? 'active' : ''}`}>
              <div className="fx-preview" aria-hidden="true">
                <FxOnce name={f.sprite as FxName} width={96} loop />
              </div>
              <b>{f.name}</b>
              {active ? (
                <span className="pill pill-ok">вибрано</span>
              ) : owned ? (
                <button className="btn btn-sm" disabled={busy === f.id} onClick={() => fx(f.id, true)}>
                  Вибрати
                </button>
              ) : (
                <button className="btn btn-sm btn-primary btn-price" disabled={profile.gold < f.price || busy === f.id} onClick={() => fx(f.id, false)}>
                  🪙 {f.price}
                </button>
              )}
            </article>
          );
        })}
      </div>

      <div className="section-head">
        <h2>🪙 Дошки за золото</h2>
        <span className="muted small">
          У вас <b className="gold">{profile.gold}</b> золота
        </span>
      </div>
      <div className="shop-themes">
        {BOARD_THEMES.map((t) => {
          const owned = profile.themes.includes(t.id);
          const active = profile.boardTheme === t.id;
          return (
            <article key={t.id} className={`shop-theme ${active ? 'active' : ''}`}>
              <div className="theme-preview" aria-hidden="true">
                {Array.from({ length: 16 }, (_, i) => (
                  <span key={i} style={{ background: (i + Math.floor(i / 4)) % 2 ? t.dark : t.light }} />
                ))}
              </div>
              <b>{t.name}</b>
              {active ? (
                <span className="pill pill-ok">на дошці</span>
              ) : owned ? (
                <button className="btn btn-sm" disabled={busy === t.id} onClick={() => theme(t)}>
                  Поставити
                </button>
              ) : (
                <button className="btn btn-sm btn-primary btn-price" disabled={profile.gold < t.price || busy === t.id} onClick={() => theme(t)}>
                  🪙 {t.price}
                </button>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
