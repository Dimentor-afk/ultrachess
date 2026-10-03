import { type CSSProperties, type ReactNode, memo, useLayoutEffect, useRef } from 'react';
import { getCard } from '../engine/cards';
import { fileOf, isBoardSquare, rankOf, sq } from '../engine/coords';
import type { FxMove } from '../engine/fx';
import type { Color, Leg, Square } from '../engine/types';
import type { PlayerView, ViewPiece } from '../engine/view';
import { Emblem } from './art';
import { pieceSprite } from './cardArt';
import { FX, type FxName } from './fxSprites';
import { useSettings } from './settings';
import { useOutlined } from './spriteOutline';
import { t } from '../i18n';

/** `far`: the end of a move that goes through stops (portal, ricochet, a turn). */
export type Mark = 'move' | 'capture' | 'option' | 'stay' | 'far' | 'far-capture';

/**
 * Grid tracks: a ring, 8 squares, a ring. The ring is a thin frame, and
 * widens while levitation platforms are around so a platform sits wholly
 * outside the board instead of overlapping the edge squares.
 */
const THIN_RING = 0.5;
const WIDE_RING = 0.95;

/** Ring width for this position: wide when something is (or may land) on it. */
export function boardRing(view: PlayerView, marks: Map<Square, unknown>): number {
  const onRing = view.cells.some((c, s) => c && !isBoardSquare(s)) || [...marks.keys()].some((s) => !isBoardSquare(s));
  return onRing ? WIDE_RING : THIN_RING;
}

// ── Move animation ──
// A move plays leg by leg: a slide glides, a hop arcs over the board, a warp
// fades out and back in. Every leg is timed by its length, with a short beat
// between legs so each landing reads (the knight touches the wall, then runs).

const LEG_PAUSE = 90;

function dist(a: Square, b: Square): number {
  return Math.max(Math.abs(fileOf(a) - fileOf(b)), Math.abs(rankOf(a) - rankOf(b)));
}

function legMs(style: Leg['style'], d: number): number {
  if (style === 'warp') return 640;
  if (style === 'rise') return 1050;
  if (style === 'hop') return Math.min(560, 300 + 45 * d);
  return Math.min(480, 120 + 50 * d);
}

interface Timed {
  leg: Leg;
  from: Square;
  start: number;
  end: number;
}

/** How long a move's animation runs (the legs from `skip` on), in ms. */
export function legsMs(from: Square, legs: Leg[], skip = 0): number {
  const timed = timeLegs(skip ? legs[skip - 1].to : from, legs.slice(skip));
  return timed.length ? timed[timed.length - 1].end : 0;
}

/** Start and end times of each leg, starting at `from`. */
export function timeLegs(from: Square, legs: Leg[]): Timed[] {
  const out: Timed[] = [];
  let t = 0;
  let at = from;
  legs.forEach((leg, i) => {
    if (i > 0) t += LEG_PAUSE;
    const ms = legMs(leg.style, dist(at, leg.to));
    out.push({ leg, from: at, start: t, end: t + ms });
    t += ms;
    at = leg.to;
  });
  return out;
}

interface Glide {
  timed: Timed[];
  delay: number;
}

function GlidePiece({ glide, orientation, ring, children }: { glide: Glide; orientation: Color; ring: number; children: ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    const { timed, delay } = glide;
    if (!el || !timed.length || typeof el.animate !== 'function' || document.documentElement.classList.contains('no-anim')) return;
    const end = squareCenter(timed[timed.length - 1].leg.to, orientation, ring);
    const off = (s: Square) => {
      const c = squareCenter(s, orientation, ring);
      return { x: c.x - end.x, y: c.y - end.y };
    };
    const total = timed[timed.length - 1].end;
    const frames: Keyframe[] = [];
    const tr = (p: { x: number; y: number }, lift = 0, scale = 1) => `translate(${p.x}cqw, ${p.y - lift}cqw) scale(${scale})`;
    for (const { leg, from, start, end: stop } of timed) {
      const a = off(from);
      const b = off(leg.to);
      const o = (t: number) => (total ? t / total : 1);
      if (leg.style === 'hop') {
        const lift = 3 + dist(from, leg.to) * 1.2;
        frames.push({ offset: o(start), transform: tr(a), opacity: 1, easing: 'cubic-bezier(0.3, 0, 0.6, 1)' });
        frames.push({ offset: o((start + stop) / 2), transform: tr({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, lift, 1.18), opacity: 1, easing: 'cubic-bezier(0.4, 0, 0.7, 1)' });
        frames.push({ offset: o(stop), transform: tr(b), opacity: 1 });
      } else if (leg.style === 'warp') {
        const span = stop - start;
        frames.push({ offset: o(start), transform: tr(a), opacity: 1 });
        frames.push({ offset: o(start + span * 0.45), transform: tr(a, 0, 0.2), opacity: 0 });
        frames.push({ offset: o(start + span * 0.55), transform: tr(b, 0, 0.2), opacity: 0 });
        frames.push({ offset: o(stop), transform: tr(b), opacity: 1 });
      } else if (leg.style === 'rise') {
        // Struck: flare, float up and fade as light; then take shape again where she returns.
        const span = stop - start;
        const at = (k: number) => o(start + span * k);
        const glow = (n: number) => `brightness(${n}) drop-shadow(0 0 ${n * 2}px rgba(255, 210, 120, 0.9))`;
        frames.push({ offset: at(0), transform: tr(a), opacity: 1, filter: glow(1) });
        frames.push({ offset: at(0.1), transform: tr(a, 0, 1.15), opacity: 1, filter: glow(2.6), easing: 'cubic-bezier(0.4, 0, 0.8, 0.6)' });
        frames.push({ offset: at(0.42), transform: tr(a, 10, 0.75), opacity: 0, filter: glow(3), easing: 'steps(1)' });
        frames.push({ offset: at(0.5), transform: tr(b, 0, 0.2), opacity: 0, filter: glow(3) });
        frames.push({ offset: at(0.72), transform: tr(b, 1.5, 1.22), opacity: 1, filter: glow(3), easing: 'cubic-bezier(0.3, 0, 0.5, 1)' });
        frames.push({ offset: at(0.86), transform: tr(b, 0, 0.94), opacity: 1, filter: glow(1.6) });
        frames.push({ offset: at(1), transform: tr(b), opacity: 1, filter: glow(1) });
      } else {
        frames.push({ offset: o(start), transform: tr(a), opacity: 1, easing: 'cubic-bezier(0.3, 0.7, 0.4, 1)' });
        frames.push({ offset: o(stop), transform: tr(b), opacity: 1 });
      }
    }
    // Hold still at the start while waiting (a pushed piece waits for the pusher).
    const anim = el.animate(frames, { duration: Math.max(total, 1), delay, fill: 'backwards' });
    return () => anim.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <span ref={ref} className="glide">
      {children}
    </span>
  );
}

/** Centre of a square in percent of the board, for overlays and animations. */
export function squareCenter(s: Square, orientation: Color, ring = THIN_RING): { x: number; y: number } {
  const total = 8 + 2 * ring;
  const center = (i: number) => (i === 0 ? ring / 2 : i === 9 ? ring + 8 + ring / 2 : ring + i - 0.5);
  const f = fileOf(s);
  const r = rankOf(s);
  const col = orientation === 'w' ? f + 1 : 8 - f;
  const row = orientation === 'w' ? 8 - r : r + 1;
  return { x: (center(col) / total) * 100, y: (center(row) / total) * 100 };
}

interface Props {
  view: PlayerView;
  orientation: Color;
  selected: Square | null;
  marks: Map<Square, Mark>;
  lastMove: Set<Square>;
  hint: Set<Square>;
  preview: Set<Square>;
  checkSquare: Square | null;
  onSquare: (s: Square) => void;
  /** Fireworks over the board (a won game). */
  celebrate?: boolean;
  /** Each side's capture effect sprite. */
  captureFx?: Partial<Record<Color, FxName>>;
  /** Match intro: pieces not placed yet, and the ones landing right now. */
  introHidden?: Set<Square>;
  introLanding?: Set<Square>;
}

const FILES = 'abcdefgh';

export function Board({ view, orientation, selected, marks, lastMove, hint, preview, checkSquare, onSquare, celebrate = false, captureFx, introHidden, introLanding }: Props) {
  const barrier = new Set(view.barriers.flatMap((b) => b.squares));
  const ranks = orientation === 'w' ? [8, 7, 6, 5, 4, 3, 2, 1, 0, -1] : [-1, 0, 1, 2, 3, 4, 5, 6, 7, 8];
  const files = orientation === 'w' ? [-1, 0, 1, 2, 3, 4, 5, 6, 7, 8] : [8, 7, 6, 5, 4, 3, 2, 1, 0, -1];
  const labelRank = orientation === 'w' ? -1 : 8;
  const labelFile = orientation === 'w' ? -1 : 8;
  const ring = boardRing(view, marks);
  const TOTAL = 8 + 2 * ring;

  // Animate the last action once: every piece that changed squares slides
  // (or hops / warps), and its effects play over the board. A preview of a
  // move and the move itself share a signature, so they animate once.
  const fx = view.fx;
  const sig = fx ? `${fx.id}:${fx.moves.map((m) => `${m.from}-${m.to}`).join(',')}` : '';
  const anim = useRef<{ seen: Set<string>; sig: string; n: number; prev: FxMove[]; skip: Map<Square, number> }>({
    seen: new Set([sig]),
    sig: '',
    n: 0,
    prev: [],
    skip: new Map(),
  });
  if (sig && !anim.current.seen.has(sig)) {
    // A move chosen stop by stop was already shown up to the stop (the
    // preview); play only the rest of it.
    const skip = new Map<Square, number>();
    for (const m of fx!.moves) {
      const p = anim.current.prev.find((x) => x.from === m.from);
      if (!p || p.legs.length >= m.legs.length) continue;
      if (p.legs.every((l, i) => l.to === m.legs[i].to)) skip.set(m.from, p.legs.length);
    }
    anim.current = { ...anim.current, sig, n: anim.current.n + 1, prev: fx!.moves, skip };
    anim.current.seen.add(sig);
  }
  const live = fx && anim.current.sig === sig ? fx : null;
  const glides = new Map<Square, Glide>();
  let moverMs = 0;
  let moverTimed: Timed[] = [];
  let moverSkip = 0;
  if (live) {
    live.moves.forEach((m, i) => {
      const skip = anim.current.skip.get(m.from) ?? 0;
      const start = skip ? m.legs[skip - 1].to : m.from;
      const timed = timeLegs(start, m.legs.slice(skip));
      if (i === 0 || !m.after) {
        if (i === 0) {
          moverTimed = timed;
          moverSkip = skip;
        }
        moverMs = Math.max(moverMs, timed.length ? timed[timed.length - 1].end : 0);
      }
      glides.set(m.to, { timed, delay: 0 });
    });
    live.moves.forEach((m) => {
      if (m.after) glides.get(m.to)!.delay = moverMs;
    });
  }
  const sprites: { name: FxName; square: Square; delay: number }[] = [];
  // Captured pieces stay on their squares until the blow lands.
  const ghosts = new Map<Square, { piece: ViewPiece; ms: number }>();
  if (live) {
    live.sprites.forEach((x, i) => {
      const name = x.kind === 'capture' && x.by && captureFx?.[x.by] ? captureFx[x.by]! : (x.kind as FxName);
      // Quake and eclipse ripple along their line; a capture plays when the
      // mover arrives (each one in turn for a chain).
      let delay = x.kind === 'quake' || x.kind === 'eclipse' ? i * 45 : x.kind === 'explode' ? 180 : 0;
      if (x.wait !== undefined) delay = moverMs + x.wait;
      if (x.kind === 'portal' && x.leg !== undefined) {
        // The gate opens a little before the piece gets there.
        if (x.leg < moverSkip) return;
        const t = moverTimed[x.leg - moverSkip];
        delay = t ? Math.max(0, t.end - 260) : 0;
      }
      if (x.kind === 'capture') {
        if (x.leg !== undefined && x.leg < moverSkip) return;
        const t = x.leg !== undefined ? moverTimed[x.leg - moverSkip] : undefined;
        delay = t ? Math.max(0, t.end - 60) : 180;
        if (x.victim && delay > 0) {
          ghosts.set(x.square, {
            piece: { ...x.victim, id: '', illusion: false, frozen: false, onceUsed: false, cooldown: null, passenger: false, platformTurnsLeft: null },
            ms: delay + 60,
          });
        }
      }
      sprites.push({ name, square: x.square, delay });
      if (x.kind === 'quake') sprites.push({ name: 'dust', square: x.square, delay: i * 45 + 120 });
    });
    if (checkSquare !== null) sprites.push({ name: 'check', square: checkSquare, delay: 250 });
  }
  if (celebrate) {
    [27, 34, 64, 73, 45, 56].forEach((s, i) => sprites.push({ name: 'win', square: s, delay: i * 220 }));
  }

  const cells = [];
  for (const r of ranks) {
    for (const f of files) {
      const s = sq(f, r);
      const onBoard = isBoardSquare(s);
      const piece = introHidden?.has(s) ? null : view.cells[s];
      const mark = marks.get(s);
      const classes = ['cell'];
      if (onBoard) classes.push((f + r) % 2 === 0 ? 'dark' : 'light');
      else classes.push('ring');
      if (s === selected) classes.push('selected');
      if (lastMove.has(s)) classes.push('last');
      if (hint.has(s)) classes.push('hint');
      if (preview.has(s)) classes.push('preview');
      if (barrier.has(s)) classes.push('barrier');
      if (s === checkSquare) classes.push('check');
      if (mark) classes.push('clickable');
      if (piece && piece.color === view.color && !piece.illusion) classes.push('own');

      let label: string | null = null;
      if (!onBoard && !piece && !mark) {
        if (r === labelRank && f >= 0 && f <= 7) label = FILES[f];
        else if (f === labelFile && r >= 0 && r <= 7) label = String(r + 1);
      }

      const content = (
        <>
          {piece &&
            (glides.has(s) ? (
              <GlidePiece key={`glide-${anim.current.n}`} glide={glides.get(s)!} orientation={orientation} ring={ring}>
                <PieceView piece={piece} />
              </GlidePiece>
            ) : introLanding?.has(s) ? (
              <span className="intro-land">
                <PieceView piece={piece} />
              </span>
            ) : (
              <PieceView piece={piece} />
            ))}
          {ghosts.has(s) && (
            <span key={`ghost-${anim.current.n}`} className="ghost-victim" style={{ animationDelay: `${ghosts.get(s)!.ms}ms` }}>
              <PieceView piece={ghosts.get(s)!.piece} />
            </span>
          )}
          {mark && <span className={`mark mark-${mark}`} />}
        </>
      );

      cells.push(
        <button
          key={s}
          data-sq={s}
          type="button"
          className={classes.join(' ')}
          onClick={() => onSquare(s)}
          disabled={!onBoard && !piece && !mark}
          aria-label={squareLabel(s, piece, !!mark)}
        >
          {label && <span className="coord">{label}</span>}
          {onBoard ? (
            content
          ) : (
            (piece || mark) && (
              // A platform outside the board is drawn full size, overhanging the frame.
              <span className={`platform-tile ${mark ? 'is-target' : ''} ${s === selected ? 'is-selected' : ''}`}>
                {content}
              </span>
            )
          )}
        </button>,
      );
    }
  }
  return (
    <div
      className={`board ${live?.shake ? 'shake' : ''} ${ring > THIN_RING ? 'wide-ring' : ''}`}
      key={live?.shake ? `shake-${anim.current.n}` : 'board'}
      style={
        {
          gridTemplateColumns: `${ring}fr repeat(8, 1fr) ${ring}fr`,
          gridTemplateRows: `${ring}fr repeat(8, 1fr) ${ring}fr`,
          '--platform': `${(0.9 / TOTAL) * 100}cqw`,
        } as CSSProperties
      }
    >
      {cells}
      <div className="fx-layer" aria-hidden="true">
        {sprites.map((x, i) => {
          const spec = FX[x.name];
          const c = squareCenter(x.square, orientation, ring);
          const cell = 100 / TOTAL;
          return (
            <span
              key={`${anim.current.n}-${celebrate ? 'c' : ''}-${i}`}
              className="fx"
              style={
                {
                  left: `${c.x}%`,
                  top: `${c.y + (spec.dy ?? 0) * cell}%`,
                  width: `${spec.size * cell}cqw`,
                  aspectRatio: `${spec.w} / ${spec.h}`,
                  backgroundImage: `url(assets/fx/${x.name}.png)`,
                  '--n': spec.n,
                  animationDuration: `${spec.ms}ms`,
                  animationDelay: `${x.delay}ms`,
                } as CSSProperties
              }
            />
          );
        })}
      </div>
    </div>
  );
}

function squareLabel(s: Square, piece: ViewPiece | null, marked: boolean): string {
  const f = fileOf(s);
  const r = rankOf(s);
  const name = isBoardSquare(s) ? `${FILES[f]}${r + 1}` : t('платформа за дошкою');
  const suffix = marked ? t(', можна піти') : '';
  if (!piece) return name + suffix;
  return `${name}: ${getCard(piece.cardId).name}${piece.color === 'w' ? t(' (білі)') : t(' (чорні)')}${suffix}`;
}

/** A piece redraws only when something about it changed (views are rebuilt every move). */
export const PieceView = memo(PieceViewInner, (a, b) => {
  const x = a.piece;
  const y = b.piece;
  return (Object.keys(x) as (keyof ViewPiece)[]).every((k) => x[k] === y[k]);
});

function PieceViewInner({ piece }: { piece: ViewPiece }) {
  const card = getCard(piece.cardId);
  const special = !card.id.endsWith('-classic');
  const { blackStyle } = useSettings();
  const sprite = pieceSprite(card.id, piece.type, piece.color, blackStyle);
  const outline = blackStyle === 'team' ? (piece.color === 'w' ? '#3d8bff' : '#ff4d6d') : piece.color === 'w' ? '#0d1326' : '#e9cf87';
  const art = useOutlined(sprite.src, outline);
  return (
    <span
      className={`piece piece-${piece.color} ${blackStyle === 'team' ? 'team' : ''} r-${card.rarity} ${special ? 'special' : ''} ${piece.illusion ? 'illusion' : ''} ${
        sprite.tint ? 'tinted' : ''
      }`}
      title={`${card.name}\n${card.rulesText}`}
    >
      <span className="piece-base" />
      {special && <span className="piece-aura" />}
      <img className={`piece-sprite pixel ${art.baked ? 'baked' : ''}`} src={art.src} alt="" draggable={false} />
      {special && (
        <span className={`piece-emblem ${piece.cooldown === 0 && piece.id ? 'is-ready' : ''}`}>
          <Emblem cardId={card.id} />
        </span>
      )}
      {piece.cooldown !== null && piece.cooldown > 0 && (
        <span className="badge badge-cd" title={t('Перезарядка: ще {0} ход.', piece.cooldown)}>
          <span className="badge-cd-icon">⏳</span>
          {piece.cooldown}
        </span>
      )}
      {piece.frozen && <span className="badge badge-frozen" title={t('Пропускає хід')}>❄</span>}
      {piece.passenger && (
        <span className="badge badge-passenger" title={t('Пішак-пасажир')}>
          <img className="piece-sprite pixel" src={pieceSprite('pawn-classic', 'pawn', piece.color, blackStyle).src} alt="" draggable={false} />
        </span>
      )}
      {piece.platformTurnsLeft !== null && (
        <span className="badge badge-platform" title={t('Ходів суперника до зникнення платформи')}>
          {piece.platformTurnsLeft}
        </span>
      )}
      {piece.illusion && <span className="badge badge-illusion">{t('ілюзія')}</span>}
    </span>
  );
}
