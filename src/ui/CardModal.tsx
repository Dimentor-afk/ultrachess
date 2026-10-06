import { Suspense, lazy, useEffect, type ReactNode } from 'react';
import { CLASSIC_CARD, EFFECT_NAMES, PIECE_NAMES, RARITY_NAMES } from '../engine/cards';
import type { Card } from '../engine/types';
import { Emblem } from './art';
import { cardArt } from './cardArt';
// The clip (scripts and their player) loads with the first opened card.
const CardClip = lazy(() => import('./CardClip').then((m) => ({ default: m.CardClip })));
import { Icon } from './icons';
import { t } from '../i18n';

const PIECE_ACC: Record<Card['pieceType'], string> = {
  pawn: t('звичайний пішак'),
  knight: t('звичайний кінь'),
  bishop: t('звичайний слон'),
  rook: t('звичайна тура'),
  queen: t('звичайний ферзь'),
  king: t('звичайний король'),
};

/** Clash-style card popup: the card, its rules, a clip of it, and the actions. */
export function CardModal({
  card,
  locked = false,
  note,
  onClose,
  children,
}: {
  card: Card;
  locked?: boolean;
  note?: ReactNode;
  onClose: () => void;
  children?: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const art = cardArt(card.id);
  const classic = CLASSIC_CARD[card.pieceType] === card.id;
  return (
    <div className="modal-backdrop card-modal-backdrop" onClick={onClose}>
      <div
        className={`card-modal r-${card.rarity} ${locked ? 'locked' : ''}`}
        role="dialog"
        aria-label={card.name}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="icon-btn card-modal-close" onClick={onClose} aria-label={t('Закрити')}>
          ✕
        </button>
        <header className="cm-head">
          <div className="cm-art">
            <span className="card-modal-glow" />
            {art && <img className="pixel" src={art} alt="" />}
            {locked && (
              <span className="gcard-lock">
                <Icon name="lock" />
              </span>
            )}
          </div>
          <div className="cm-title">
            <span className="cm-kind">
              <span className="cm-emblem">
                <Emblem cardId={card.id} />
              </span>
              {PIECE_NAMES[card.pieceType]}
            </span>
            <h2>{card.name}</h2>
            <div className="cm-tags">
              <span className={`rarity-tag r-${card.rarity}`}>
                <span className="gem" />
                {RARITY_NAMES[card.rarity]}
              </span>
              {card.effects
                .filter((e) => e !== 'permanent')
                .map((e) => (
                  <span key={e} className={`cm-effect fx-${e}`}>
                    {EFFECT_NAMES[e]}
                  </span>
                ))}
            </div>
          </div>
        </header>

        <div className="card-modal-body">
          <section className="cm-section">
            <h3 className="cm-sub">
              {classic ? t('Як ходить') : t('Фішка')}
              {!classic && <span className="cm-sub-note">{t('усе інше як {0}', PIECE_ACC[card.pieceType])}</span>}
            </h3>
            <p className="card-modal-rules">{card.rulesText}</p>
          </section>

          <section className="cm-section cm-clip">
            <h3 className="cm-sub">
              <span className="cm-play">▶</span> {t('У грі')}
            </h3>
            <Suspense fallback={<div className="clip clip-loading" aria-hidden />}>
              <CardClip cardId={card.id} />
            </Suspense>
          </section>

          {note && <p className="cm-note">{note}</p>}
          {children && <div className="card-modal-actions">{children}</div>}
        </div>
      </div>
    </div>
  );
}
