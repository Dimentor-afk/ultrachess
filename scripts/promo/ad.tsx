// Ad director (dev server only): plays one of the ads in ads.ts as a 9:16
// video on the real board, pack opening and cards. scripts/promo/render.mjs
// records it frame by frame with a fake clock, so the video never stutters.
// http://localhost:5173/scripts/promo/ad.html?ad=chaos&zoom=2.5
import { type CSSProperties, StrictMode, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { loadLang } from '../../src/i18n';
import { localizeData } from '../../src/i18n/data';
import '../../src/ui/styles.css';
import './ad.css';
import { ADS, NATIVE, type Shot } from './ads';

const q = new URLSearchParams(location.search);
const ad = ADS[q.get('ad') ?? 'chaos'];
// An ordinary TikTok rather than an ad: plain cuts, TikTok-style text, a watermark.
const native = NATIVE.has(q.get('ad') ?? '');
if (native) document.documentElement.classList.add('native');
const zoom = q.get('zoom');
if (zoom) document.documentElement.style.zoom = zoom;

/** *word* in gold. */
function gold(text: string) {
  return text.split('*').map((part, i) => (i % 2 ? <b key={i}>{part}</b> : part));
}

async function main() {
  await loadLang('en');
  localizeData();
  const [{ Board }, { PackOpening }, { CardView }, engine, { CARD_BY_ID, RARITY_NAMES }, { cardArt }] = await Promise.all([
    import('../../src/ui/Board'),
    import('../../src/ui/PackOpening'),
    import('../../src/ui/common'),
    import('./scene'),
    import('../../src/engine/cards'),
    import('../../src/ui/cardArt'),
  ]);

  /** Length of a shot in ms. */
  const shotMs = (s: Shot) => (s.kind === 'board' ? (s.lead ?? 600) + s.steps.length * (s.gap ?? 1500) + (s.tail ?? 900) : s.ms);

  function Caption({ text, pos = 'top' }: { text: string; pos?: 'top' | 'bottom' | 'mid' }) {
    return (
      <div className={`ad-cap ad-cap-${pos}`} key={text}>
        <span>{gold(text)}</span>
      </div>
    );
  }

  function BoardShot({ s }: { s: Extract<Shot, { kind: 'board' }> }) {
    const states = useMemo(() => engine.playScene(s), []);
    const [i, setI] = useState(0);
    useEffect(() => {
      if (i >= states.length - 1) return;
      const t = setTimeout(() => setI(i + 1), i === 0 ? (s.lead ?? 600) : (s.gap ?? 1500));
      return () => clearTimeout(t);
    }, [i]);
    const view = engine.view(states[i]);
    // The caption of the last step played so far ("move|caption").
    const caption = [s.caption, ...s.steps.map((x) => x.split('|')[1])].slice(0, i + 1).filter(Boolean).at(-1);
    const focus = s.focus ? engine.squareXY(s.focus) : { x: 50, y: 50 };
    // Puzzle: 3, 2, 1 over the board, then the answer plays.
    const [count, setCount] = useState(s.count ?? 0);
    useEffect(() => {
      if (count <= 0) return;
      const t = setTimeout(() => setCount(count - 1), s.countMs ?? 1000);
      return () => clearTimeout(t);
    }, [count]);
    return (
      <div className="ad-board-shot">
        {count > 0 && (
          <div className="ad-count" key={count} style={{ '--ms': `${s.countMs ?? 1000}ms` } as CSSProperties}>
            <span>{count}</span>
          </div>
        )}
        {!!s.count && count === 0 && <i className="ad-reveal" />}
        {!s.count && s.music === 'tense' && i === states.length - 1 && i > 0 && <i className="ad-reveal" />}
        <div
          className="ad-camera"
          style={{ '--fx': `${focus.x}%`, '--fy': `${focus.y}%`, '--z': s.zoom ?? 1.25, animationDuration: `${shotMs(s)}ms` } as CSSProperties}
        >
          <Board
            view={view}
            orientation="w"
            selected={null}
            marks={new Map()}
            lastMove={new Set()}
            hint={new Set()}
            preview={new Set()}
            checkSquare={engine.checkSquare(states[i])}
            onSquare={() => {}}
            celebrate={!!s.win && i === states.length - 1}
          />
        </div>
        {caption && <Caption text={caption} pos={s.capPos ?? 'top'} />}
      </div>
    );
  }

  function PackShot({ s }: { s: Extract<Shot, { kind: 'pack' }> }) {
    const ref = useRef<HTMLDivElement>(null);
    // Tap the pack, then each card once it is face up and has been seen.
    // The caption changes once the (last) card is face up.
    const [shown, setShown] = useState(false);
    useEffect(() => {
      let flippedAt = 0;
      const tap = setTimeout(() => ref.current?.querySelector<HTMLButtonElement>('.opening-pack')?.click(), 250);
      const tick = setInterval(() => {
        const flip = ref.current?.querySelector('.flip.flipped');
        if (!flip) return void (flippedAt = 0);
        setShown(true);
        // The last card stays on screen until the shot ends.
        const [at, of] = (ref.current?.querySelector('.reveal-count')?.textContent ?? '').split('/').map((x) => Number(x.trim()));
        if (at && at === of) return;
        if (!flippedAt) flippedAt = Date.now();
        else if (Date.now() - flippedAt > (s.hold ?? 900)) {
          flippedAt = 0;
          ref.current?.querySelector<HTMLDivElement>('.reveal')?.click();
        }
      }, 50);
      return () => {
        clearTimeout(tap);
        clearInterval(tick);
      };
    }, []);
    const pack = { id: 'p', type: s.pack, name: s.packName ?? 'Mythic Pack', source: '' };
    return (
      <div className="ad-pack-shot" ref={ref}>
        <PackOpening
          pack={pack as never}
          open={async () => ({ pack: pack as never, cards: s.cards.map((cardId) => ({ cardId, isNew: true, shards: 0 })), gold: 0, shards: 0 })}
          onClose={() => {}}
          pace={s.pace}
        />
        {(shown && s.after ? s.after : s.caption) && <Caption text={(shown && s.after) || s.caption!} pos="top" />}
      </div>
    );
  }

  /** A scene played on its own clock: the step shown now. */
  function useScene(spec: Parameters<typeof engine.playScene>[0], lead: number, gap: number) {
    const states = useMemo(() => engine.playScene(spec), []);
    const [i, setI] = useState(0);
    useEffect(() => {
      if (i >= states.length - 1) return;
      const t = setTimeout(() => setI(i + 1), i === 0 ? lead : gap);
      return () => clearTimeout(t);
    }, [i]);
    return { states, i };
  }

  function SideBoard({ states, i }: { states: ReturnType<typeof engine.playScene>; i: number }) {
    return (
      <Board
        view={engine.view(states[i])}
        orientation="w"
        selected={null}
        marks={new Map()}
        lastMove={new Set()}
        hint={new Set()}
        preview={new Set()}
        checkSquare={engine.checkSquare(states[i])}
        onSquare={() => {}}
        celebrate={false}
      />
    );
  }

  /** Normal chess on top, Ultrachess below: the same idea, the card's move a beat later. */
  function VersusShot({ s }: { s: Extract<Shot, { kind: 'versus' }> }) {
    const top = useScene(s.top, s.top.lead ?? 300, s.top.gap ?? 1200);
    const bottom = useScene(s.bottom, (s.bottom.lead ?? 300) + s.delay, s.bottom.gap ?? 1200);
    const played = bottom.i > 0;
    return (
      <div className="ad-versus">
        <div className={`ad-vs-half normal ${played ? 'dim' : ''}`}>
          <span className="ad-vs-tag">Normal chess</span>
          <SideBoard {...top} />
        </div>
        <div className={`ad-vs-mid ${s.title ? 'title' : ''}`}>{s.title ? <b>{gold(s.title)}</b> : <><i>VS</i><b>{s.piece}</b></>}</div>
        <div className={`ad-vs-half ultra ${played ? 'lit' : ''}`}>
          <span className="ad-vs-tag">Ultrachess</span>
          <SideBoard {...bottom} />
        </div>
        {played && <i className="ad-reveal" />}
      </div>
    );
  }

  function CardShot({ s }: { s: Extract<Shot, { kind: 'card' }> }) {
    const card = CARD_BY_ID[s.id];
    return (
      <div className={`ad-card-shot r-${card.rarity}`}>
        <div className="ad-rays" />
        <div className="ad-card-slam">
          <CardView card={card} />
        </div>
        <div className="ad-card-name">
          <span>{RARITY_NAMES[card.rarity]}</span>
          <b>{card.name}</b>
        </div>
        {s.caption && <Caption text={s.caption} pos="top" />}
      </div>
    );
  }

  function Hook({ s }: { s: Extract<Shot, { kind: 'hook' }> }) {
    return (
      <div className="ad-hook">
        {s.art && <img className="ad-hook-art pixel" src={cardArt(s.art)!} alt="" />}
        <h1>{gold(s.text)}</h1>
        {s.sub && <p>{gold(s.sub)}</p>}
      </div>
    );
  }

  const TIER_ORDER = ['S', 'A', 'B', 'C', 'D'] as const;

  /** A tier list; the new card drops into its row with a thump. */
  function TierShot({ s }: { s: Extract<Shot, { kind: 'tier' }> }) {
    return (
      <div className="ad-tier-shot">
        <div className="ad-tiers">
          {TIER_ORDER.map((tier) => (
            <div key={tier} className={`ad-tier t-${tier}`}>
              <b className="ad-tier-label">{tier}</b>
              <div className="ad-tier-slots">
                {(s.rows[tier] ?? []).map((id) => (
                  <img key={id} className="ad-tier-card pixel" src={cardArt(id)!} alt="" />
                ))}
                {s.add?.tier === tier && <img className={`ad-tier-card pixel ad-slam ${tier === 'S' ? 'ad-drop' : ''}`} src={cardArt(s.add.id)!} alt="" />}
              </div>
            </div>
          ))}
        </div>
        {s.add && (
          <div className={`ad-tier-name t-${s.add.tier}`}>
            <span>{RARITY_NAMES[CARD_BY_ID[s.add.id].rarity]}</span>
            <b>{CARD_BY_ID[s.add.id].name}</b>
          </div>
        )}
        {s.caption && <Caption text={s.caption} pos="top" />}
      </div>
    );
  }

  function End({ s }: { s: Extract<Shot, { kind: 'end' }> }) {
    return (
      <div className="ad-end">
        {s.caption && <Caption text={s.caption} pos="top" />}
        <img src="/icon-192.png" alt="" />
        <div className="ad-logo">
          Ultra<b>chess</b>
        </div>
        <p>{s.text ?? 'Chess where every piece is unique'}</p>
        <div className="ad-url">ultrachess.app</div>
        <small>Free · plays in your browser</small>
      </div>
    );
  }

  function Ad() {
    const [n, setN] = useState(-1);
    // Each start plays the ad from the top (the recorder plays it once to load every image, then records).
    const [run, setRun] = useState(0);
    useEffect(() => {
      (window as unknown as { __start: () => void }).__start = () => {
        delete document.body.dataset.done;
        setRun((r) => r + 1);
        setN(0);
      };
      (window as unknown as { __length: number }).__length = ad.reduce((t, s) => t + shotMs(s), 0);
      document.body.dataset.ready = '1';
    }, []);
    useEffect(() => {
      if (n < 0) return;
      if (n >= ad.length) {
        document.body.dataset.done = '1';
        return;
      }
      const t = setTimeout(() => setN(n + 1), shotMs(ad[n]));
      return () => clearTimeout(t);
    }, [n, run]);
    const i = Math.min(Math.max(n, 0), ad.length - 1);
    const s = ad[i];
    // Cuts alternate: a zoom through the frame, then a whip pan one way or the other.
    const trans = ['zoom', 'whip-l', 'zoom', 'whip-r'][i % 4];
    const last = i === ad.length - 1;
    return (
      <div className="ad">
        <div
          className={native ? 'ad-shot' : `ad-shot t-${trans} ${i > 0 ? 'enter' : ''} ${last ? '' : 'leave'}`}
          key={`${run}-${n}`}
          data-n={i}
          data-music={s.music ?? 'full'}
          style={{ '--d': `${shotMs(s)}ms` } as CSSProperties}
        >
          <div className="ad-frame">
            {s.kind === 'hook' && <Hook s={s} />}
            {s.kind === 'board' && <BoardShot s={s} />}
            {s.kind === 'pack' && <PackShot s={s} />}
            {s.kind === 'card' && <CardShot s={s} />}
            {s.kind === 'end' && <End s={s} />}
            {s.kind === 'tier' && <TierShot s={s} />}
            {s.kind === 'versus' && <VersusShot s={s} />}
            {s.kind === 'text' && (
              <div className="ad-text">
                <p>{s.text}</p>
              </div>
            )}
          </div>
          {n > 0 && !native && <div className="ad-flash" />}
          {native && <span className="ad-mark">ultrachess.app</span>}
        </div>
      </div>
    );
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <Ad />
    </StrictMode>,
  );
}

void main();
