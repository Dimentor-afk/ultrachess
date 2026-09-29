import { CARD_BY_ID, EFFECT_NAMES, PIECE_NAMES, RARITY_NAMES, getCard } from '../engine/cards';
import type { Card, Color, PieceType } from '../engine/types';
import type { ReactNode } from 'react';
import { Emblem, PieceSvg } from './art';
import { cardArt, pieceSprite } from './cardArt';
import { Icon } from './icons';

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
export function CardView({
  card,
  compact = false,
  locked = false,
  badge,
  color,
}: {
  card: Card;
  compact?: boolean;
  locked?: boolean;
  badge?: ReactNode;
  /** Show the sprite of this side, exactly as the piece looks on the board. */
  color?: Color;
}) {
  const sprite = color ? pieceSprite(card.id, card.pieceType, color) : null;
  const art = sprite ? sprite.src : cardArt(card.id);
  return (
    <article className={`gcard r-${card.rarity} ${compact ? 'gcard-compact' : ''} ${locked ? 'locked' : ''}`}>
      <div className="gcard-art">
        {!compact && (
          <span className="gcard-watermark">
            <Emblem cardId={card.id} />
          </span>
        )}
        {art ? (
          <img className={`gcard-pixel ${sprite?.tint ? 'tinted' : ''}`} src={art} alt="" loading="lazy" />
        ) : (
          <PieceSvg type={card.pieceType} color="w" className="gcard-piece" />
        )}
        <span className="gcard-emblem">
          <Emblem cardId={card.id} />
        </span>
        {locked && (
          <span className="gcard-lock">
            <Icon name="lock" />
          </span>
        )}
        {badge}
      </div>
      <div className="gcard-body">
        <span className="card-type">{PIECE_NAMES[card.pieceType]}</span>
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

/** Card art only (pixel art when available). */
export function CardArt({ cardId, className = '' }: { cardId: string; className?: string }) {
  const art = cardArt(cardId);
  const card = getCard(cardId);
  return art ? <img className={`pixel ${className}`} src={art} alt="" loading="lazy" /> : <PieceSvg type={card.pieceType} color="w" className={className} />;
}

export function cardName(id: string): string {
  return getCard(id).name;
}

/** Round avatar showing a card's pixel piece. */
export function Avatar({ card, size = 'md' }: { card: string; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  const art = cardArt(card) ?? cardArt('knight-classic');
  const rarity = CARD_BY_ID[card]?.rarity ?? 'common';
  return (
    <span className={`avatar avatar-art avatar-${size} r-${rarity}`}>
      <img className="pixel" src={art!} alt="" />
    </span>
  );
}
