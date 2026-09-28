import { EFFECT_NAMES, PIECE_NAMES, RARITY_NAMES, getCard } from '../engine/cards';
import type { Card, Color, PieceType } from '../engine/types';

const GLYPH: Record<PieceType, string> = {
  king: '♚',
  queen: '♛',
  rook: '♜',
  bishop: '♝',
  knight: '♞',
  pawn: '♟',
};

/** Solid chess glyph; U+FE0E keeps mobile browsers from drawing emoji. */
export function Glyph({ type, color, className = '' }: { type: PieceType; color: Color; className?: string }) {
  return (
    <span className={`glyph glyph-${color} ${className}`} aria-hidden="true">
      {GLYPH[type]}
      {'︎'}
    </span>
  );
}

export function RarityTag({ card }: { card: Card }) {
  return <span className={`rarity-tag r-${card.rarity}`}>{RARITY_NAMES[card.rarity]}</span>;
}

export function CardView({ card, compact = false }: { card: Card; compact?: boolean }) {
  return (
    <article className={`card r-border-${card.rarity} ${compact ? 'card-compact' : ''}`}>
      <header className="card-head">
        <Glyph type={card.pieceType} color="b" className="card-glyph" />
        <div>
          <h3 className="card-name">{card.name}</h3>
          <div className="card-meta">
            <span className="muted">{PIECE_NAMES[card.pieceType]}</span>
            <RarityTag card={card} />
          </div>
        </div>
      </header>
      <p className="card-rules">{card.rulesText}</p>
      {!compact && (
        <footer className="card-effects">
          {card.effects.map((e) => (
            <span key={e} className={`effect effect-${e}`}>
              {EFFECT_NAMES[e]}
            </span>
          ))}
        </footer>
      )}
    </article>
  );
}

export function cardName(id: string): string {
  return getCard(id).name;
}
