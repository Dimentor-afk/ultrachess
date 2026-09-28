import { useMemo, useState } from 'react';
import { CARDS, PIECE_NAMES, PIECE_ORDER, RARITY_NAMES, RARITY_ORDER } from '../engine/cards';
import type { PieceType, Rarity } from '../engine/types';
import { CardView } from './common';

export function CatalogPage() {
  const [piece, setPiece] = useState<PieceType | 'all'>('all');
  const [rarity, setRarity] = useState<Rarity | 'all'>('all');

  const cards = useMemo(
    () =>
      CARDS.filter((c) => (piece === 'all' || c.pieceType === piece) && (rarity === 'all' || c.rarity === rarity)).sort(
        (a, b) =>
          PIECE_ORDER.indexOf(a.pieceType) - PIECE_ORDER.indexOf(b.pieceType) ||
          RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity),
      ),
    [piece, rarity],
  );

  return (
    <section className="page">
      <div className="page-head">
        <h1>Колекція карток</h1>
        <p className="muted">
          Усі {CARDS.length} карток відкриті. Кожна картка змінює хід або властивості фігури — базою лишаються
          шахові правила.
        </p>
      </div>

      <div className="filters">
        <div className="chip-row" role="group" aria-label="Фігура">
          <button className={`chip ${piece === 'all' ? 'on' : ''}`} onClick={() => setPiece('all')}>
            Усі фігури
          </button>
          {PIECE_ORDER.map((p) => (
            <button key={p} className={`chip ${piece === p ? 'on' : ''}`} onClick={() => setPiece(p)}>
              {PIECE_NAMES[p]}
            </button>
          ))}
        </div>
        <div className="chip-row" role="group" aria-label="Рідкість">
          <button className={`chip ${rarity === 'all' ? 'on' : ''}`} onClick={() => setRarity('all')}>
            Усі рідкості
          </button>
          {RARITY_ORDER.map((r) => (
            <button key={r} className={`chip chip-${r} ${rarity === r ? 'on' : ''}`} onClick={() => setRarity(r)}>
              {RARITY_NAMES[r]}
            </button>
          ))}
        </div>
        <p className="muted count">Показано: {cards.length}</p>
      </div>

      <div className="card-grid">
        {cards.map((c) => (
          <CardView key={c.id} card={c} />
        ))}
      </div>
    </section>
  );
}
