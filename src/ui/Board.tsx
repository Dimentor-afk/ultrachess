import { getCard } from '../engine/cards';
import { fileOf, isBoardSquare, rankOf, sq } from '../engine/coords';
import type { Color, Square } from '../engine/types';
import type { PlayerView, ViewPiece } from '../engine/view';
import { Emblem } from './art';
import { pieceSprite } from './cardArt';

export type Mark = 'move' | 'capture' | 'option';

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
}

const FILES = 'abcdefgh';

export function Board({ view, orientation, selected, marks, lastMove, hint, preview, checkSquare, onSquare }: Props) {
  const barrier = new Set(view.barriers.flatMap((b) => b.squares));
  const ranks = orientation === 'w' ? [8, 7, 6, 5, 4, 3, 2, 1, 0, -1] : [-1, 0, 1, 2, 3, 4, 5, 6, 7, 8];
  const files = orientation === 'w' ? [-1, 0, 1, 2, 3, 4, 5, 6, 7, 8] : [8, 7, 6, 5, 4, 3, 2, 1, 0, -1];
  const labelRank = orientation === 'w' ? -1 : 8;
  const labelFile = orientation === 'w' ? -1 : 8;

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
          {piece && <PieceView piece={piece} />}
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
  return <div className="board">{cells}</div>;
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
  return (
    <span
      className={`piece piece-${piece.color} r-${card.rarity} ${special ? 'special' : ''} ${piece.illusion ? 'illusion' : ''}`}
      title={`${card.name}\n${card.rulesText}`}
    >
      <span className="piece-base" />
      {special && <span className="piece-aura" />}
      <img className="piece-sprite pixel" src={pieceSprite(card.id, piece.type)} alt="" draggable={false} />
      {special && (
        <span className="piece-emblem">
          <Emblem cardId={card.id} />
        </span>
      )}
      {piece.frozen && <span className="badge badge-frozen" title="Пропускає хід">❄</span>}
      {piece.passenger && (
        <span className="badge badge-passenger" title="Пішак-пасажир">
          <img className="piece-sprite pixel" src={pieceSprite('pawn-classic', 'pawn')} alt="" draggable={false} />
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
