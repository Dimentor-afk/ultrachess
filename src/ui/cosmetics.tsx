// Shared pieces of the shop and the deck page's style tab: board and effect
// previews, today's shop offer and the countdown to the next one.

import { useEffect, useState } from 'react';
import type { ShopOffer } from '../api/client';
import type { CaptureFx } from '../economy/captureFx';
import type { BoardTheme } from '../economy/themes';
import type { Rarity } from '../engine/types';
import { cardArt } from './cardArt';
import { FxOnce } from './FxOnce';
import type { FxName } from './fxSprites';
import { errorText, useSession } from './state';

/** A 4×4 corner of the board in the theme's colours, with two pieces on it. */
export function ThemeSwatch({ theme }: { theme: BoardTheme }) {
  return (
    <div className="theme-swatch" aria-hidden="true">
      {Array.from({ length: 16 }, (_, i) => (
        <span key={i} style={{ background: (i + Math.floor(i / 4)) % 2 ? theme.dark : theme.light }}>
          {i === 5 && <img className="pixel" src={cardArt('knight-classic')!} alt="" />}
          {i === 10 && <img className="pixel" src={cardArt('rook-classic')!} alt="" />}
        </span>
      ))}
    </div>
  );
}

/** The capture effect looping over a square of the player's own board. */
export function FxSwatch({ fx, width = 96 }: { fx: CaptureFx; width?: number }) {
  return (
    <div className="fx-preview" aria-hidden="true">
      <img className="pixel fx-victim" src={cardArt('pawn-classic')!} alt="" />
      <FxOnce name={fx.sprite as FxName} width={width} loop />
    </div>
  );
}

/** Frame colour by price, so dearer items look rarer. */
export function priceTier(price: number): Rarity {
  if (price <= 500) return 'common';
  if (price <= 1000) return 'rare';
  if (price <= 1500) return 'epic';
  return 'legendary';
}

/** Today's offer from the server; loads again by itself at the daily reset. */
export function useShopOffer(): ShopOffer | null {
  const s = useSession();
  const [offer, setOffer] = useState<ShopOffer | null>(null);
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = () =>
      s.api.shop().then(
        (o) => {
          if (!alive) return;
          setOffer(o);
          timer = setTimeout(load, Math.max(5_000, o.refreshAt - Date.now() + 2_000));
        },
        (e) => alive && s.toast(errorText(e), 'error'),
      );
    void load();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return offer;
}

/** "5 год 12 хв" until `at`, ticking every 20 seconds. */
export function useCountdown(at: number | null | undefined): string {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 20_000);
    return () => clearInterval(t);
  }, []);
  if (!at) return '';
  const min = Math.max(0, Math.ceil((at - now) / 60_000));
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (min <= 1) return 'менше хвилини';
  return h ? `${h} год ${m} хв` : `${m} хв`;
}
