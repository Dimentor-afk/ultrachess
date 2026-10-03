import { useEffect, useRef, useState } from 'react';
import { CARD_BY_ID } from '../engine/cards';
import type { PlayerView } from '../engine/view';
import type { Color, PieceType, Square } from '../engine/types';
import { CardView } from './common';
import { play } from './settings';
import { t } from '../i18n';

export interface IntroStep {
  cardId: string;
  squares: Square[];
}

const ORDER: PieceType[] = ['pawn', 'rook', 'knight', 'bishop', 'king', 'queen'];
const GROUP_NAME: Record<PieceType, string> = {
  pawn: t('Пішаки'),
  rook: t('Тури'),
  knight: t('Коні'),
  bishop: t('Слони'),
  king: t('Король'),
  queen: t('Ферзь'),
};

/** The opponent's starting pieces, one step per card: pawns, rooks, knights, bishops, king, queen. */
export function introSteps(view: PlayerView, opponent: Color): IntroStep[] {
  const steps: (IntroStep & { type: PieceType })[] = [];
  view.cells.forEach((p, s) => {
    if (!p || p.color !== opponent) return;
    const step = steps.find((x) => x.cardId === p.cardId);
    if (step) step.squares.push(s);
    else steps.push({ cardId: p.cardId, type: p.type, squares: [s] });
  });
  return steps.sort((a, b) => ORDER.indexOf(a.type) - ORDER.indexOf(b.type)).map(({ cardId, squares }) => ({ cardId, squares }));
}

const ENTER_MS = 380;
const HOLD_MS = 520;
const LAND_MS = 380;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Match intro: each of the opponent's cards flies in big, then shrinks onto
 * its squares, where the pieces appear (`onLand`). When the last one lands
 * the game starts by itself; «Пропустити» ends it at once.
 */
export function DeckIntro({
  steps,
  opponent,
  color,
  onLand,
  onDone,
}: {
  steps: IntroStep[];
  opponent: string;
  color: Color;
  onLand: (landed: number) => void;
  onDone: () => void;
}) {
  const [index, setIndex] = useState(0);
  const cardRef = useRef<HTMLDivElement>(null);
  const done = useRef(onDone);
  const land = useRef(onLand);
  done.current = onDone;
  land.current = onLand;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await wait(300);
      for (let i = 0; i < steps.length && !cancelled; i++) {
        setIndex(i);
        await wait(40);
        const el = cardRef.current;
        if (!el || cancelled) return;
        const base = 'translate(-50%, -50%)';
        await el.animate(
          [
            { transform: `${base} translate(70vw, -10vh) rotate(25deg) scale(0.5)`, opacity: 0 },
            { transform: `${base} rotate(-3deg) scale(1.05)`, opacity: 1, offset: 0.8 },
            { transform: `${base}`, opacity: 1 },
          ],
          { duration: ENTER_MS, easing: 'cubic-bezier(0.2, 0.9, 0.3, 1)', fill: 'forwards' },
        ).finished;
        play('click');
        await wait(HOLD_MS);
        if (cancelled) return;
        const target = centerOf(steps[i].squares);
        const dx = target ? target.x - window.innerWidth / 2 : 0;
        const dy = target ? target.y - window.innerHeight / 2 : window.innerHeight / 3;
        await el.animate(
          [
            { transform: base, opacity: 1 },
            { transform: `${base} translate(${dx}px, ${dy}px) scale(0.16)`, opacity: 0.35 },
          ],
          { duration: LAND_MS, easing: 'cubic-bezier(0.5, 0, 0.8, 0.6)', fill: 'forwards' },
        ).finished;
        if (cancelled) return;
        land.current(i + 1);
        play('move');
      }
      await wait(650);
      if (!cancelled) done.current();
    })();
    return () => {
      cancelled = true;
    };
  }, [steps]);

  const step = steps[index];
  const card = step ? CARD_BY_ID[step.cardId] : null;
  return (
    <div className="deck-intro" aria-label={t('Колода суперника: {0}', opponent)}>
      <div className="deck-intro-head">
        <span className="eyebrow">{t('Колода суперника · {0}', opponent)}</span>
        {card && (
          <b key={index} className="intro-group-name">
            {GROUP_NAME[card.pieceType]}
            {step.squares.length > 1 && <span className="muted"> ×{step.squares.length}</span>}
          </b>
        )}
      </div>
      {card && (
        <div ref={cardRef} className="intro-big-card" key={index}>
          <CardView card={card} color={color} />
        </div>
      )}
      <button className="btn btn-ghost intro-skip" onClick={onDone}>
        {t('Пропустити ⏭')}
      </button>
    </div>
  );
}

function centerOf(squares: Square[]): { x: number; y: number } | null {
  let x = 0;
  let y = 0;
  let n = 0;
  for (const s of squares) {
    const el = document.querySelector(`.board .cell[data-sq="${s}"]`);
    if (!el) continue;
    const r = el.getBoundingClientRect();
    x += r.left + r.width / 2;
    y += r.top + r.height / 2;
    n++;
  }
  return n ? { x: x / n, y: y / n } : null;
}
