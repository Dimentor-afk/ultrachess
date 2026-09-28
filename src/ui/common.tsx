import { EFFECT_NAMES, PIECE_NAMES, RARITY_NAMES, getCard } from '../engine/cards';
import type { Card, Color, PieceType } from '../engine/types';
import { Emblem, PieceSvg } from './art';

/** Inline piece icon sized to the surrounding text. */
export function Glyph({ type, color, className = '' }: { type: PieceType; color: Color; className?: string }) {
  return <PieceSvg type={type} color={color} className={`glyph ${className}`} />;
}

export function RarityTag({ card }: { card: Card }) {
  return (
    <span className={`rarity-tag r-${card.rarity}`}>
      <span className="gem" />
      {RARITY_NAMES[card.rarity]}
    </span>
  );
}

/** Game card: rarity frame, piece art with the card's emblem, rules text. */
export function CardView({ card, compact = false }: { card: Card; compact?: boolean }) {
  return (
    <article className={`gcard r-${card.rarity} ${compact ? 'gcard-compact' : ''}`}>
      <div className="gcard-art">
        {!compact && (
          <span className="gcard-watermark">
            <Emblem cardId={card.id} />
          </span>
        )}
        <PieceSvg type={card.pieceType} color="w" className="gcard-piece" />
        <span className="gcard-emblem">
          <Emblem cardId={card.id} />
        </span>
        {!compact && <span className="gcard-type">{PIECE_NAMES[card.pieceType]}</span>}
      </div>
      <div className="gcard-body">
        <h3 className="gcard-name">{card.name}</h3>
        <RarityTag card={card} />
        <p className="gcard-rules">{card.rulesText}</p>
        {!compact && (
          <footer className="gcard-effects">
            {card.effects.map((e) => (
              <span key={e} className="effect">
                {EFFECT_NAMES[e]}
              </span>
            ))}
          </footer>
        )}
      </div>
    </article>
  );
}

export function cardName(id: string): string {
  return getCard(id).name;
}
