import { useState } from 'react';
import { CAPTURE_FX, captureFxById } from '../economy/captureFx';
import { BOARD_THEMES, themeById } from '../economy/themes';
import { CARD_BY_ID } from '../engine/cards';
import { cardAt } from '../engine/deck';
import { cardArt, pieceSprite } from './cardArt';
import { FxSwatch, ThemeSwatch, priceTier, useShopOffer } from './cosmetics';
import { FxOnce } from './FxOnce';
import type { FxName } from './fxSprites';
import { Icon } from './icons';
import { errorText, useSession } from './state';
import { t } from '../i18n';

const FILES = 'abcdefgh';

/**
 * The deck page's "Стиль" tab: put on any board or capture effect you own.
 * Tapping one you don't own tries it on the preview board and says whether
 * today's shop sells it.
 */
export function StylePanel() {
  const s = useSession();
  const p = s.profile;
  const offer = useShopOffer();
  const [busy, setBusy] = useState<string | null>(null);
  const [tryTheme, setTryTheme] = useState<string | null>(null);
  const [tryFx, setTryFx] = useState<string | null>(null);

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

  const pickTheme = (id: string) => {
    if (!p.themes.includes(id)) return setTryTheme(id === tryTheme ? null : id);
    setTryTheme(null);
    if (id !== p.boardTheme) void run(id, async () => s.setProfile(await s.api.setBoardTheme(id)));
  };
  const pickFx = (id: string) => {
    if (!p.ownedFx.includes(id)) return setTryFx(id === tryFx ? null : id);
    setTryFx(null);
    if (id !== p.captureFx) void run(id, async () => s.setProfile(await s.api.setCaptureFx(id)));
  };

  const theme = themeById(tryTheme ?? p.boardTheme);
  const fx = captureFxById(tryFx ?? p.captureFx);
  const deck = s.decks.find((d) => d.id === p.activeDeckId) ?? s.decks[0];
  const enemy = pieceSprite('pawn-classic', 'pawn', 'b', 'dark').src;

  // Ranks 4 to 1: an enemy pawn on d3 (the capture effect plays on it), the deck on ranks 1–2.
  const squares = [4, 3, 2, 1].flatMap((rank) =>
    [...FILES].map((file, f) => {
      const dark = (f + rank) % 2 === 1;
      const index = rank <= 2 ? (rank - 1) * 8 + f : -1;
      const card = deck && index >= 0 ? CARD_BY_ID[cardAt(deck, index)] : null;
      const art = card ? cardArt(card.id) : rank === 3 && f === 3 ? enemy : null;
      return (
        <span key={`${file}${rank}`} className="style-sq" style={{ background: dark ? theme.dark : theme.light }}>
          {art && <img className="pixel" src={art} alt="" />}
          {rank === 3 && f === 3 && <FxOnce key={fx.id} name={fx.sprite as FxName} width={80} loop />}
        </span>
      );
    }),
  );

  const trying = (tryTheme && { board: true, name: theme.name, price: theme.price, inShop: !!offer?.themes.includes(theme.id) }) ||
    (tryFx && { board: false, name: fx.name, price: fx.price, inShop: !!offer?.fx.includes(fx.id) }) ||
    null;

  const status = (active: boolean, owned: boolean, inShop: boolean, price: number) =>
    active ? (
      <span className="pill pill-ok">{t('у грі')}</span>
    ) : owned ? (
      <span className="pill">{t('поставити')}</span>
    ) : inShop ? (
      <span className="pill pill-shop" title={t('Сьогодні в магазині за {0} золота', price)}>
        {t('у продажу')}
      </span>
    ) : (
      <span className="pill pill-locked">
        <Icon name="lock" /> 🪙 {price}
      </span>
    );

  return (
    <div className="style-page">
      <div className="style-top">
        <div className={`style-board ${trying ? 'trying' : ''}`} aria-label={t('Дошка «{0}», ефект «{1}»', theme.name, fx.name)}>
          {squares}
        </div>
        <div className="style-summary panel">
          <span className="eyebrow">{trying ? t('Примірка') : t('Зараз у грі')}</span>
          <dl>
            <dt>{t('Дошка')}</dt>
            <dd>{theme.name}</dd>
            <dt>{t('Ефект взяття')}</dt>
            <dd>{fx.name}</dd>
          </dl>
          {trying ? (
            <>
              <p className="small">
                {trying.board ? t('Дошка «{0}» ще не ваша.', trying.name) : t('Ефект «{0}» ще не ваш.', trying.name)}{' '}
                {trying.inShop ? (
                  <>
                    <a href="#/shop">{t('Сьогодні є в магазині за 🪙 {0}.', trying.price)}</a>
                  </>
                ) : (
                  t('Зараз не продається — чекайте в щоденній вітрині магазину.')
                )}
              </p>
              <button
                className="btn btn-sm"
                onClick={() => {
                  setTryTheme(null);
                  setTryFx(null);
                }}
              >
                {t('Скасувати примірку')}
              </button>
            </>
          ) : null}
          <a className="btn btn-sm btn-primary" href="#/shop">
            <Icon name="shop" /> {t('Щоденна вітрина')}
          </a>
        </div>
      </div>

      <div className="section-head">
        <h2>{t('Дошки')}</h2>
        <span className="muted small">
          {t('ваших {0} з {1}', p.themes.length, BOARD_THEMES.length)}
        </span>
      </div>
      <div className="style-grid">
        {BOARD_THEMES.map((t) => {
          const owned = p.themes.includes(t.id);
          const active = p.boardTheme === t.id;
          return (
            <button
              key={t.id}
              className={`style-item r-${priceTier(t.price)} ${active ? 'on' : ''} ${owned ? '' : 'locked'} ${tryTheme === t.id ? 'trying' : ''}`}
              disabled={busy === t.id}
              onClick={() => pickTheme(t.id)}
              aria-pressed={active}
            >
              <ThemeSwatch theme={t} />
              <b>{t.name}</b>
              {status(active, owned, !!offer?.themes.includes(t.id), t.price)}
            </button>
          );
        })}
      </div>

      <div className="section-head">
        <h2>{t('Ефекти взяття')}</h2>
        <span className="muted small">
          {t('ваших {0} з {1}', p.ownedFx.length, CAPTURE_FX.length)}
        </span>
      </div>
      <div className="style-grid">
        {CAPTURE_FX.map((f) => {
          const owned = p.ownedFx.includes(f.id);
          const active = p.captureFx === f.id;
          return (
            <button
              key={f.id}
              className={`style-item r-${priceTier(f.price)} ${active ? 'on' : ''} ${owned ? '' : 'locked'} ${tryFx === f.id ? 'trying' : ''}`}
              disabled={busy === f.id}
              onClick={() => pickFx(f.id)}
              aria-pressed={active}
            >
              <FxSwatch fx={f} width={80} />
              <b>{f.name}</b>
              {status(active, owned, !!offer?.fx.includes(f.id), f.price)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
