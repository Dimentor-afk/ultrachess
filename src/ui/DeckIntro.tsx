import { useEffect, useState } from 'react';
import { CARD_BY_ID } from '../engine/cards';
import { deckPositions } from '../engine/deck';
import type { Deck } from '../engine/types';
import { Emblem } from './art';
import { CardArt, RarityTag } from './common';
import { play } from './settings';

const GROUPS: { label: string; keys: (keyof Deck)[] | 'pawns' }[] = [
  { label: 'Пішаки', keys: 'pawns' },
  { label: 'Тури', keys: ['rook1', 'rook2'] },
  { label: 'Коні', keys: ['knight1', 'knight2'] },
  { label: 'Слони', keys: ['bishop1', 'bishop2'] },
  { label: 'Король', keys: ['king'] },
  { label: 'Ферзь', keys: ['queen'] },
];

const STEP_MS = 750;

/** Cards of a group with how many pieces use each. */
function groupCards(deck: Deck, keys: (keyof Deck)[] | 'pawns'): { id: string; count: number }[] {
  const ids = keys === 'pawns' ? deckPositions(deck).slice(0, 8) : keys.map((k) => deck[k] as string);
  const out: { id: string; count: number }[] = [];
  for (const id of ids) {
    const e = out.find((x) => x.id === id);
    if (e) e.count++;
    else out.push({ id, count: 1 });
  }
  return out;
}

/**
 * Match intro: the opponent's deck flies onto the screen group by group
 * (pawns, rooks, knights, bishops, king, queen), so you know what you face.
 */
export function DeckIntro({ deck, opponent, onDone }: { deck: Deck; opponent: string; onDone: () => void }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (shown >= GROUPS.length) return;
    const t = setTimeout(() => {
      setShown((n) => n + 1);
      play('click');
    }, shown === 0 ? 350 : STEP_MS);
    return () => clearTimeout(t);
  }, [shown]);

  const done = shown >= GROUPS.length;
  return (
    <div className="deck-intro" role="dialog" aria-label={`Колода суперника: ${opponent}`}>
      <div className="deck-intro-head">
        <span className="eyebrow">Ваш суперник</span>
        <h2>{opponent}</h2>
        <span className="muted">{deck.name}</span>
      </div>
      <div className="deck-intro-groups">
        {GROUPS.slice(0, shown).map((g) => (
          <div key={g.label} className="intro-group">
            <span className="intro-label">{g.label}</span>
            <div className="intro-cards">
              {groupCards(deck, g.keys).map((c, i) => {
                const card = CARD_BY_ID[c.id];
                return (
                  <div key={c.id} className={`intro-card r-${card.rarity}`} style={{ animationDelay: `${i * 90}ms` }}>
                    <div className="intro-art">
                      <CardArt cardId={c.id} />
                      {!c.id.endsWith('-classic') && (
                        <span className="mini-card-emblem">
                          <Emblem cardId={c.id} />
                        </span>
                      )}
                      {c.count > 1 && <span className="intro-count">×{c.count}</span>}
                    </div>
                    <b>{card.name}</b>
                    <RarityTag card={card} />
                    <small className="intro-rules">{card.rulesText}</small>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="deck-intro-actions">
        {done ? (
          <button className="btn btn-primary btn-lg" onClick={onDone} autoFocus>
            У бій!
          </button>
        ) : (
          <button className="btn btn-ghost" onClick={onDone}>
            Пропустити
          </button>
        )}
      </div>
    </div>
  );
}
