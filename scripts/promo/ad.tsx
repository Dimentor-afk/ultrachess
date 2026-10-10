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
import { ADS, GRADES, LOOK, type Mood, NATIVE, PINNED, type Shot, type StepGrade } from './ads';

const q = new URLSearchParams(location.search);
const ad = ADS[q.get('ad') ?? 'chaos'];
// An ordinary TikTok rather than an ad: plain cuts, TikTok-style text, a watermark.
const native = NATIVE.has(q.get('ad') ?? '');
const look = LOOK[q.get('ad') ?? ''];
if (look?.cls) document.documentElement.classList.add(look.cls);
const pin = PINNED[q.get('ad') ?? ''];
if (native) document.documentElement.classList.add('native');
const zoom = q.get('zoom');
if (zoom) document.documentElement.style.zoom = zoom;

/** *word* in gold. */
function gold(text: string) {
  return text.split('*').map((part, i) => (i % 2 ? <b key={i}>{part}</b> : part));
}

async function main() {
  // Ads are in English; ?lang= renders another language (the patch notes clip comes in all five).
  const lang = q.get('lang');
  await loadLang(lang === 'uk' || lang === 'de' || lang === 'it' || lang === 'es' ? lang : 'en');
  localizeData();
  const [{ Board, mateTimes, moverMsOf }, { PackOpening }, { CardView }, engine, { CARD_BY_ID, RARITY_NAMES }, { cardArt, pieceSprite }, { setSettings }, { themeById }] = await Promise.all([
    import('../../src/ui/Board'),
    import('../../src/ui/PackOpening'),
    import('../../src/ui/common'),
    import('./scene'),
    import('../../src/engine/cards'),
    import('../../src/ui/cardArt'),
    import('../../src/ui/settings'),
    import('../../src/economy/themes'),
  ]);
  // The ad's own look: dark sprites for Black (as in ordinary chess), coordinates on or off.
  if (look) setSettings({ ...(look.blackStyle ? { blackStyle: look.blackStyle } : {}), ...(look.coordinates !== undefined ? { coordinates: look.coordinates } : {}) });
  /** Board colours of a shop theme, as the game sets them. */
  const themeVars = (id?: string) => (id ? { '--light-sq': themeById(id).light, '--dark-sq': themeById(id).dark } : {});

  /** How long the action of a state takes to land after it starts (its move, a mate's fall, a blast). */
  const travelOf = (m: Parameters<typeof engine.view>[0]) => {
    const fx = engine.view(m).fx;
    if (!fx) return 0;
    if (m.status === 'checkmate') return mateTimes(fx).fall;
    return moverMsOf(fx) || (fx.sprites.some((x) => x.kind === 'explode') ? 180 : 0);
  };

  /** States played at set times: `lands[k]` is when state k + 1 lands, so it starts its travel before. */
  function useTimed(states: ReturnType<typeof engine.playScene>, lands: number[]) {
    const [i, setI] = useState(0);
    useEffect(() => {
      const timers = lands.map((t, k) => setTimeout(() => setI(k + 1), Math.max(0, t - travelOf(states[k + 1]))));
      return () => timers.forEach(clearTimeout);
    }, []);
    return i;
  }

  /** How many of `times` (ms from mount) have passed. */
  function usePassed(times: number[]) {
    const [k, setK] = useState(0);
    useEffect(() => {
      const timers = times.map((t, j) => setTimeout(() => setK(j + 1), t));
      return () => timers.forEach(clearTimeout);
    }, []);
    return k;
  }

  /** A card's name in a gold pill under the piece that did the trick: it stays through the next move. */
  function Tag({ tag, delay }: { tag: NonNullable<StepGrade['tag']>; delay: number }) {
    const at = engine.squareXY(tag.sq);
    return (
      <span className="ad-grade-tag" style={{ '--land': `${delay}ms`, left: `${at.x}%`, top: `${at.y + 8.5}%` } as CSSProperties}>
        {tag.text}
      </span>
    );
  }

  /** A move's grade on the board: the badge on its square's corner (rings pulsing on a held one),
   *  the chess-site word in a pill above it for a moment. Placed in the board's own box. */
  function GradeMark({ g, delay, rings }: { g: StepGrade; delay: number; rings?: boolean }) {
    const at = engine.squareXY(g.sq);
    const c = GRADES[g.g];
    const style = { '--grade': c.c, '--land': `${delay}ms` } as CSSProperties;
    return (
      <>
        <span className={`ad-grade ${rings ? 'rings' : ''}`} style={{ ...style, left: `${at.x + 4.2}%`, top: `${at.y - 4.2}%` }}>
          {c.t}
        </span>
        {g.name && (
          <span className="ad-grade-name" style={{ ...style, left: `${at.x}%`, top: `${at.y - 9.5}%` }}>
            {g.name}
          </span>
        )}
      </>
    );
  }

  /** Length of a shot in ms. */
  /** Time after step i of a board shot (its own entry in `gaps`, else `gap`). */
  const gapAt = (s: Extract<Shot, { kind: 'board' }>, i: number) => s.gaps?.[i] ?? s.gap ?? 1500;
  const shotMs = (s: Shot) => (s.kind === 'board' ? (s.ms ?? (s.lead ?? 600) + s.steps.reduce((t, _, i) => t + gapAt(s, i), 0) + (s.tail ?? 900)) : s.ms);

  function Caption({ text, pos = 'top' }: { text: string; pos?: 'top' | 'bottom' | 'mid' }) {
    return (
      <div className={`ad-cap ad-cap-${pos}`} key={text}>
        <span>{gold(text)}</span>
      </div>
    );
  }

  function BoardShot({ s }: { s: Extract<Shot, { kind: 'board' }> }) {
    const states = useMemo(() => engine.playScene(s), []);
    // A move set to land at `land`: it starts as long before as its own animation takes.
    const lead = useMemo(() => {
      if (s.land === undefined || states.length < 2) return s.lead ?? 600;
      const fx = engine.view(states[1]).fx;
      if (!fx) return s.land;
      return Math.max(0, s.land - (states[1].status === 'checkmate' ? mateTimes(fx).fall : moverMsOf(fx)));
    }, []);
    const [stepped, setI] = useState(0);
    useEffect(() => {
      if (s.lands || stepped >= states.length - 1) return;
      const t = setTimeout(() => setI(stepped + 1), stepped === 0 ? lead : gapAt(s, stepped - 1));
      return () => clearTimeout(t);
    }, [stepped]);
    // Edits: every step at its own time.
    const timed = useTimed(states, s.lands ?? []);
    const i = s.lands ? timed : stepped;
    const view = engine.view(states[i]);
    const grade = s.grade ? GRADES[s.grade.g] : null;
    const badgeAt = s.grade ? engine.squareXY(s.grade.sq) : null;
    // The grade of the step played last (edits), or the move before the shot.
    const step = (i > 0 && s.grades?.[i - 1]) || null;
    const mark = step ?? (i === 0 ? s.held : null) ?? null;
    const markColor = mark ? GRADES[mark.g].c : null;
    const markDelay = step ? travelOf(states[i]) : 0;
    // The caption of the last step played so far ("move|caption").
    const caption = [s.caption, ...s.steps.map((x) => x.split('|')[1])].slice(0, i + 1).filter(Boolean).at(-1);
    const focus = s.focus ? engine.squareXY(s.focus) : { x: 50, y: 50 };
    const article = usePassed(s.article ? [s.article.from, s.article.to] : []) === 1;
    // Puzzle: 3, 2, 1 over the board, then the answer plays.
    const [count, setCount] = useState(s.count ?? 0);
    useEffect(() => {
      if (count <= 0) return;
      const t = setTimeout(() => setCount(count - 1), s.countMs ?? 1000);
      return () => clearTimeout(t);
    }, [count]);
    const paint = mark ? (mark.paint ?? []) : i >= 1 ? (s.paint ?? []) : [];
    const color = markColor ?? grade?.c;
    return (
      <div
        className={`ad-board-shot ${s.cam === 'roll' || s.cam === 'still' ? 'flat' : ''}`}
        style={{ ...(color ? { '--grade': color, '--land': `${s.land ?? 0}ms` } : {}), ...themeVars(s.theme) } as CSSProperties}
      >
        {count > 0 && (
          <div className="ad-count" key={count} style={{ '--ms': `${s.countMs ?? 1000}ms` } as CSSProperties}>
            <span>{count}</span>
          </div>
        )}
        {!!s.count && count === 0 && <i className="ad-reveal" />}
        {!s.count && s.music === 'tense' && i === states.length - 1 && i > 0 && <i className="ad-reveal" />}
        <div
          className={`ad-camera cam-${s.cam ?? 'push'}`}
          style={
            {
              '--fx': `${focus.x}%`,
              '--fy': `${focus.y}%`,
              // The roll and still cameras put the focus square in the middle of the frame.
              '--tx': `${50 - focus.x}%`,
              '--ty': `${50 - focus.y}%`,
              '--z': s.zoom ?? 1.25,
              '--r0': `${s.roll?.[0] ?? 0}deg`,
              '--r1': `${s.roll?.[1] ?? 0}deg`,
              animationDuration: `${shotMs(s)}ms`,
            } as CSSProperties
          }
        >
          <Board
            view={view}
            orientation={s.flip ? 'b' : 'w'}
            selected={null}
            marks={new Map()}
            lastMove={new Set(paint.map(engine.parseSquare))}
            // Edits: the squares in danger glow red (drawn as the board's line preview), the hero's gold.
            hint={new Set((s.gold ?? []).map(engine.parseSquare))}
            preview={new Set((s.red?.[Math.min(i, s.red.length - 1)] ?? []).map(engine.parseSquare))}
            checkSquare={engine.checkSquare(states[i])}
            onSquare={() => {}}
            celebrate={!!s.win && i === states.length - 1}
            mated={states[i].status === 'checkmate' ? engine.checkSquare(states[i]) : null}
          />
          {grade && badgeAt && (
            // The grade's badge sits on the square's top-right corner, like on chess sites.
            <span className="ad-grade" style={{ left: `${badgeAt.x + 3.6}%`, top: `${badgeAt.y - 3.6}%` }}>
              {grade.t}
            </span>
          )}
          {mark && <GradeMark key={i} g={mark} delay={markDelay} rings={!step} />}
        </div>
        {article && <Article />}
        {s.label && <div className="ad-label">{s.label}</div>}
        {mark?.label && (
          <div className="ad-label" key={`l${i}`} style={{ '--land': `${markDelay}ms` } as CSSProperties}>
            {mark.label}
          </div>
        )}
        {s.fade && (
          <div className="ad-fade" style={{ '--fade': `${s.fade}ms` } as CSSProperties}>
            <b>
              Ultra<span>chess</span>
            </b>
            <small>ultrachess.app</small>
          </div>
        )}
        {caption && <Caption text={caption} pos={s.capPos ?? 'top'} />}
      </div>
    );
  }

  // Pages of an article about the game, flicking past, blurred, the name lit in each (an edit insert).
  const PAGES: string[][] = [
    ['the history of chess variants and the', 'rise of card games online has led to', 'an introduction to *Ultrachess* and its', 'cards, its rules and the pieces that', 'break them, one move at a time. This'],
    ['players who tried it for the first', 'time often say the same thing about', 'the rules of *Ultrachess*: every piece', 'is a card with a move of its own, and', 'no two decks play the same way. The'],
    ['a rook that bounces off the edge, a', 'king that walks two squares, a pawn', 'in *Ultrachess* that steps diagonally', 'and takes straight ahead. Strategy is', 'about knowing what each card can do.'],
    ['over centuries of play, chess has', 'changed very little. Then came the', 'idea of *Ultrachess*: keep the board,', 'keep the goal, and give every single', 'piece a power of its own to surprise'],
    ['tournaments and ladders reward the', 'players who read the board deeply.', 'In *Ultrachess* the deck you build', 'decides the game before it starts, and', 'the cards you open decide the rest.'],
    ['a knight that swaps with its pawn,', 'a rook that checks from the corner,', 'the beauty of *Ultrachess* lies in', 'moves that look illegal and are not.', 'Every game teaches a new pattern.'],
  ];
  function Article() {
    const [p, setP] = useState(0);
    useEffect(() => {
      const t = setTimeout(() => setP(p + 1), 170);
      return () => clearTimeout(t);
    }, [p]);
    const page = PAGES[p % PAGES.length];
    return (
      <div className="ad-article" key={p} style={{ '--shift': `${((p * 37) % 9) - 4}%` } as CSSProperties}>
        {page.map((line, k) => (
          <p key={k} className={line.includes('*') ? 'key' : `far f${Math.abs(k - 2)}`}>
            {line.split('*').map((part, j) => (j % 2 ? <mark key={j}>{part}</mark> : <span key={j}>{part}</span>))}
          </p>
        ))}
      </div>
    );
  }

  // The reaction under the board in a meme: black pieces as the crowd (in their dark sprites, as the board shows them).
  const CROWD: { id: string; x: number; y: number; h: number; z?: number }[] = [
    { id: 'pawn-classic', x: 7, y: 47, h: 22 }, { id: 'pawn-spearman', x: 21, y: 49, h: 22 }, { id: 'pawn-classic', x: 79, y: 49, h: 22 },
    { id: 'pawn-phantom', x: 93, y: 47, h: 22 }, { id: 'pawn-classic', x: 50, y: 52, h: 20 },
    { id: 'knight-classic', x: 13, y: 26, h: 33 }, { id: 'bishop-portal', x: 29, y: 24, h: 34 }, { id: 'rook-battering', x: 72, y: 24, h: 33 },
    { id: 'knight-wallrunner', x: 88, y: 26, h: 33 },
    { id: 'queen-classic', x: 38, y: -4, h: 58, z: 2 }, { id: 'king-classic', x: 63, y: -5, h: 58, z: 2 },
  ];
  const sprite = (id: string) => pieceSprite(id, CARD_BY_ID[id].pieceType, 'b', 'dark').src;
  /** Emoji in the colour font (the body font's fallback draws some of them in grey outline). */
  const emoji = (text: string) => text.split(/(\p{Extended_Pictographic}\uFE0F?)/u).map((part, k) => (k % 2 ? <span key={k} className="emo">{part}</span> : part));

  function MemePanel({ mood, text }: { mood: Mood; text?: string }) {
    if (mood === 'cheer') {
      return (
        <div className="ad-react cheer">
          <i className="beam l" />
          <i className="beam r" />
          <div className="ad-react-shake">
            {CROWD.map((c, k) => (
              <img
                key={k}
                className="crowd-p pixel"
                src={sprite(c.id)}
                alt=""
                style={{ left: `${c.x}%`, bottom: `${c.y}%`, height: `${c.h}%`, zIndex: c.z ?? 1, '--t': `${300 + ((k * 53) % 140)}ms`, '--dl': `-${(k * 97) % 300}ms` } as CSSProperties}
              />
            ))}
          </div>
          {[8, 26, 44, 61, 77, 90, 17, 70].map((x, k) => (
            <span key={k} className="laugh" style={{ left: `${x}%`, animationDelay: `${k * 260 + ((k * 71) % 120)}ms` }}>
              😂
            </span>
          ))}
          {text && <div className="ad-react-cap">{emoji(text)}</div>}
        </div>
      );
    }
    return (
      <div className={`ad-react sad ${mood === 'sad-close' ? 'close' : ''}`}>
        <div className="ad-react-crowd">
          {CROWD.filter((c) => c.id !== 'king-classic' && c.id !== 'queen-classic').map((c, k) => (
            <img key={k} className="crowd-p still pixel" src={sprite(c.id)} alt="" style={{ left: `${c.x}%`, bottom: `${c.y + 6}%`, height: `${c.h}%` }} />
          ))}
        </div>
        <div className="sad-king">
          <img className="pixel" src={sprite('king-classic')} alt="" />
          <i className="sweat" />
        </div>
        <i className="rain" />
        <i className="fog" />
        {text && <div className="ad-react-cap">{emoji(text)}</div>}
      </div>
    );
  }

  /** Meme split screen: the board on top, the reaction under it, the card that did it over the board. */
  function MemeShot({ s }: { s: Extract<Shot, { kind: 'meme' }> }) {
    const b = s.board;
    const states = useMemo(() => engine.playScene(b), []);
    const i = useTimed(states, b.lands);
    const panel = usePassed(s.panels.map((p) => p.at)) - 1;
    const sel = usePassed(b.select ? [b.select.from, b.select.to] : []) === 1;
    const card = usePassed(s.card ? [s.card.at] : []) === 1;
    const view = engine.view(states[i]);
    const g = (i > 0 && b.grades?.[i - 1]) || null;
    const delay = g ? travelOf(states[i]) : 0;
    // The last step so far with a tag (its pill outlives the moves after it).
    const tagAt = Math.max(0, ...(b.grades ?? []).map((x, k) => (x?.tag && k < i ? k + 1 : 0)));
    const p = s.panels.length ? s.panels[Math.max(0, panel)] : null;
    return (
      <div className="ad-meme">
        <div className="ad-meme-board" style={{ ...themeVars(b.theme), ...(g ? { '--grade': GRADES[g.g].c } : {}) } as CSSProperties}>
          <div className="ad-camera cam-still" style={{ '--z': 1 } as CSSProperties}>
            <Board
              view={view}
              orientation="w"
              selected={sel && b.select ? engine.parseSquare(b.select.sq) : null}
              marks={sel && b.select ? engine.targets(states[i], b.select.sq) : new Map()}
              lastMove={new Set((g?.paint ?? []).map(engine.parseSquare))}
              hint={new Set()}
              preview={new Set((b.red?.[Math.min(i, b.red.length - 1)] ?? []).map(engine.parseSquare))}
              checkSquare={engine.checkSquare(states[i])}
              onSquare={() => {}}
              celebrate={false}
              mated={states[i].status === 'checkmate' ? engine.checkSquare(states[i]) : null}
            />
            {g && <GradeMark key={i} g={g} delay={delay} />}
            {tagAt > 0 && <Tag key={`t${tagAt}`} tag={b.grades![tagAt - 1]!.tag!} delay={travelOf(states[tagAt]) + 250} />}
          </div>
          {card && s.card && (
            <div className={`ad-meme-card r-${CARD_BY_ID[s.card.id].rarity}`}>
              <div className="ad-card-slam">
                <CardView card={CARD_BY_ID[s.card.id]} />
              </div>
            </div>
          )}
        </div>
        <div className="ad-meme-panel">
          {p && <MemePanel key={panel} mood={p.mood} text={p.text} />}
        </div>
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

  /** Edit insert: the piece huge on a dark glow, slowly closing in, its name stamped over it. */
  function HeroShot({ s }: { s: Extract<Shot, { kind: 'hero' }> }) {
    const card = CARD_BY_ID[s.id];
    return (
      <div className={`ad-hero r-${card.rarity}`} style={{ '--d': `${s.ms}ms` } as CSSProperties}>
        <div className="ad-rays" />
        <img className="ad-hero-art pixel" src={pieceSprite(card.id, card.pieceType, 'w').src} alt="" />
        <div className="ad-hero-text">
          <b>{s.text}</b>
          {s.sub && <span>{s.sub}</span>}
        </div>
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
    // Every cut is timed from the start, not from the cut before: chained timers each round up to a
    // frame and the edit would drift off the beat of its music.
    useEffect(() => {
      if (run === 0) return;
      let at = 0;
      const timers = ad.map((s, k) => {
        at += shotMs(s);
        return setTimeout(() => setN(k + 1), at);
      });
      return () => timers.forEach(clearTimeout);
    }, [run]);
    useEffect(() => {
      if (n >= ad.length) document.body.dataset.done = '1';
    }, [n]);
    const i = Math.min(Math.max(n, 0), ad.length - 1);
    const s = ad[i];
    // Cuts alternate: a zoom through the frame, then a whip pan one way or the other.
    const trans = ['zoom', 'whip-l', 'zoom', 'whip-r'][i % 4];
    const last = i === ad.length - 1;
    // Edits choose their cuts: the shot comes in its own way and leaves the way the next one comes in.
    const next = last ? undefined : ad[i + 1].cut;
    const edit = !!s.cut || !!next;
    const CUT_IN = { vwhip: 'ad-in-vwhip 0.24s cubic-bezier(0.15, 0.85, 0.3, 1) both', pull: 'ad-in-pull 0.32s cubic-bezier(0.2, 0.8, 0.25, 1) both', cut: '' };
    const CUT_OUT = { vwhip: `ad-out-vwhip 0.16s cubic-bezier(0.6, 0, 0.9, 0.4) ${shotMs(s) - 160}ms forwards`, pull: '', cut: '' };
    const cutAnim = [i > 0 && s.cut ? CUT_IN[s.cut] : '', next ? CUT_OUT[next] : ''].filter(Boolean).join(', ');
    // A pull back starts where the close-up before it was looking.
    const prev = ad[i - 1];
    const pullFrom = s.cut === 'pull' && prev?.kind === 'board' && prev.focus ? engine.squareXY(prev.focus) : null;
    return (
      <div className="ad">
        <div
          className={native || edit ? 'ad-shot' : `ad-shot t-${trans} ${i > 0 ? 'enter' : ''} ${last ? '' : 'leave'}`}
          key={`${run}-${n}`}
          data-n={i}
          data-music={s.music ?? 'full'}
          style={{ '--d': `${shotMs(s)}ms`, ...(s.kind === 'board' && s.grade ? { '--bump': GRADES[s.grade.g].c } : {}) } as CSSProperties}
        >
          <div
            className="ad-frame"
            style={
              edit
                ? ({ animation: cutAnim || undefined, transformOrigin: pullFrom ? `${pullFrom.x}% ${(168 + (pullFrom.y / 100) * 432) / 7.68}%` : undefined } as CSSProperties)
                : undefined
            }
          >
          <div
            className="ad-kicker"
            // Hits in the music: the whole frame kicks on each (one animation per hit).
            style={s.bumps?.length ? { animation: s.bumps.map((b) => `ad-kick 0.32s cubic-bezier(0.2, 0.8, 0.3, 1) ${b}ms`).join(', ') } : undefined}
          >
            {s.kind === 'hero' && <HeroShot s={s} />}
            {s.kind === 'hook' && <Hook s={s} />}
            {s.kind === 'board' && <BoardShot s={s} />}
            {s.kind === 'meme' && <MemeShot s={s} />}
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
          </div>
          {n > 0 && !native && !edit && <div className="ad-flash" />}
          {s.bumps?.map((b) => <i key={b} className="ad-bump" style={{ animationDelay: `${b}ms` }} />)}
          {(native || look) && <span className="ad-mark">ultrachess.app</span>}
        </div>
        {/* Motion blur along one axis for the whips (CSS blur has no direction). */}
        <svg className="ad-filters" aria-hidden="true">
          <filter id="vb1"><feGaussianBlur stdDeviation="0 5" /></filter>
          <filter id="vb2"><feGaussianBlur stdDeviation="0 12" /></filter>
          <filter id="vb3"><feGaussianBlur stdDeviation="0 26" /></filter>
        </svg>
        {pin && s.kind !== 'text' && (
          <div className="ad-cap ad-cap-top">
            <span>{pin}</span>
          </div>
        )}
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
