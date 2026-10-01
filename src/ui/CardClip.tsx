import { useEffect, useMemo, useState, type CSSProperties, type JSX } from 'react';
import { CARD_BY_ID } from '../engine/cards';
import { fileOf, isBoardSquare, rankOf } from '../engine/coords';
import type { Position, Square } from '../engine/types';
import { cardArt, pieceSprite } from './cardArt';
import { buildDemo } from './cardDemo';
import { stopsOf } from './stage';

type Phase = 'idle' | 'marks' | 'play' | 'done';

/** Clip timing, ms. */
const IDLE = 700;
const MARKS = 1500;
const STEP = 320;
const DONE = 1500;

const pct = (s: Square) => ({ left: `${fileOf(s) * 12.5}%`, top: `${(7 - rankOf(s)) * 12.5}%` });

/**
 * A looping clip like the card videos in Clash Royale: the piece on a small
 * board, every move it has (ends of moves with stops in violet), then its
 * most telling move played step by step, then the result.
 */
export function CardClip({ cardId }: { cardId: string }) {
  const demo = useMemo(() => buildDemo(cardId), [cardId]);
  const [phase, setPhase] = useState<Phase>('idle');
  const [step, setStep] = useState(0);
  const [round, setRound] = useState(0);

  // The squares the piece walks through, on the board only (a portal jumps).
  const walk = useMemo(() => (demo ? demo.move.path.filter((s) => isBoardSquare(s)) : []), [demo]);

  useEffect(() => {
    if (!demo) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      setPhase('marks');
      return;
    }
    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));
    setPhase('idle');
    setStep(0);
    let t = IDLE;
    at(t, () => setPhase('marks'));
    t += MARKS;
    at(t, () => setPhase('play'));
    for (let i = 1; i <= walk.length; i++) at(t + i * STEP, () => setStep(i));
    t += (walk.length + 1) * STEP;
    at(t, () => setPhase('done'));
    t += DONE;
    at(t, () => setRound((r) => r + 1));
    return () => timers.forEach(clearTimeout);
  }, [demo, walk, round]);

  if (!demo) return null;
  const { before, after, move, moves, pieceId } = demo;
  const shown: Position = phase === 'done' ? after : before;
  const moverAt = phase === 'play' ? (walk[step - 1] ?? move.from) : phase === 'done' ? null : move.from;
  const reached = new Set(phase === 'play' ? walk.slice(0, step) : []);

  // Marks like on the game board: first stops, and violet ends of moves with stops.
  const marks = new Map<Square, string>();
  if (phase === 'marks') {
    for (const m of moves) {
      const first = stopsOf(m)[0];
      marks.set(first, m.captures.includes(first) || marks.get(first) === 'capture' ? 'capture' : 'move');
    }
    for (const m of moves) {
      const st = stopsOf(m);
      const end = st[st.length - 1];
      if (st.length > 1 && !marks.has(end)) marks.set(end, m.captures.includes(end) ? 'far-capture' : 'far');
    }
  }

  const squares = [];
  for (let r = 7; r >= 0; r--) {
    for (let f = 0; f < 8; f++) squares.push(<span key={`${f}${r}`} className={(f + r) % 2 ? 'clip-sq light' : 'clip-sq dark'} />);
  }

  const pieces: JSX.Element[] = [];
  shown.board.forEach((p, s) => {
    if (!p || !isBoardSquare(s)) return;
    const mover = phase !== 'done' && p.id === pieceId;
    if (mover) return;
    const taken = move.captures.includes(s) && reached.has(s);
    pieces.push(
      <img
        key={`${p.id}-${phase === 'done' ? 'a' : 'b'}`}
        className={`clip-piece pixel ${taken ? 'taken' : ''} ${p.id === pieceId ? 'clip-hero' : ''}`}
        src={pieceSprite(p.cardId, p.type, p.color, 'dark').src}
        alt=""
        style={pct(s)}
      />,
    );
  });

  return (
    <figure className="clip" aria-label={`Як ходить ${CARD_BY_ID[cardId].name}: ${move.label}`}>
      <div className="clip-board">
        {squares}
        {[...marks].map(([s, kind]) => (
          <span key={`m${s}`} className={`clip-cell clip-${kind}`} style={pct(s)}>
            <span />
          </span>
        ))}
        {pieces}
        {moverAt !== null && (
          <img className="clip-piece clip-hero clip-mover pixel" src={cardArt(cardId) ?? ''} alt="" style={pct(moverAt)} />
        )}
        {phase === 'play' && step > 0 && <span className="clip-cell clip-trail" style={pct(walk[step - 1])} />}
        <span className="clip-rec">▶ ПОВТОР</span>
      </div>
      <figcaption>
        <span className="clip-label">{move.label}</span>
        <span className="clip-progress">
          <span key={round} style={{ '--clip-ms': `${IDLE + MARKS + (walk.length + 1) * STEP + DONE}ms` } as CSSProperties} />
        </span>
      </figcaption>
    </figure>
  );
}
