import { useMemo, useState } from 'react';
import { EXCHANGE, packName } from '../economy/packs';
import { CARDS, CARD_BY_ID, PIECE_NAMES, PIECE_ORDER, RARITY_NAMES, RARITY_ORDER } from '../engine/cards';
import type { PieceType, Rarity } from '../engine/types';
import { packArt } from './cardArt';
import { CardArt, CardView } from './common';
import { Icon } from './icons';
import { errorText, useSession } from './state';

export function CollectionPage() {
  const s = useSession();
  const owned = s.collection.owned;
  const [piece, setPiece] = useState<PieceType | 'all'>('all');
  const [rarity, setRarity] = useState<Rarity | 'all'>('all');
  const [onlyOwned, setOnlyOwned] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const cards = useMemo(
    () =>
      CARDS.filter(
        (c) => (piece === 'all' || c.pieceType === piece) && (rarity === 'all' || c.rarity === rarity) && (!onlyOwned || owned[c.id]),
      ).sort(
        (a, b) =>
          Number(!owned[a.id]) - Number(!owned[b.id]) ||
          PIECE_ORDER.indexOf(a.pieceType) - PIECE_ORDER.indexOf(b.pieceType) ||
          RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity),
      ),
    [piece, rarity, onlyOwned, owned],
  );
  const ownedCount = Object.keys(owned).length;
  const dupes = Object.entries(owned)
    .filter(([, v]) => v.dupes > 0)
    .map(([id, v]) => ({ card: CARD_BY_ID[id], dupes: v.dupes }))
    .sort((a, b) => RARITY_ORDER.indexOf(b.card.rarity) - RARITY_ORDER.indexOf(a.card.rarity));

  const exchange = async (cardId: string) => {
    setBusy(cardId);
    try {
      const pack = await s.api.exchange(cardId);
      await s.refresh();
      s.toast(`Обмін виконано: ${pack.name} чекає на головній.`);
    } catch (e) {
      s.toast(errorText(e), 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="page">
      <div className="page-head page-head-row">
        <div>
          <h1>Колекція</h1>
          <p className="muted">
            Зібрано <b className="gold">{ownedCount}</b> з {CARDS.length} карток. Картки під замком випадають з паків.
          </p>
        </div>
        <div className="collect-bar" aria-label={`Зібрано ${ownedCount} з ${CARDS.length}`}>
          <span style={{ width: `${(ownedCount / CARDS.length) * 100}%` }} />
        </div>
      </div>

      <div className="panel dupes-chest">
        <div className="section-head">
          <h2>
            <Icon name="swap" /> Скриня повторок
          </h2>
          <span className="muted small">
            {Object.entries(EXCHANGE)
              .map(([r, x]) => `${x.need} × ${RARITY_NAMES[r as Rarity].toLowerCase()} → ${packName(x.pack).toLowerCase()}`)
              .join(' · ')}
          </span>
        </div>
        {dupes.length === 0 ? (
          <p className="muted small">Повторок поки немає. Коли з паку випаде картка, яка вже є, вона ляже сюди.</p>
        ) : (
          <div className="dupes">
            {dupes.map(({ card, dupes: n }) => {
              const rule = EXCHANGE[card.rarity];
              const ready = n >= rule.need;
              return (
                <div key={card.id} className={`dupe r-${card.rarity} ${ready ? 'ready' : ''}`}>
                  <CardArt cardId={card.id} className="dupe-art" />
                  <div className="dupe-info">
                    <b>{card.name}</b>
                    <div className="bar small-bar">
                      <span style={{ width: `${Math.min(100, (n / rule.need) * 100)}%` }} />
                    </div>
                    <span className="muted tiny">
                      {n} / {rule.need}
                    </span>
                  </div>
                  <button className="btn btn-sm btn-primary" disabled={!ready || busy === card.id} onClick={() => exchange(card.id)}>
                    <img className="btn-pack" src={packArt(rule.pack)} alt="" /> Обміняти
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="filters">
        <div className="chip-row" role="group" aria-label="Фігура">
          <button className={`chip ${piece === 'all' ? 'on' : ''}`} onClick={() => setPiece('all')}>
            Усі
          </button>
          {PIECE_ORDER.map((p) => (
            <button key={p} className={`chip ${piece === p ? 'on' : ''}`} onClick={() => setPiece(p)}>
              {PIECE_NAMES[p]}
            </button>
          ))}
          <label className="chip toggle">
            <input type="checkbox" checked={onlyOwned} onChange={(e) => setOnlyOwned(e.target.checked)} /> Лише мої
          </label>
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
      </div>

      <div className="card-grid">
        {cards.map((c) => (
          <CardView
            key={c.id}
            card={c}
            locked={!owned[c.id]}
            badge={owned[c.id]?.dupes ? <span className="dupe-badge">+{owned[c.id].dupes}</span> : undefined}
          />
        ))}
      </div>
    </section>
  );
}
