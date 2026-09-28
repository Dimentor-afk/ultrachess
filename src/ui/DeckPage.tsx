import { useMemo, useState } from 'react';
import { CARDS, CARD_BY_ID, RARITY_NAMES, RARITY_ORDER } from '../engine/cards';
import { DECK_SLOTS, FORMATION_PRESETS, classicDeck, deckPositions, validateDeck } from '../engine/deck';
import type { Deck } from '../engine/types';
import { CardView, Glyph, RarityTag } from './common';
import { CLASSIC_DECK, newDeckId } from './storage';

interface Props {
  saved: Deck[];
  activeId: string;
  onSave: (deck: Deck) => void;
  onDelete: (id: string) => void;
  onActivate: (id: string) => void;
}

const PAWN_CARDS = CARDS.filter((c) => c.pieceType === 'pawn');

export function DeckPage({ saved, activeId, onSave, onDelete, onActivate }: Props) {
  const [draft, setDraft] = useState<Deck | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const startNew = (base: Deck = CLASSIC_DECK) => {
    setDraft({ ...base, pawnVersions: [...base.pawnVersions], id: newDeckId(), name: base === CLASSIC_DECK ? 'Нова колода' : `${base.name} (копія)` });
    setIsNew(true);
  };

  return (
    <section className="page">
      <div className="page-head">
        <h1>Конструктор колоди</h1>
        <p className="muted">
          16 позицій: 8 пішаків (1–2 версії та формація), дві тури, два слони, два коні, ферзь і король. У всій колоді —
          не більше однієї міфологічної картки.
        </p>
      </div>

      <div className="deck-layout">
        <aside className="deck-list panel">
          <div className="panel-title-row">
            <h2>Мої колоди</h2>
            <button className="btn btn-primary btn-sm" onClick={() => startNew()}>
              + Нова
            </button>
          </div>
          <ul>
            {[CLASSIC_DECK, ...saved].map((d) => (
              <li key={d.id} className={`deck-item ${draft?.id === d.id ? 'editing' : ''}`}>
                <div className="deck-item-main">
                  <strong>{d.name}</strong>
                  {d.id === activeId && <span className="pill pill-ok">для матчу</span>}
                  <DeckSummary deck={d} />
                </div>
                <div className="deck-item-actions">
                  {d.id !== activeId && (
                    <button className="btn btn-sm" onClick={() => onActivate(d.id)}>
                      Грати нею
                    </button>
                  )}
                  {d.id === CLASSIC_DECK.id ? (
                    <button className="btn btn-sm" onClick={() => startNew(CLASSIC_DECK)}>
                      Копіювати
                    </button>
                  ) : (
                    <>
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
                      <button
                        className="btn btn-sm btn-danger"
                        onClick={() => {
                          if (confirmDelete !== d.id) return setConfirmDelete(d.id);
                          setConfirmDelete(null);
                          onDelete(d.id);
                          if (draft?.id === d.id) setDraft(null);
                        }}
                        onBlur={() => setConfirmDelete(null)}
                      >
                        {confirmDelete === d.id ? 'Точно видалити?' : 'Видалити'}
                      </button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </aside>

        {draft ? (
          <DeckEditor
            key={draft.id}
            draft={draft}
            isNew={isNew}
            onChange={setDraft}
            onCancel={() => setDraft(null)}
            onSave={() => {
              onSave(draft);
              setIsNew(false);
              setDraft(null);
            }}
          />
        ) : (
          <div className="panel empty-editor">
            <p>Оберіть колоду для редагування або створіть нову.</p>
            <button className="btn btn-primary" onClick={() => startNew()}>
              Створити колоду
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

function DeckSummary({ deck }: { deck: Deck }) {
  const positions = deckPositions(deck);
  const counts = { rare: 0, epic: 0, legendary: 0, mythological: 0 } as Record<string, number>;
  for (const id of new Set(positions)) {
    const r = CARD_BY_ID[id]?.rarity;
    if (r && r in counts) counts[r]++;
  }
  const parts = Object.entries(counts).filter(([, n]) => n > 0);
  return (
    <span className="deck-summary">
      {parts.length === 0
        ? 'тільки звичайні'
        : parts.map(([r, n]) => (
            <span key={r} className={`dot-count r-${r}`}>
              {n}
            </span>
          ))}
    </span>
  );
}

interface EditorProps {
  draft: Deck;
  isNew: boolean;
  onChange: (d: Deck) => void;
  onCancel: () => void;
  onSave: () => void;
}

function DeckEditor({ draft, isNew, onChange, onCancel, onSave }: EditorProps) {
  const errors = useMemo(() => validateDeck(draft), [draft]);
  const set = (patch: Partial<Deck>) => onChange({ ...draft, ...patch });

  const togglePawn = (id: string) => {
    const v = draft.pawnVersions;
    if (v.includes(id)) {
      if (v.length > 1) set({ pawnVersions: v.filter((x) => x !== id) });
    } else if (v.length < 2) {
      set({ pawnVersions: [...v, id] });
    }
  };

  const mythicElsewhere = (slotKey: keyof Deck) =>
    DECK_SLOTS.some((s) => s.key !== slotKey && CARD_BY_ID[draft[s.key] as string]?.rarity === 'mythological');

  return (
    <div className="panel deck-editor">
      <label className="field">
        <span>Назва колоди</span>
        <input value={draft.name} maxLength={40} onChange={(e) => set({ name: e.target.value })} />
      </label>

      <h2>Пішаки</h2>
      <p className="muted small">Оберіть 1 або 2 версії. Порядок вибору: перша — «1», друга — «2».</p>
      <div className="pawn-picker">
        {PAWN_CARDS.map((c) => {
          const idx = draft.pawnVersions.indexOf(c.id);
          const disabled = idx < 0 && draft.pawnVersions.length >= 2;
          return (
            <button
              key={c.id}
              className={`pawn-option r-border-${c.rarity} ${idx >= 0 ? 'on' : ''}`}
              disabled={disabled}
              title={c.rulesText}
              onClick={() => togglePawn(c.id)}
            >
              {idx >= 0 && <span className="version-badge">{idx + 1}</span>}
              <span className="pawn-option-name">{c.name}</span>
              <RarityTag card={c} />
            </button>
          );
        })}
      </div>

      {draft.pawnVersions.length === 2 && (
        <div className="formation">
          <span>Формація (вертикалі a–h):</span>
          <div className="chip-row">
            {FORMATION_PRESETS.map((f) => (
              <button key={f} className={`chip mono ${draft.pawnFormation === f ? 'on' : ''}`} onClick={() => set({ pawnFormation: f })}>
                {f}
              </button>
            ))}
            <input
              className="mono formation-input"
              aria-label="Своя формація"
              value={draft.pawnFormation}
              maxLength={8}
              onChange={(e) => set({ pawnFormation: e.target.value.replace(/[^12]/g, '') })}
            />
          </div>
        </div>
      )}

      <h2>Фігури</h2>
      <div className="slot-grid">
        {DECK_SLOTS.map((slot) => {
          const current = CARD_BY_ID[draft[slot.key] as string];
          const blockMythic = mythicElsewhere(slot.key);
          const options = CARDS.filter((c) => c.pieceType === slot.type);
          return (
            <div key={slot.key} className="slot">
              <label className="field">
                <span>{slot.label}</span>
                <select value={draft[slot.key] as string} onChange={(e) => set({ [slot.key]: e.target.value } as Partial<Deck>)}>
                  {RARITY_ORDER.map((r) => {
                    const group = options.filter((c) => c.rarity === r);
                    if (!group.length) return null;
                    return (
                      <optgroup key={r} label={RARITY_NAMES[r]}>
                        {group.map((c) => (
                          <option key={c.id} value={c.id} disabled={r === 'mythological' && blockMythic}>
                            {c.name}
                            {r === 'mythological' && blockMythic ? ' — вже є міфологічна' : ''}
                          </option>
                        ))}
                      </optgroup>
                    );
                  })}
                </select>
              </label>
              {current && <CardView card={current} compact />}
            </div>
          );
        })}
      </div>

      <h2>Розстановка</h2>
      <DeckPreview deck={draft} />

      {errors.length > 0 && (
        <ul className="errors" aria-live="polite">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      <div className="editor-actions">
        <button className="btn btn-primary" disabled={errors.length > 0} onClick={onSave}>
          Зберегти колоду
        </button>
        <button className="btn" onClick={onCancel}>
          {isNew ? 'Скасувати' : 'Закрити'}
        </button>
        <button className="btn btn-ghost" onClick={() => onChange({ ...classicDeck(draft.id, draft.name) })}>
          Скинути до класики
        </button>
      </div>
    </div>
  );
}

function DeckPreview({ deck }: { deck: Deck }) {
  const positions = deckPositions(deck);
  const pawns = positions.slice(0, 8);
  const back = ['rook1', 'knight1', 'bishop1', 'queen', 'king', 'bishop2', 'knight2', 'rook2'] as (keyof Deck)[];
  const row = (ids: string[]) =>
    ids.map((id, i) => {
      const c = CARD_BY_ID[id];
      if (!c) return <div key={i} className="preview-cell" />;
      return (
        <div key={i} className={`preview-cell ${(i + (ids === pawns ? 1 : 0)) % 2 ? 'light' : 'dark'}`} title={`${c.name} — ${c.rulesText}`}>
          <Glyph type={c.pieceType} color="w" />
          {c.rarity !== 'common' && <span className={`rarity-dot r-${c.rarity}`} />}
        </div>
      );
    });
  return (
    <div className="deck-preview">
      <div className="preview-row">{row(pawns)}</div>
      <div className="preview-row">{row(back.map((k) => deck[k] as string))}</div>
      <div className="preview-files mono">
        {'abcdefgh'.split('').map((f) => (
          <span key={f}>{f}</span>
        ))}
      </div>
    </div>
  );
}
