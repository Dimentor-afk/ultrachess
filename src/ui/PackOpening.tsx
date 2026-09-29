import { useEffect, useState } from 'react';
import type { OpenResult, PackView } from '../api/client';
import { CARD_BY_ID, RARITY_NAMES } from '../engine/cards';
import { packArt } from './cardArt';
import { CardView } from './common';
import { FxOnce } from './FxOnce';
import { play } from './settings';
import { errorText } from './state';

type Phase = 'idle' | 'opening' | 'burst' | 'reveal' | 'summary';

/**
 * Pack opening: tap the pack, it shakes and bursts, then the cards are
 * revealed one by one (best last), then a summary of the haul.
 */
export function PackOpening({
  pack,
  open,
  onClose,
  autoStart = false,
}: {
  pack: PackView;
  autoStart?: boolean;
  open: () => Promise<OpenResult>;
  onClose: (result: OpenResult | null) => void;
}) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [result, setResult] = useState<OpenResult | null>(null);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    if (phase !== 'idle') return;
    setPhase('opening');
    const minShake = new Promise((r) => setTimeout(r, 1100));
    try {
      const [res] = await Promise.all([open(), minShake]);
      setResult(res);
      setPhase('burst');
      play('pack');
      setTimeout(() => setPhase('reveal'), 650);
    } catch (e) {
      setError(errorText(e));
      setPhase('idle');
    }
  };

  // The starter pack opens on its own, after a short look at it.
  useEffect(() => {
    if (!autoStart) return;
    const t = setTimeout(() => void start(), 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (phase !== 'reveal') return;
    setFlipped(false);
    const t = setTimeout(() => setFlipped(true), 350);
    return () => clearTimeout(t);
  }, [phase, index]);

  const next = () => {
    if (!result) return;
    if (!flipped) return setFlipped(true);
    if (index + 1 < result.cards.length) setIndex(index + 1);
    else setPhase('summary');
  };

  const current = result?.cards[index];
  const card = current ? CARD_BY_ID[current.cardId] : null;

  useEffect(() => {
    if (!flipped || !card || phase !== 'reveal') return;
    const r = card.rarity;
    play(r === 'common' ? 'click' : r === 'rare' ? 'rare' : r === 'epic' ? 'epic' : 'legendary');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flipped, index]);

  return (
    <div className="opening" role="dialog" aria-label={`Відкриття: ${pack.name}`}>
      <div className={`opening-bg ${card && flipped && phase === 'reveal' ? `r-${card.rarity}` : ''}`} />
      {(phase === 'idle' || phase === 'opening' || phase === 'burst') && (
        <button className={`opening-pack ${phase}`} onClick={start} aria-label="Відкрити пак">
          <span className="opening-rays" />
          <img src={packArt(pack.type)} alt="" />
          {phase === 'idle' && <span className="opening-hint">Натисніть, щоб відкрити</span>}
          {phase === 'burst' && <span className="opening-flash" />}
          {phase === 'burst' && <FxOnce name="burst" width={520} />}
        </button>
      )}
      {phase === 'idle' && (
        <div className="opening-title">
          <h2>{pack.name}</h2>
          {error && <p className="error-text">{error}</p>}
          <button className="btn btn-ghost" onClick={() => onClose(null)}>
            Пізніше
          </button>
        </div>
      )}

      {phase === 'reveal' && result && card && (
        <div className="reveal" onClick={next}>
          <p className="reveal-count">
            {index + 1} / {result.cards.length}
          </p>
          <div className={`flip ${flipped ? 'flipped' : ''} r-${card.rarity}`}>
            <div className="flip-inner">
              <div className="flip-back">
                <span>♞</span>
              </div>
              <div className="flip-front">
                <CardView card={card} />
                {flipped && (card.rarity === 'legendary' || card.rarity === 'mythological') && (
                  <FxOnce key={index} name="sparkle" width={300} loop />
                )}
              </div>
            </div>
          </div>
          <div className={`reveal-tag ${flipped ? 'show' : ''}`}>
            <span className={`rarity-tag r-${card.rarity}`}>{RARITY_NAMES[card.rarity]}</span>
            {current!.isNew ? <span className="badge-new">НОВА!</span> : <span className="badge-dupe">повторка → 💎 +{current!.shards}</span>}
          </div>
          <p className="muted small">Натисніть, щоб продовжити</p>
        </div>
      )}

      {phase === 'summary' && result && (
        <div className="opening-summary">
          <h2>{pack.name}</h2>
          <div className="loot">
            <span className="loot-item gold">🪙 +{result.gold} золота</span>
            {result.shards > 0 && <span className="loot-item shards">💎 +{result.shards} осколків</span>}
          </div>
          <div className="summary-grid">
            {result.cards.map((c, i) => (
              <div key={i} className="summary-card">
                <CardView card={CARD_BY_ID[c.cardId]} />
                {c.isNew ? <span className="badge-new">НОВА!</span> : <span className="badge-dupe">💎 +{c.shards}</span>}
              </div>
            ))}
          </div>
          <button className="btn btn-primary btn-lg" onClick={() => onClose(result)}>
            Забрати
          </button>
        </div>
      )}
    </div>
  );
}
