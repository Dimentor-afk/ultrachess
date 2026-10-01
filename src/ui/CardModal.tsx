import { useEffect, type ReactNode } from 'react';
import { EFFECT_NAMES, PIECE_NAMES, RARITY_NAMES } from '../engine/cards';
import type { Card } from '../engine/types';
import { Emblem } from './art';
import { cardArt } from './cardArt';
import { CardClip } from './CardClip';
import { CARD_SPECS, SPEC_KINDS } from './cardSpec';
import { Icon } from './icons';

/** Clash-style card popup: the big card, its full rules and the actions for it. */
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
        <div className="card-modal-art">
          <span className="card-modal-glow" />
          {art && <img className="pixel" src={art} alt="" />}
          <span className="card-modal-emblem">
            <Emblem cardId={card.id} />
          </span>
          {locked && (
            <span className="gcard-lock">
              <Icon name="lock" />
            </span>
          )}
        </div>
        <div className="card-modal-body">
          <span className="card-type">{PIECE_NAMES[card.pieceType]}</span>
          <h2>{card.name}</h2>
          <span className={`rarity-tag r-${card.rarity}`}>
            <span className="gem" />
            {RARITY_NAMES[card.rarity]}
          </span>
          <CardClip cardId={card.id} />
          {spec ? (
            <>
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
              <details className="card-modal-full">
                <summary>Повний текст правила</summary>
                <p className="card-modal-rules">{card.rulesText}</p>
              </details>
            </>
          ) : (
            <p className="card-modal-rules">{card.rulesText}</p>
          )}
          <div className="gcard-effects">
            {card.effects.map((e) => (
              <span key={e} className="effect">
                {EFFECT_NAMES[e]}
              </span>
            ))}
          </div>
          {note && <p className="muted small">{note}</p>}
          {children && <div className="card-modal-actions">{children}</div>}
        </div>
      </div>
    </div>
  );
}
