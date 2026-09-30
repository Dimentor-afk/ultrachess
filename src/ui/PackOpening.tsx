import { useEffect, useRef, useState } from 'react';
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
 * How a card is revealed. Common and rare: `in` (face down) then `shown`.
 * Epic and up climb a rarity ladder first: `hush` (the room dims, the card
 * floats), `tease` (one pip of the ladder lights per step), `charge` (a held
 * breath before the flip), `spin`, `shown`.
 */
type Stage = 'in' | 'hush' | 'tease' | 'charge' | 'spin' | 'shown';

const TEASE_LADDER: Rarity[] = ['rare', 'epic', 'legendary', 'mythological'];
const TEASE_STEPS: Partial<Record<Rarity, number>> = { epic: 2, legendary: 3, mythological: 4 };
const TEASE_TEXT = ['Щось незвичайне…', 'Епічна?..', 'Легендарна?!', 'МІФОЛОГІЧНА?!'];
// Timeline of a teased card, ms. The gap after a pip is the same whether
// another pip follows or the flip does, so you never know until it happens.
const LAND_MS = 450;
const HUSH_MS = 800;
const STEP_MS = 1100;
const CHARGE_MS = 850;
/** The flip turns 540° in 900 ms (see .flip.spun); the reveal flash fires as the card turns edge-on (~470 ms) and the face comes round under it. */
const FACE_MS = 470;

/** Sparks around a teased card: fixed pseudo-random spread, so renders are stable. */
const EMBERS = Array.from({ length: 14 }, (_, i) => ({
  '--x': `${((i * 37) % 100) - 50}%`,
  '--drift': `${((i * 53) % 60) - 30}px`,
  '--d': `${((i * 0.37) % 2.4).toFixed(2)}s`,
  '--d2': `${((i % 7) * 0.1).toFixed(2)}s`,
  '--s': `${(1.9 + ((i * 0.23) % 1.3)).toFixed(2)}s`,
  '--z': `${3 + ((i * 7) % 4)}px`,
  '--a': `${i * 18}deg`,
}));

/**
 * Pack opening: tap the pack, it shakes and bursts, then the cards are
 * revealed one by one (best last), then a summary of the haul.
 */
export function PackOpening({
  pack,
  open,
  onClose,
}: {
  pack: PackView;
  open: () => Promise<OpenResult>;
  onClose: (result: OpenResult | null) => void;
}) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [result, setResult] = useState<OpenResult | null>(null);
  const [index, setIndex] = useState(0);
  // Stage and step belong to one card: a new card never starts with the last
  // one's "shown" (it would pop up face-up for a frame or flip backwards).
  const [staged, setStaged] = useState<{ index: number; stage: Stage; step: number }>({ index: 0, stage: 'in', step: -1 });
  const stage: Stage = staged.index === index ? staged.stage : 'in';
  const step = staged.index === index ? staged.step : -1;
  const flipped = stage === 'shown';
  const [error, setError] = useState<string | null>(null);
  const timeline = useRef<ReturnType<typeof setTimeout>[]>([]);

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

  const current = result?.cards[index];
  const card = current ? CARD_BY_ID[current.cardId] : null;
  const motion = getSettings().animations && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const teaseSteps = (card && motion && TEASE_STEPS[card.rarity]) || 0;

  // Face down; for epic and up the ladder climbs pip by pip, then a held
  // breath, one flip and the reveal.
  useEffect(() => {
    if (phase !== 'reveal') return;
    const card = index;
    const set = (stage: Stage, step?: number) =>
      setStaged((p) => ({ index: card, stage, step: step ?? (p.index === card ? p.step : -1) }));
    const timers: ReturnType<typeof setTimeout>[] = (timeline.current = []);
    const at = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));
    if (!teaseSteps) {
      // Lands face down (0.35 s), then turns over.
      at(420, () => set('shown'));
    } else {
      at(LAND_MS, () => set('hush'));
      let t = LAND_MS + HUSH_MS;
      for (let i = 0; i < teaseSteps; i++) {
        at(t, () => {
          set('tease', i);
          play(`tease${i}` as Sound);
        });
        t += STEP_MS;
      }
      at(t, () => {
        set('charge');
        play('riser');
      });
      t += CHARGE_MS;
      at(t, () => {
        set('spin');
        play('whoosh');
      });
      at(t + FACE_MS, () => set('shown'));
    }
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, index]);

  const next = () => {
    if (!result) return;
    if (!flipped) {
      // Skip: drop the rest of the timeline, or it would pull the card back into the tease.
      timeline.current.forEach(clearTimeout);
      return setStaged({ index, stage: 'shown', step });
    }
    if (index + 1 < result.cards.length) setIndex(index + 1);
    else setPhase('summary');
  };

  useEffect(() => {
    if (!flipped || !card || phase !== 'reveal') return;
    const r = card.rarity;
    play(r === 'common' ? 'click' : r === 'rare' ? 'rare' : r === 'epic' ? 'epic' : r === 'legendary' ? 'legendary' : 'mythic');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flipped, index]);

  const teaseRarity = step >= 0 ? TEASE_LADDER[step] : null;
  const teasing = !flipped && !!teaseSteps && stage !== 'in';
  const big = !!teaseSteps && flipped;
  // Colour of the room: the ladder while teasing, the card's own once shown.
  const tint = phase !== 'reveal' || !card ? null : flipped ? (card.rarity === 'common' ? null : card.rarity) : teaseRarity;
  const tone = (r: Rarity | null) => (r ? `var(--r-${r})` : 'var(--gold)');
  const amp = stage === 'charge' ? 3.2 : stage === 'tease' ? 0.4 + step * 0.7 : 0;
  const glow = stage === 'charge' || stage === 'spin' ? 46 : stage === 'tease' ? 12 + step * 9 : 6;
  const embers = stage === 'charge' ? EMBERS.length : stage === 'tease' ? 8 + step * 4 : 5;
  const lit = flipped ? teaseSteps - 1 : step;

  return (
    <div
      className={`opening ${big && card!.rarity === 'mythological' ? 'opening-quake' : ''}`}
      role="dialog"
      aria-label={`Відкриття: ${pack.name}`}
    >
      <div className="opening-bg" />
      {/* One glow layer per rarity, cross-faded by opacity (cheap for the GPU). */}
      <div className="opening-glows" aria-hidden="true">
        {TEASE_LADDER.map((r) => (
          <span key={r} className={`r-${r}`} style={{ opacity: tint === r ? (big ? 0.75 : teasing ? 0.4 + Math.max(step, 0) * 0.08 : 0.45) : 0 }} />
        ))}
      </div>
      <div className={`opening-vignette ${teasing ? `v-${stage}` : ''}`} />
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
          <button
            className="btn btn-ghost btn-sm reveal-skip-all"
            onClick={(e) => {
              e.stopPropagation();
              timeline.current.forEach(clearTimeout);
              setPhase('summary');
            }}
          >
            Усі картки ⏭
          </button>
          <p className="reveal-count">
            {index + 1} / {result.cards.length}
          </p>
          <div
            key={index}
            className={`flip stage-${stage} thump-${Math.max(step, 0) % 2} ${flipped ? 'flipped' : ''} ${
              teaseSteps && (stage === 'spin' || flipped) ? 'spun' : ''
            } r-${card.rarity}`}
            style={{ '--tease': tone(teaseRarity), '--amp': `${amp}px`, '--glow': `${glow}px` } as React.CSSProperties}
          >
            {((teasing && stage !== 'hush') || big) && (
              <span className={`reveal-rays ${big ? 'big' : ''}`} style={{ '--c': tone(big ? card.rarity : teaseRarity) } as React.CSSProperties} />
            )}
            {teasing && stage !== 'spin' && (
              <span className={`embers ${stage === 'charge' ? 'converge' : ''}`} style={{ '--c': tone(teaseRarity) } as React.CSSProperties}>
                {EMBERS.slice(0, embers).map((e, i) => (
                  <i key={i} style={e as React.CSSProperties} />
                ))}
              </span>
            )}
            {stage === 'tease' && <span key={`shock-${step}`} className="shock" style={{ '--c': tone(teaseRarity) } as React.CSSProperties} />}
            {(teasing || (flipped && card.rarity !== 'common')) && (
              <span className="flip-glow" style={{ '--c': tone(flipped ? card.rarity : teaseRarity) } as React.CSSProperties} />
            )}
            <div className="flip-inner">
              <div className="flip-back">
                <span>♞</span>
              </div>
              <div className="flip-front">
                <CardView card={card} />
                {big && (
                  <span className="shine" aria-hidden="true">
                    <i />
                  </span>
                )}
                {flipped && (card.rarity === 'legendary' || card.rarity === 'mythological') && (
                  <FxOnce key={index} name="sparkle" width={300} loop />
                )}
              </div>
            </div>
            {flipped && card.rarity !== 'common' && (
              <>
                <span className="shock shock-big" style={{ '--c': tone(card.rarity) } as React.CSSProperties} />
                {big && <span className="shock shock-big late" style={{ '--c': tone(card.rarity) } as React.CSSProperties} />}
              </>
            )}
            {big && (
              <span className="reveal-burst" aria-hidden="true">
                <FxOnce name={card.rarity === 'mythological' ? 'cap_epic' : 'burst'} width={card.rarity === 'epic' ? 420 : 560} />
              </span>
            )}
          </div>
          {big && <span className="reveal-flash" style={{ '--c': tone(card.rarity) } as React.CSSProperties} />}
          {big && card.rarity !== 'epic' && (
            <span className="reveal-fireworks" aria-hidden="true">
              <FxOnce name="win" width={200} />
              <FxOnce name="win" width={170} />
              <FxOnce name="win" width={230} />
            </span>
          )}
          {teaseSteps > 0 && (
            <div className="tease-pips" aria-hidden="true">
              {TEASE_LADDER.map((r, i) => (
                <span key={r} className={`pip r-${r} ${i <= lit ? 'lit' : ''} ${i === lit && !flipped ? 'top' : ''}`} />
              ))}
            </div>
          )}
          {/* One slot for the teaser line and the result, so nothing jumps. */}
          <div className="reveal-caption">
            {flipped ? (
              <div className="reveal-tag show">
                <span className={`rarity-tag r-${card.rarity}`}>{RARITY_NAMES[card.rarity]}</span>
                {current!.isNew ? <span className="badge-new">НОВА!</span> : <span className="badge-dupe">повторка → 💎 +{current!.shards}</span>}
              </div>
            ) : stage === 'tease' ? (
              <p className="tease-text" key={step} style={{ color: tone(teaseRarity) }}>
                {TEASE_TEXT[step]}
              </p>
            ) : null}
          </div>
          <p className="muted small">{teasing ? 'Натисніть, щоб одразу відкрити' : 'Натисніть, щоб продовжити'}</p>
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
