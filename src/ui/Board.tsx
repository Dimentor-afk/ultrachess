import { type CSSProperties, useRef } from 'react';
import { getCard } from '../engine/cards';
import { fileOf, isBoardSquare, rankOf, sq } from '../engine/coords';
import type { Color, Square } from '../engine/types';
import type { PlayerView, ViewPiece } from '../engine/view';
import { Emblem } from './art';
import { pieceSprite } from './cardArt';
import { FX, type FxName } from './fxSprites';
import { useSettings } from './settings';

export type Mark = 'move' | 'capture' | 'option' | 'stay';

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
}

const FILES = 'abcdefgh';

export function Board({ view, orientation, selected, marks, lastMove, hint, preview, checkSquare, onSquare, celebrate = false, captureFx }: Props) {
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
  const anim = useRef<{ seen: Set<string>; sig: string; n: number }>({ seen: new Set([sig]), sig: '', n: 0 });
  if (sig && !anim.current.seen.has(sig)) {
    anim.current.seen.add(sig);
    anim.current.sig = sig;
    anim.current.n++;
  }
  const live = fx && anim.current.sig === sig ? fx : null;
  const slides = new Map<Square, { style: CSSProperties; cls: string }>();
  for (const m of live?.moves ?? []) {
    const a = squareCenter(m.from, orientation, ring);
    const b = squareCenter(m.to, orientation, ring);
    slides.set(m.to, {
      cls: `slide slide-${m.style}`,
      style: { '--dx': `${a.x - b.x}cqw`, '--dy': `${a.y - b.y}cqw` } as CSSProperties,
    });
  }
  const sprites: { name: FxName; square: Square; delay: number }[] = [];
  if (live) {
    live.sprites.forEach((x, i) => {
      const name = x.kind === 'capture' && x.by && captureFx?.[x.by] ? captureFx[x.by]! : (x.kind as FxName);
      // Quake and eclipse ripple along their line.
      const delay = x.kind === 'quake' || x.kind === 'eclipse' ? i * 45 : x.kind === 'capture' || x.kind === 'explode' ? 180 : 0;
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
      const piece = view.cells[s];
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
            (slides.has(s) ? (
              <span key={`slide-${anim.current.n}`} className={slides.get(s)!.cls} style={slides.get(s)!.style}>
                <PieceView piece={piece} />
              </span>
            ) : (
              <PieceView piece={piece} />
            ))}
          {mark && <span className={`mark mark-${mark}`} />}
        </>
      );

      cells.push(
        <button
          key={s}
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
  const name = isBoardSquare(s) ? `${FILES[f]}${r + 1}` : 'платформа за дошкою';
  const suffix = marked ? ', можна піти' : '';
  if (!piece) return name + suffix;
  return `${name}: ${getCard(piece.cardId).name}${piece.color === 'w' ? ' (білі)' : ' (чорні)'}${suffix}`;
}

export function PieceView({ piece }: { piece: ViewPiece }) {
  const card = getCard(piece.cardId);
  const special = !card.id.endsWith('-classic');
  const { blackStyle } = useSettings();
  const sprite = pieceSprite(card.id, piece.type, piece.color, blackStyle);
  return (
    <span
      className={`piece piece-${piece.color} ${blackStyle === 'team' ? 'team' : ''} r-${card.rarity} ${special ? 'special' : ''} ${piece.illusion ? 'illusion' : ''} ${
        sprite.tint ? 'tinted' : ''
      }`}
      title={`${card.name}\n${card.rulesText}`}
    >
      <span className="piece-base" />
      {special && <span className="piece-aura" />}
      <img className="piece-sprite pixel" src={sprite.src} alt="" draggable={false} />
      {special && (
        <span className={`piece-emblem ${piece.cooldown === 0 && piece.id ? 'is-ready' : ''}`}>
          <Emblem cardId={card.id} />
        </span>
      )}
      {piece.cooldown !== null && piece.cooldown > 0 && (
        <span className="badge badge-cd" title={`Перезарядка: ще ${piece.cooldown} ход.`}>
          <span className="badge-cd-icon">⏳</span>
          {piece.cooldown}
        </span>
      )}
      {piece.frozen && <span className="badge badge-frozen" title="Пропускає хід">❄</span>}
      {piece.passenger && (
        <span className="badge badge-passenger" title="Пішак-пасажир">
          <img className="piece-sprite pixel" src={pieceSprite('pawn-classic', 'pawn', piece.color, blackStyle).src} alt="" draggable={false} />
        </span>
      )}
      {piece.platformTurnsLeft !== null && (
        <span className="badge badge-platform" title="Ходів суперника до зникнення платформи">
          {piece.platformTurnsLeft}
        </span>
      )}
      {piece.illusion && <span className="badge badge-illusion">ілюзія</span>}
    </span>
  );
}
