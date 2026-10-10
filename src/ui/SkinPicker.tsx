import { useState } from 'react';
import { divisionByN } from '../economy/weekly';
import { skinsOfCard } from '../economy/skins';
import { CardArt } from './common';
import { Icon } from './icons';
import { errorText, useSession } from './state';
import { t, tr } from '../i18n';

/**
 * The looks of a card's piece: the plain one and its skins. Owned skins are put on with a tap (both
 * players see it on the board); the others show where they are won.
 */
export function SkinPicker({ cardId }: { cardId: string }) {
  const s = useSession();
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const skins = skinsOfCard(cardId);
  if (skins.length === 0) return null;
  const owned = new Set(s.profile.skins);
  const worn = s.profile.skinChoice[cardId] ?? null;

  const wear = async (skinId: string | null) => {
    setHint(null);
    if (busy || skinId === worn) return;
    setBusy(true);
    try {
      s.setProfile(await s.api.setSkin(cardId, skinId));
    } catch (e) {
      s.toast(errorText(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="cm-section skin-picker">
      <h3 className="cm-sub">
        {t('Скіни')}
        <span className="cm-sub-note">{t('бачать обидва гравці')}</span>
      </h3>
      <div className="skin-row" role="radiogroup" aria-label={t('Скіни')}>
        <button type="button" role="radio" aria-checked={worn === null} className={`skin-tile plain ${worn === null ? 'on' : ''}`} onClick={() => wear(null)} disabled={busy}>
          <span className="skin-tile-art">
            <CardArt cardId={cardId} />
          </span>
          <b>{t('Звичайний')}</b>
        </button>
        {skins.map((k) => {
          const have = owned.has(k.id);
          // The lowest division whose 12 wins give this skin: V gives the first, I all five.
          const from = divisionByN(6 - k.tier);
          return (
            <button
              key={k.id}
              type="button"
              role="radio"
              aria-checked={worn === k.id}
              className={`skin-tile t${k.tier} ${worn === k.id ? 'on' : ''} ${have ? '' : 'locked'}`}
              onClick={() => (have ? wear(k.id) : setHint(t('«{0}»: 12 перемог у Тижні слави, дивізіон {1} або вище.', tr(k.name), from.roman)))}
              disabled={busy}
              title={have ? tr(k.name) : t('Тиждень слави · дивізіон {0}', from.roman)}
            >
              <span className="skin-tile-art">
                <img src={k.art} alt="" />
                {!have && (
                  <span className="skin-lock">
                    <Icon name="lock" />
                  </span>
                )}
              </span>
              <b>{tr(k.name)}</b>
              {!have && <small>🔒 {from.roman}</small>}
            </button>
          );
        })}
      </div>
      {hint && (
        <p className="skin-hint">
          {hint}{' '}
          <a href="#/weekly">{t('До Тижня слави')}</a>
        </p>
      )}
    </section>
  );
}
