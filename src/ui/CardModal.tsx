import { Suspense, lazy, useEffect, type ReactNode } from 'react';
import { CLASSIC_CARD, EFFECT_NAMES, PIECE_NAMES, RARITY_NAMES } from '../engine/cards';
import type { Card } from '../engine/types';
import { Emblem } from './art';
import { cardArt } from './cardArt';
// The clip (scripts and their player) loads with the first opened card.
const CardClip = lazy(() => import('./CardClip').then((m) => ({ default: m.CardClip })));
import { CARD_SPECS, SPEC_KINDS } from './cardSpec';
import { Icon } from './icons';

const PIECE_ACC: Record<Card['pieceType'], string> = {
  pawn: 'звичайний пішак',
  knight: 'звичайний кінь',
  bishop: 'звичайний слон',
  rook: 'звичайна тура',
  queen: 'звичайний ферзь',
  king: 'звичайний король',
};

/** Clash-style card popup: the card, its trick in marked lines, a clip of it, and the actions. */
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
  const spec = CARD_SPECS[card.id];
  const classic = CLASSIC_CARD[card.pieceType] === card.id;
  return (
    <div className="modal-backdrop card-modal-backdrop" onClick={onClose}>
      <div
        className={`card-modal r-${card.rarity} ${locked ? 'locked' : ''}`}
        role="dialog"
        aria-label={card.name}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="icon-btn card-modal-close" onClick={onClose} aria-label="Закрити">
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
              {classic ? 'Як ходить' : 'Фішка'}
              {!classic && <span className="cm-sub-note">усе інше — як {PIECE_ACC[card.pieceType]}</span>}
            </h3>
            {spec ? (
              <ul className="card-spec">
                {spec.map(([kind, text], i) => (
                  <li key={i} className={`spec-${kind}`}>
                    <span className="spec-icon" title={SPEC_KINDS[kind].label} aria-label={SPEC_KINDS[kind].label}>
                      {SPEC_KINDS[kind].icon}
                    </span>
                    <span>{text}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="card-modal-rules">{card.rulesText}</p>
            )}
          </section>

          <section className="cm-section cm-clip">
            <h3 className="cm-sub">
              <span className="cm-play">▶</span> У грі
            </h3>
            <Suspense fallback={<div className="clip clip-loading" aria-hidden />}>
              <CardClip cardId={card.id} />
            </Suspense>
          </section>

          {spec && (
            <details className="card-modal-full">
              <summary>Повне правило</summary>
              <p className="card-modal-rules">{card.rulesText}</p>
            </details>
          )}
          {note && <p className="cm-note">{note}</p>}
          {children && <div className="card-modal-actions">{children}</div>}
        </div>
      </div>
    </div>
  );
}
