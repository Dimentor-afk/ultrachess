import { useEffect, useState } from 'react';
import type { OpenResult, PackView } from '../api/client';
import { CARD_BY_ID, RARITY_NAMES } from '../engine/cards';
import { packArt } from './cardArt';
import { CardView } from './common';
import { FxOnce } from './FxOnce';
import { getSettings, play, type Sound } from './settings';
import { errorText } from './state';
import type { Rarity } from '../engine/types';

type Phase = 'idle' | 'opening' | 'burst' | 'reveal' | 'summary';

/**
 * How a card is revealed: `in` (face down), `tease` (epic and up: the back
 * shakes and its glow climbs through the rarities), `spin`, `shown`.
 */
type Stage = 'in' | 'tease' | 'spin' | 'shown';

const TEASE_LADDER: Rarity[] = ['rare', 'epic', 'legendary', 'mythological'];
const TEASE_STEPS: Partial<Record<Rarity, number>> = { epic: 2, legendary: 3, mythological: 4 };
const TEASE_TEXT = ['Щось незвичайне…', 'Сильніше…', 'Ще сильніше…', 'Неймовірно!'];
const TEASE_STEP_MS = 650;
const SPIN_MS = 1000;

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
  const [stage, setStage] = useState<Stage>('in');
  const [step, setStep] = useState(0);
  const flipped = stage === 'shown';
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

  const current = result?.cards[index];
  const card = current ? CARD_BY_ID[current.cardId] : null;
  const teaseSteps = (card && getSettings().animations && TEASE_STEPS[card.rarity]) || 0;

  // Face down, then (for epic and up) a tease that escalates step by step,
  // a spin, and the reveal.
  useEffect(() => {
    if (phase !== 'reveal') return;
    setStage('in');
    setStep(0);
    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));
    if (!teaseSteps) {
      at(350, () => setStage('shown'));
    } else {
      at(350, () => setStage('tease'));
      for (let i = 0; i < teaseSteps; i++) {
        at(350 + i * TEASE_STEP_MS, () => {
          setStep(i);
          play(`tease${i}` as Sound);
        });
      }
      const spinAt = 350 + teaseSteps * TEASE_STEP_MS;
      at(spinAt, () => {
        setStage('spin');
        play('whoosh');
      });
      at(spinAt + SPIN_MS, () => setStage('shown'));
    }
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, index]);

  const next = () => {
    if (!result) return;
    if (!flipped) return setStage('shown');
    if (index + 1 < result.cards.length) setIndex(index + 1);
    else setPhase('summary');
  };

  useEffect(() => {
    if (!flipped || !card || phase !== 'reveal') return;
    const r = card.rarity;
    play(r === 'common' ? 'click' : r === 'rare' ? 'rare' : r === 'epic' ? 'epic' : r === 'legendary' ? 'legendary' : 'mythic');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flipped, index]);

  const teaseRarity = TEASE_LADDER[step];
  const bgRarity = phase !== 'reveal' || !card ? null : flipped ? card.rarity : stage === 'tease' || stage === 'spin' ? teaseRarity : null;
  const big = !!teaseSteps && flipped;

  return (
    <div
      className={`opening ${big && card!.rarity === 'mythological' ? 'opening-quake' : ''}`}
      role="dialog"
      aria-label={`Відкриття: ${pack.name}`}
    >
      <div className={`opening-bg ${bgRarity ? `r-${bgRarity}` : ''}`} />
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
          <div
            key={index}
            className={`flip ${flipped ? 'flipped' : ''} ${stage === 'tease' ? 'tease' : ''} ${stage === 'spin' || (flipped && teaseSteps) ? 'spun' : ''} ${stage === 'spin' ? 'spinning' : ''} r-${card.rarity}`}
            style={{ '--tease': `var(--r-${teaseRarity})`, '--amp': `${2 + step * 2}px` } as React.CSSProperties}
          >
            {(stage === 'tease' || stage === 'spin' || big) && (
              <span className={`reveal-rays ${big ? 'big' : ''}`} style={{ '--c': `var(--r-${big ? card.rarity : teaseRarity})` } as React.CSSProperties} />
            )}
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
            {big && (
              <span className="reveal-burst" aria-hidden="true">
                <FxOnce name={card.rarity === 'mythological' ? 'cap_epic' : 'burst'} width={card.rarity === 'epic' ? 420 : 560} />
              </span>
            )}
          </div>
          {big && <span className="reveal-flash" style={{ '--c': `var(--r-${card.rarity})` } as React.CSSProperties} />}
          {stage === 'tease' && (
            <p className="tease-text" key={step} style={{ color: `var(--r-${teaseRarity})` }}>
              {TEASE_TEXT[step]}
            </p>
          )}
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
