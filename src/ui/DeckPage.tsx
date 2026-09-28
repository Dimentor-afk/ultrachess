import { useEffect, useMemo, useRef, useState } from 'react';
import { CARDS, CARD_BY_ID, PIECE_NAMES, PIECE_ORDER, RARITY_ORDER } from '../engine/cards';
import { cardAt, deckPositions, placeCard, slotType, validateDeck } from '../engine/deck';
import type { Deck, PieceType } from '../engine/types';
import { Emblem } from './art';
import { CardArt, CardView, RarityTag } from './common';
import { Icon } from './icons';
import { errorText, useSession } from './state';

const newDeckId = () => `deck-${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;

export function DeckPage() {
  const s = useSession();
  const saved = s.decks;
  const activeId = s.profile.activeDeckId ?? saved[0]?.id ?? '';
  const [draft, setDraft] = useState<Deck | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const run = async (fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e) {
      s.toast(errorText(e), 'error');
    }
  };
  const onSave = (deck: Deck) =>
    run(async () => {
      s.setDecks(await s.api.saveDeck(deck));
      s.setProfile(await s.api.me().then((p) => p!));
      s.toast(`Колоду «${deck.name}» збережено.`);
      setIsNew(false);
      setDraft(null);
    });
  const onDelete = (id: string) => run(async () => s.setDecks(await s.api.deleteDeck(id)));
  const onActivate = (id: string) => run(async () => s.setProfile(await s.api.setActiveDeck(id)));

  const startNew = (base: Deck | undefined = saved.find((d) => d.id === activeId) ?? saved[0]) => {
    if (!base) return s.toast('Спочатку відкрийте стартовий пак.', 'error');
    setDraft({ ...base, pawnVersions: [...base.pawnVersions], id: newDeckId(), name: saved.includes(base) ? `${base.name} (копія)` : 'Нова колода' });
    setIsNew(true);
  };

  if (draft) {
    return (
      <section className="page">
        <DeckEditor
          key={draft.id}
          draft={draft}
          isNew={isNew}
          owned={s.collection.owned}
          onChange={setDraft}
          onCancel={() => setDraft(null)}
          onSave={() => onSave(draft)}
        />
      </section>
    );
  }

  return (
    <section className="page">
      <div className="page-head page-head-row">
        <div>
          <h1>Колоди</h1>
          <p className="muted">Зберіть 16 фігур із карток своєї колекції: перетягніть їх на дошку. Колода для бою позначена.</p>
        </div>
        <button className="btn btn-primary btn-lg" onClick={() => startNew()}>
          + Нова колода
        </button>
      </div>

      <div className="deck-grid">
        {saved.map((d) => (
          <article key={d.id} className={`deck-tile ${d.id === activeId ? 'active' : ''}`}>
            <MiniBoard deck={d} />
            <div className="deck-tile-body">
              <div className="deck-tile-title">
                <strong>{d.name}</strong>
                {d.id === activeId && <span className="pill pill-ok">у бій</span>}
              </div>
              <DeckSummary deck={d} />
              <div className="deck-item-actions">
                {d.id !== activeId && (
                  <button className="btn btn-sm" onClick={() => onActivate(d.id)}>
                    Брати в бій
                  </button>
                )}
                <button
                  className="btn btn-sm"
                  onClick={() => {
                    setDraft({ ...d, pawnVersions: [...d.pawnVersions] });
                    setIsNew(false);
                  }}
                >
                  Змінити
                </button>
                <button className="btn btn-sm" onClick={() => startNew(d)}>
                  Копія
                </button>
                {saved.length > 1 && (
                  <button
                    className="btn btn-sm btn-danger"
                    onClick={() => {
                      if (confirmDelete !== d.id) return setConfirmDelete(d.id);
                      setConfirmDelete(null);
                      onDelete(d.id);
                    }}
                    onBlur={() => setConfirmDelete(null)}
                  >
                    {confirmDelete === d.id ? 'Точно видалити?' : 'Видалити'}
                  </button>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function DeckSummary({ deck }: { deck: Deck }) {
  const counts: Record<string, number> = { rare: 0, epic: 0, legendary: 0, mythological: 0 };
  for (const id of new Set(deckPositions(deck))) {
    const r = CARD_BY_ID[id]?.rarity;
    if (r && r in counts) counts[r]++;
  }
  const parts = Object.entries(counts).filter(([, n]) => n > 0);
  return (
    <span className="deck-summary">
      {parts.length === 0
        ? 'тільки звичайні картки'
        : parts.map(([r, n]) => (
            <span key={r} className={`dot-count r-${r}`}>
              {n}
            </span>
          ))}
    </span>
  );
}

/** Small read-only picture of the deck's two ranks. */
export function MiniBoard({ deck }: { deck: Deck }) {
  return (
    <div className="mini-board">
      {[8, 9, 10, 11, 12, 13, 14, 15, 0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
        const card = CARD_BY_ID[cardAt(deck, i)];
        const file = i % 8;
        const light = (file + (i >= 8 ? 1 : 0)) % 2 === 1;
        return (
          <div key={i} className={`mini-sq ${light ? 'light' : 'dark'} r-${card.rarity}`} title={card.name}>
            <CardArt cardId={card.id} />
            {!card.id.endsWith('-classic') && <span className="mini-dot" />}
          </div>
        );
      })}
    </div>
  );
}

// ── Drag & drop editor ──

const FILES = 'abcdefgh';

interface DragState {
  cardId: string;
  x: number;
  y: number;
}

interface EditorProps {
  draft: Deck;
  isNew: boolean;
  owned: Record<string, { dupes: number }>;
  onChange: (d: Deck) => void;
  onCancel: () => void;
  onSave: () => void;
}

function DeckEditor({ draft, isNew, owned, onChange, onCancel, onSave }: EditorProps) {
  const errors = useMemo(() => validateDeck(draft), [draft]);
  const [selected, setSelected] = useState<number>(4);
  const [filter, setFilter] = useState<PieceType | 'auto'>('auto');
  const [message, setMessage] = useState<{ text: string; bad: boolean } | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [inspect, setInspect] = useState<string | null>(null);
  const pressRef = useRef<{ cardId: string; x: number; y: number; started: boolean } | null>(null);

  const selectedType = slotType(selected);
  const shownType: PieceType = filter === 'auto' ? selectedType : filter;
  const collection = CARDS.filter((c) => c.pieceType === shownType).sort(
    (a, b) => RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity),
  );
  const dragType = drag ? CARD_BY_ID[drag.cardId].pieceType : null;
  const inspected = CARD_BY_ID[inspect ?? cardAt(draft, selected)];

  const place = (index: number, cardId: string, allPawns = false) => {
    if (!owned[cardId]) {
      setMessage({ text: `«${CARD_BY_ID[cardId].name}» ще не відкрита — шукайте її в паках.`, bad: true });
      return;
    }
    const res = placeCard(draft, index, cardId, allPawns);
    if (!res.deck) {
      setMessage({ text: res.error, bad: true });
      return;
    }
    onChange(res.deck);
    setSelected(index);
    setInspect(null);
    const name = CARD_BY_ID[cardId].name;
    setMessage({ text: allPawns ? `«${name}» на всіх 8 пішаках.` : `«${name}» поставлено на ${squareName(index)}.`, bad: false });
  };

  // Pointer-based drag so it works with a mouse and on touch screens alike.
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const p = pressRef.current;
      if (!p) return;
      if (!p.started && Math.hypot(e.clientX - p.x, e.clientY - p.y) < 6) return;
      p.started = true;
      setDrag({ cardId: p.cardId, x: e.clientX, y: e.clientY });
    };
    const up = (e: PointerEvent) => {
      const p = pressRef.current;
      pressRef.current = null;
      if (!p) return;
      if (!p.started) {
        // A tap: put the card on the selected square.
        place(selected, p.cardId);
        return;
      }
      setDrag(null);
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-drop]');
      if (!el) return;
      const target = el.dataset.drop!;
      if (target === 'all-pawns') place(8, p.cardId, true);
      else place(Number(target), p.cardId);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  });

  const square = (index: number) => {
    const card = CARD_BY_ID[cardAt(draft, index)];
    const file = index % 8;
    const light = (file + (index >= 8 ? 1 : 0)) % 2 === 1;
    const fits = dragType !== null && dragType === slotType(index);
    return (
      <button
        key={index}
        type="button"
        data-drop={index}
        className={`deck-sq ${light ? 'light' : 'dark'} ${selected === index ? 'selected' : ''} ${fits ? 'can-drop' : ''} ${
          dragType && !fits ? 'no-drop' : ''
        }`}
        onClick={() => {
          setSelected(index);
          setInspect(null);
          setFilter('auto');
        }}
        aria-label={`${squareName(index)}: ${card.name}`}
      >
        <span className={`deck-piece r-${card.rarity}`}>
          {!card.id.endsWith('-classic') && <span className="piece-aura" />}
          <CardArt cardId={card.id} className="deck-art" />
          {!card.id.endsWith('-classic') && (
            <span className="piece-emblem">
              <Emblem cardId={card.id} />
            </span>
          )}
        </span>
        <span className="deck-sq-name">{card.name}</span>
      </button>
    );
  };

  const pawnVersions = draft.pawnVersions.map((id) => CARD_BY_ID[id]);

  return (
    <div className="deck-editor">
      <div className="editor-bar">
        <input
          className="deck-name"
          aria-label="Назва колоди"
          value={draft.name}
          maxLength={40}
          onChange={(e) => onChange({ ...draft, name: e.target.value })}
        />
        <div className="editor-actions">
          <button className="btn btn-primary" disabled={errors.length > 0} onClick={onSave}>
            Зберегти колоду
          </button>
          <button className="btn" onClick={onCancel}>
            {isNew ? 'Скасувати' : 'Закрити'}
          </button>

        </div>
      </div>
      {errors.length > 0 && (
        <ul className="errors" aria-live="polite">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}

      <div className="builder">
        <div className="builder-board-col">
          <div className="builder-board">
            <div className="builder-rank">
              <span className="rank-label">2</span>
              {[8, 9, 10, 11, 12, 13, 14, 15].map(square)}
            </div>
            <div className="builder-rank">
              <span className="rank-label">1</span>
              {[0, 1, 2, 3, 4, 5, 6, 7].map(square)}
            </div>
            <div className="builder-files">
              <span />
              {FILES.split('').map((f) => (
                <span key={f}>{f}</span>
              ))}
            </div>
          </div>

          <div
            data-drop="all-pawns"
            className={`all-pawns-drop ${dragType === 'pawn' ? 'can-drop' : ''}`}
          >
            Перетягніть сюди пішака, щоб поставити його на всі 8 клітинок
          </div>

          <div className="pawn-versions">
            <span className="muted small">Версії пішаків:</span>
            {pawnVersions.map((c, i) => (
              <span key={c.id} className={`version-chip r-${c.rarity}`}>
                <b>{i + 1}</b> {c.name}
              </span>
            ))}
            {pawnVersions.length === 2 && <span className="mono muted small">формація {draft.pawnFormation}</span>}
          </div>

          {message && <p className={message.bad ? 'error-text' : 'ok-text'}>{message.text}</p>}

          <div className="inspect">
            <p className="muted small">
              {inspect ? 'Картка з колекції' : `Клітинка ${squareName(selected)}`}
            </p>
            <CardView card={inspected} />
          </div>
        </div>

        <aside className="collection panel">
          <div className="collection-head">
            <h2>Колекція</h2>
            <span className="muted small">
              Тягніть картку на дошку або натисніть її — вона стане на {squareName(selected)}
            </span>
          </div>
          <div className="chip-row">
            <button className={`chip ${filter === 'auto' ? 'on' : ''}`} onClick={() => setFilter('auto')}>
              Для {squareName(selected)}
            </button>
            {PIECE_ORDER.map((t) => (
              <button key={t} className={`chip ${filter === t ? 'on' : ''}`} onClick={() => setFilter(t)}>
                {PIECE_NAMES[t]}
              </button>
            ))}
          </div>
          <div className="mini-cards">
            {collection.map((c) => {
              const inDeck = deckPositions(draft).includes(c.id);
              const locked = !owned[c.id];
              return (
                <div
                  key={c.id}
                  className={`mini-card r-${c.rarity} ${inDeck ? 'in-deck' : ''} ${locked ? 'locked' : ''} ${drag?.cardId === c.id ? 'dragging' : ''}`}
                  onPointerDown={(e) => {
                    if (e.button !== 0 || locked) return;
                    e.preventDefault();
                    pressRef.current = { cardId: c.id, x: e.clientX, y: e.clientY, started: false };
                  }}
                  onMouseEnter={() => setInspect(c.id)}
                  onMouseLeave={() => setInspect(null)}
                  title={c.rulesText}
                >
                  <div className="mini-card-art">
                    <CardArt cardId={c.id} />
                    {locked && (
                      <span className="mini-lock">
                        <Icon name="lock" />
                      </span>
                    )}
                    <span className="mini-card-emblem">
                      <Emblem cardId={c.id} />
                    </span>
                  </div>
                  <div className="mini-card-body">
                    <strong>{c.name}</strong>
                    <RarityTag card={c} />
                  </div>
                  {inDeck && <span className="in-deck-mark">у колоді</span>}
                </div>
              );
            })}
          </div>
        </aside>
      </div>

      {drag && (
        <div className={`drag-ghost r-${CARD_BY_ID[drag.cardId].rarity}`} style={{ left: drag.x, top: drag.y }}>
          <CardArt cardId={drag.cardId} />
          <span>{CARD_BY_ID[drag.cardId].name}</span>
        </div>
      )}
    </div>
  );
}

function squareName(index: number): string {
  return `${FILES[index % 8]}${index >= 8 ? 2 : 1}`;
}
