// A 9:16 promo video for TikTok/Reels, recorded by scripts/promo/record.mjs.
// Dev server only: http://localhost:5173/scripts/promo/?cuts=rook-earthquake:...|queen-immortal:...
// Timeline: the intro line → for each card, the card up close with its hook, then
// its clip (the same one as in the card window), cut short → the end card.
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { loadLang } from '../../src/i18n';
import { localizeData } from '../../src/i18n/data';
import '../../src/ui/styles.css';
import './promo.css';

const q = new URLSearchParams(location.search);
/**
 * The cut: card ids with their hooks, "id:hook|id:hook:ms"; *word* is drawn in gold.
 * The intro line opens the video, the end card closes it.
 */
const CUTS = (q.get('cuts') ?? 'rook-earthquake:This rook causes an *earthquake*|queen-immortal:This queen *can\'t die*')
  .split('|')
  .map((c) => {
    // "id:hook" or "id:hook:ms" (the clip cut to its first ms).
    const [id, hook, ms] = c.split(':');
    return { id, hook, ms: ms ? Number(ms) : null };
  });
const INTRO = q.get('intro') ?? 'Chess, but every piece has a *superpower*';
const lang = (q.get('lang') ?? 'en') as 'en';
const zoom = q.get('zoom');
if (zoom) document.documentElement.style.zoom = zoom;

const INTRO_MS = 1600;
const CLOSEUP_MS = 1100;
/** The clip of each card, cut short if it is long. */
const CLIP_MAX_MS = 15000;
const END_MS = 3200;

function gold(text: string) {
  return text.split('*').map((part, i) => (i % 2 ? <b key={i}>{part}</b> : part));
}

async function main() {
  await loadLang(lang);
  localizeData();
  const [{ getCard, RARITY_NAMES }, { cardArt }, { CardClip }, { buildClip }] = await Promise.all([
    import('../../src/engine/cards'),
    import('../../src/ui/cardArt'),
    import('../../src/ui/CardClip'),
    import('../../src/ui/cardDemo'),
  ]);

  /** Every step of the video with its length. */
  type Step = { kind: 'intro' } | { kind: 'closeup' | 'clip'; cut: number } | { kind: 'end' };
  const steps: [Step, number][] = [[{ kind: 'intro' }, INTRO_MS]];
  CUTS.forEach((c, cut) => {
    const clip = buildClip(c.id);
    const ms = clip ? clip.scenes.reduce((s, x) => s + x.ms, 0) : 4000;
    steps.push([{ kind: 'closeup', cut }, CLOSEUP_MS], [{ kind: 'clip', cut }, Math.min(c.ms ?? ms, CLIP_MAX_MS)]);
  });
  steps.push([{ kind: 'end' }, END_MS]);

  function Promo() {
    const [n, setN] = useState(0);
    useEffect(() => {
      if (n >= steps.length) {
        document.body.dataset.done = '1';
        return;
      }
      const t = setTimeout(() => setN(n + 1), steps[n][1]);
      return () => clearTimeout(t);
    }, [n]);
    const step = steps[Math.min(n, steps.length - 1)][0];

    if (step.kind === 'intro') {
      return (
        <div className="promo intro r-legendary">
          <div className="promo-glow" />
          <h1 className="promo-hook promo-intro">{gold(INTRO)}</h1>
        </div>
      );
    }
    if (step.kind === 'end') {
      return (
        <div className="promo end">
          <div className="promo-end">
            <img src="/icon-192.png" alt="" />
            <div className="promo-logo">
              Ultra<b>chess</b>
            </div>
            <p>Chess where every piece is unique</p>
            <div className="promo-url">ultrachess.app</div>
            <small>Free to play · in your browser</small>
          </div>
        </div>
      );
    }
    const c = CUTS[step.cut];
    const card = getCard(c.id);
    // The key restarts the animations at every cut.
    return (
      <div key={`${step.cut}`} className={`promo r-${card.rarity} ${step.kind}`}>
        <div className="promo-flash" />
        <div className="promo-glow" />
        <h1 className="promo-hook">{gold(c.hook)}</h1>
        <div className="promo-card">
          <div className="promo-art">
            <img className="pixel" src={cardArt(card.id)!} alt="" />
          </div>
          <div className="promo-name">
            <span className="promo-rarity">{RARITY_NAMES[card.rarity]}</span>
            <b>{card.name}</b>
          </div>
        </div>
        {step.kind === 'clip' && (
          <div className="promo-clip">
            <CardClip cardId={card.id} />
          </div>
        )}
      </div>
    );
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <Promo />
    </StrictMode>,
  );
}

void main();
