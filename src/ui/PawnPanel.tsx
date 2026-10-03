import { CARD_BY_ID } from '../engine/cards';
import { deckPositions, withPawns } from '../engine/deck';
import type { Deck } from '../engine/types';
import { CardArt } from './common';

const FILES = 'abcdefgh';

/**
 * The deck's pawns: up to two kinds in any order. Two tiles show the kinds;
 * below them the pawn rank a–h in miniature, where a tap switches a pawn to
 * the other kind. A pawn card dropped (or placed) on a tile takes over every
 * square of that kind; on the empty second tile it becomes the second kind on
 * the e–h half.
 */
export function PawnPanel({
  deck,
  armed,
  dragging,
  onChange,
  onTileTap,
  onInfo,
}: {
  deck: Deck;
  /** The pawn card waiting to be placed (tapped "Використати"), if any. */
  armed: string | null;
  /** A pawn card is being dragged: the tiles light up as drop targets. */
  dragging: boolean;
  onChange: (d: Deck, note: string) => void;
  /** An empty or occupied tile tapped with no card in hand. */
  onTileTap: (kind: 0 | 1) => void;
  onInfo: (cardId: string) => void;
}) {
  const pawns = deckPositions(deck).slice(0, 8);
  const kinds = deck.pawnVersions;
  const two = kinds.length === 2;
  const count = (id: string) => pawns.filter((p) => p === id).length;

  const putKind = (k: 0 | 1, cardId: string) => {
    const r = replacePawnKind(deck, k, cardId);
    onChange(r.deck, r.note);
  };

  const flip = (i: number) => {
    if (!two) return;
    const next = [...pawns];
    next[i] = pawns[i] === kinds[0] ? kinds[1] : kinds[0];
    // Both kinds stay: the last pawn of a kind does not switch away.
    if (new Set(next).size < 2) return onChange(deck, 'Це останній пішак цього виду. Щоб прибрати вид, натисніть ✕ на його плитці.');
    onChange(withPawns(deck, next), `${FILES[i]}2: ${CARD_BY_ID[next[i]].name}.`);
  };

  const tile = (k: 0 | 1) => {
    const id = kinds[k];
    const canDrop = dragging || (armed !== null && CARD_BY_ID[armed]?.pieceType === 'pawn');
    return (
      <div
        key={k}
        role="button"
        tabIndex={0}
        data-drop={`pawn-kind-${k}`}
        className={`pawn-kind kind-${k} ${id ? '' : 'empty'} ${canDrop ? 'can-drop' : ''}`}
        onClick={() => (armed && CARD_BY_ID[armed]?.pieceType === 'pawn' ? putKind(k, armed) : id ? onInfo(id) : onTileTap(k))}
      >
        {id ? (
          <>
            <CardArt cardId={id} className="pawn-kind-art" />
            <span className="pawn-kind-text">
              <b>{CARD_BY_ID[id].name}</b>
              <small>{count(id)} з 8</small>
            </span>
            {k === 1 && (
              <button
                type="button"
                className="pawn-kind-remove"
                aria-label="Прибрати другий вид"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(withPawns(deck, pawns.map(() => kinds[0])), `Усі 8 пішаків — «${CARD_BY_ID[kinds[0]].name}».`);
                }}
              >
                ✕
              </button>
            )}
          </>
        ) : (
          <span className="pawn-kind-text">
            <b>+ Другий вид</b>
            <small>{canDrop ? 'Сюди — стане на e–h' : 'необов’язково'}</small>
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="pawn-panel">
      <div className="pawn-kinds">
        {tile(0)}
        {tile(1)}
      </div>
      {two && (
        <>
          <div className="pawn-rank" aria-label="Розстановка пішаків">
            {pawns.map((p, i) => (
              <button key={i} type="button" className={`pawn-file kind-${p === kinds[0] ? 0 : 1}`} onClick={() => flip(i)} aria-label={`${FILES[i]}2: ${CARD_BY_ID[p].name}`}>
                <CardArt cardId={p} className="pawn-file-art" />
                <span>{FILES[i]}</span>
              </button>
            ))}
          </div>
          <p className="pawn-hint">Натисніть пішака, щоб змінити його вид.</p>
        </>
      )}
    </div>
  );
}

/**
 * `cardId` in place of pawn kind `k` on all its squares; on an empty second
 * kind it becomes the second kind on the e–h half.
 */
export function replacePawnKind(deck: Deck, k: 0 | 1, cardId: string): { deck: Deck; note: string } {
  const pawns = deckPositions(deck).slice(0, 8);
  const kinds = deck.pawnVersions;
  const name = CARD_BY_ID[cardId].name;
  if (kinds.includes(cardId)) return { deck, note: `«${name}» уже в колоді.` };
  if (k === 1 && kinds.length < 2) {
    return {
      deck: withPawns(deck, pawns.map((p, i) => (i >= 4 ? cardId : p))),
      note: `«${name}» — другий вид пішаків, на e–h. Натисніть пішака в ряду, щоб змінити розстановку.`,
    };
  }
  const old = kinds[k];
  return { deck: withPawns(deck, pawns.map((p) => (p === old ? cardId : p))), note: `«${name}» замість «${CARD_BY_ID[old].name}».` };
}

/** Index of a pawn-kind drop target ("pawn-kind-0" → 0), or null. */
export function pawnKindTarget(drop: string): 0 | 1 | null {
  return drop === 'pawn-kind-0' ? 0 : drop === 'pawn-kind-1' ? 1 : null;
}
