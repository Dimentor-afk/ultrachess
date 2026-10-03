import { useEffect, useMemo, useRef, useState } from 'react';
import { CARDS, CARD_BY_ID, PIECE_NAMES, PIECE_ORDER, RARITY_ORDER } from '../engine/cards';
import { cardAt, deckPositions, placeCard, slotType, validateDeck } from '../engine/deck';
import { PawnPanel, pawnKindTarget, replacePawnKind } from './PawnPanel';
import type { Card, Deck, PieceType } from '../engine/types';
import { Emblem } from './art';
import { CardModal } from './CardModal';
import { CardArt, RarityTag } from './common';
import { Icon } from './icons';
import { currentPath, onNavigate } from './router';
import { StylePanel } from './StylePanel';
import { errorText, useSession } from './state';
import { t, tr } from '../i18n';

const MAX_DECKS = 10;
const FILES = 'abcdefgh';
const newDeckId = () => `deck-${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;

type HubTab = 'cards' | 'style';
const tabFromHash = (): HubTab => (currentPath().split('/')[2] === 'style' ? 'style' : 'cards');

/** Two tabs: the deck itself and its looks (board colours, capture effect). */
function HubSwitch({ tab }: { tab: HubTab }) {
  return (
    <nav className="hub-switch" role="tablist" aria-label={t('Розділ колоди')}>
      <a role="tab" aria-selected={tab === 'cards'} className={tab === 'cards' ? 'on' : ''} href="#/deck">
        <Icon name="cards" /> {t('Колода')}
      </a>
      <a role="tab" aria-selected={tab === 'style'} className={tab === 'style' ? 'on' : ''} href="#/deck/style">
        <Icon name="brush" /> {t('Стиль')}
      </a>
    </nav>
  );
}

/**
 * Clash Royale style: deck tabs on top, the deck board under them, then the
 * cards you own (drag them onto the board), the duplicates chest and, at the
 * bottom, the cards still locked. The "Стиль" tab holds the board colours and
 * capture effects.
 */
export function DeckPage() {
  const s = useSession();
  const [tab, setTab] = useState<HubTab>(tabFromHash);
  useEffect(() => {
    return onNavigate(() => setTab(tabFromHash()));
  }, []);
  const active = s.decks.find((d) => d.id === s.profile.activeDeckId) ?? s.decks[0];
  if (tab === 'style') {
    return (
      <section className="page deckhub">
        <HubSwitch tab="style" />
        <StylePanel />
      </section>
    );
  }
  if (!active) {
    return (
      <section className="page deckhub">
        <HubSwitch tab="cards" />
        <div className="panel empty-state">
          <h1>{t('Колода')}</h1>
          <p className="muted">{t('Відкрийте стартовий пак на головній — з нього збереться перша колода.')}</p>
          <a className="btn btn-primary" href="#/play">
            {t('На головну')}
          </a>
        </div>
      </section>
    );
  }
  return <DeckHub key={active.id} deck={active} />;
}

type SaveState = 'saved' | 'pending' | 'saving' | 'invalid' | 'error';

interface DragState {
  cardId: string;
  x: number;
  y: number;
}

function DeckHub({ deck }: { deck: Deck }) {
  const s = useSession();
  const owned = s.collection.owned;
  const [draft, setDraft] = useState<Deck>(deck);
  const [save, setSave] = useState<SaveState>('saved');
  const [selected, setSelected] = useState(4);
  const [armed, setArmed] = useState<string | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [filter, setFilter] = useState<PieceType | 'all'>('all');
  const [message, setMessage] = useState<{ text: string; bad: boolean } | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const pressRef = useRef<{ cardId: string; x: number; y: number; started: boolean } | null>(null);
  const errors = useMemo(() => validateDeck(draft), [draft]);

  // ── Autosave: every valid change is stored after a short pause. ──
  const pending = useRef<Deck | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flush = async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const d = pending.current;
    pending.current = null;
    if (!d) return;
    setSave('saving');
    try {
      s.setDecks(await s.api.saveDeck(d));
      setSave('saved');
    } catch (e) {
      setSave('error');
      s.toast(errorText(e), 'error');
    }
  };
  const update = (d: Deck) => {
    setDraft(d);
    if (validateDeck(d).length) {
      pending.current = null;
      if (timer.current) clearTimeout(timer.current);
      setSave('invalid');
      return;
    }
    pending.current = d;
    setSave('pending');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 500);
  };
  const flushRef = useRef(flush);
  flushRef.current = flush;
  useEffect(() => () => void flushRef.current(), []);

  // ── Deck tabs ──
  const switchTo = async (id: string) => {
    if (id === deck.id) return;
    await flush();
    try {
      s.setProfile(await s.api.setActiveDeck(id));
    } catch (e) {
      s.toast(errorText(e), 'error');
    }
  };
  const addDeck = async () => {
    await flush();
    const base = errors.length ? deck : draft;
    const copy: Deck = { ...base, pawnVersions: [...base.pawnVersions], id: newDeckId(), name: t('Колода {0}', s.decks.length + 1) };
    try {
      s.setDecks(await s.api.saveDeck(copy));
      s.setProfile(await s.api.setActiveDeck(copy.id));
      s.toast(t('«{0}» створено — це копія попередньої, змінюйте як хочете.', copy.name));
    } catch (e) {
      s.toast(errorText(e), 'error');
    }
  };
  const removeDeck = async () => {
    if (!confirmDelete) return setConfirmDelete(true);
    pending.current = null;
    if (timer.current) clearTimeout(timer.current);
    try {
      s.setDecks(await s.api.deleteDeck(deck.id));
      s.setProfile((await s.api.me())!);
    } catch (e) {
      s.toast(errorText(e), 'error');
    }
  };

  // ── Placing cards ──
  const place = (index: number, cardId: string, allPawns = false) => {
    if (!owned[cardId]) {
      setMessage({ text: t('«{0}» ще не відкрита — шукайте її в паках.', CARD_BY_ID[cardId].name), bad: true });
      return;
    }
    const res = placeCard(draft, index, cardId, allPawns);
    if (!res.deck) {
      setMessage({ text: tr(res.error), bad: true });
      return;
    }
    update(res.deck);
    setSelected(index);
    setArmed(null);
    const name = CARD_BY_ID[cardId].name;
    // Only two kinds of pawns: a third one takes over every square of the kind it was dropped on.
    const lost = draft.pawnVersions.filter((v) => !res.deck!.pawnVersions.includes(v) && v !== cardId);
    if (!allPawns && lost.length && res.deck.pawnVersions.length === 2) {
      setMessage({ text: t('У колоді лише 2 види пішаків: «{0}» замінив «{1}» на всіх його клітинках.', name, CARD_BY_ID[lost[0]].name), bad: false });
      return;
    }
    setMessage({ text: allPawns ? t('«{0}» на всіх 8 пішаках.', name) : t('«{0}» стоїть на {1}.', name, squareName(index)), bad: false });
  };

  /** A pawn card onto a kind tile: that kind changes on all its squares. */
  const dropKind = (kind: 0 | 1, cardId: string) => {
    if (CARD_BY_ID[cardId].pieceType !== 'pawn') {
      setMessage({ text: t('«{0}» — не пішак.', CARD_BY_ID[cardId].name), bad: true });
      return;
    }
    if (!owned[cardId]) {
      setMessage({ text: t('«{0}» ще не відкрита — шукайте її в паках.', CARD_BY_ID[cardId].name), bad: true });
      return;
    }
    const r = replacePawnKind(draft, kind, cardId);
    update(r.deck);
    setArmed(null);
    setMessage({ text: r.note, bad: false });
  };

  // Tapping a card opens its details; "Використати" then arms it for a square.
  const tapCard = (cardId: string) => setDetail(cardId);
  const armCard = (cardId: string) => {
    setDetail(null);
    setArmed(cardId);
    setFilter(CARD_BY_ID[cardId].pieceType);
    setMessage(null);
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
      if (!p.started) return tapCard(p.cardId);
      setDrag(null);
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-drop]');
      if (!el) return;
      const target = el.dataset.drop!;
      const kind = pawnKindTarget(target);
      if (kind !== null) dropKind(kind, p.cardId);
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

  const activeType = drag ? CARD_BY_ID[drag.cardId].pieceType : armed ? CARD_BY_ID[armed].pieceType : null;
  const inDeck = new Set(deckPositions(draft));

  const square = (index: number) => {
    const card = CARD_BY_ID[cardAt(draft, index)];
    const light = (index % 8) + (index >= 8 ? 1 : 0);
    const fits = activeType !== null && activeType === slotType(index);
    return (
      <button
        key={index}
        type="button"
        data-drop={index}
        className={`deck-sq ${light % 2 ? 'light' : 'dark'} ${selected === index && !activeType ? 'selected' : ''} ${fits ? 'can-drop' : ''} ${
          activeType && !fits ? 'no-drop' : ''
        }`}
        onClick={() => {
          if (armed) {
            if (fits) place(index, armed);
            else setMessage({ text: t('«{0}» — це {1}, їй потрібна інша клітинка.', CARD_BY_ID[armed].name, PIECE_NAMES[CARD_BY_ID[armed].pieceType].toLowerCase()), bad: true });
            return;
          }
          setSelected(index);
          setFilter(slotType(index));
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

  const sortCards = (a: Card, b: Card) =>
    PIECE_ORDER.indexOf(a.pieceType) - PIECE_ORDER.indexOf(b.pieceType) || RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity);
  const shown = CARDS.filter((c) => filter === 'all' || c.pieceType === filter).sort(sortCards);
  const mine = shown.filter((c) => owned[c.id]);
  const locked = shown.filter((c) => !owned[c.id]);
  const ownedCount = Object.keys(owned).length;
  const detailCard = detail ? CARD_BY_ID[detail] : null;

  const miniCard = (c: Card, isLocked: boolean) => (
    <div
      key={c.id}
      className={`mini-card r-${c.rarity} ${inDeck.has(c.id) ? 'in-deck' : ''} ${isLocked ? 'locked' : ''} ${
        drag?.cardId === c.id ? 'dragging' : ''
      } ${armed === c.id ? 'armed' : ''}`}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        if (isLocked) return tapCard(c.id);
        e.preventDefault();
        pressRef.current = { cardId: c.id, x: e.clientX, y: e.clientY, started: false };
      }}
      title={c.rulesText}
    >
      <div className="mini-card-art">
        <CardArt cardId={c.id} />
        {isLocked && (
          <span className="mini-lock">
            <Icon name="lock" />
          </span>
        )}
        <span className="mini-card-emblem">
          <Emblem cardId={c.id} />
        </span>
      </div>
      <div className="mini-card-body">
        <span className="card-type">{PIECE_NAMES[c.pieceType]}</span>
        <strong>{c.name}</strong>
        <RarityTag card={c} />
      </div>
      {inDeck.has(c.id) && <span className="in-deck-mark">{t('у колоді')}</span>}
    </div>
  );

  return (
    <section className="page deckhub">
      <HubSwitch tab="cards" />
      <div className="deck-tabs" role="tablist" aria-label={t('Колоди')}>
        {s.decks.map((d, i) => (
          <button
            key={d.id}
            role="tab"
            aria-selected={d.id === deck.id}
            className={`deck-tab ${d.id === deck.id ? 'on' : ''}`}
            title={d.name}
            onClick={() => switchTo(d.id)}
          >
            <b>{i + 1}</b>
            <span>{tr(d.id === deck.id ? draft.name : d.name)}</span>
          </button>
        ))}
        {s.decks.length < MAX_DECKS && (
          <button className="deck-tab deck-tab-add" onClick={addDeck} title={t('Нова колода (копія поточної)')} aria-label={t('Нова колода')}>
            +
          </button>
        )}
      </div>

      <div className="deck-headbar">
        <label className="deck-name-wrap">
          <Icon name="edit" />
          <input
            className="deck-name"
            aria-label={t('Назва колоди')}
            // The default names come from the server in Ukrainian: shown in the chosen language.
            value={tr(draft.name)}
            maxLength={40}
            onChange={(e) => update({ ...draft, name: e.target.value })}
          />
        </label>
        <span className={`save-state save-${save}`} aria-live="polite">
          {save === 'saved'
            ? t('Збережено · іде в бій')
            : save === 'saving' || save === 'pending'
              ? t('Зберігаю…')
              : save === 'invalid'
                ? t('Не збережено: виправте помилки')
                : t('Помилка збереження')}
        </span>
        {s.decks.length > 1 && (
          <button className="btn btn-sm btn-danger" onClick={removeDeck} onBlur={() => setConfirmDelete(false)}>
            {confirmDelete ? t('Точно видалити?') : t('Видалити')}
          </button>
        )}
      </div>

      {errors.length > 0 && (
        <ul className="errors" aria-live="polite">
          {errors.map((e) => (
            <li key={e}>{tr(e)}</li>
          ))}
        </ul>
      )}

      <div className="hub-top">
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

          <div className="builder-under">
            <PawnPanel
              deck={draft}
              armed={armed}
              dragging={activeType === 'pawn'}
              onChange={(d, note) => {
                if (d !== draft) update(d);
                setArmed(null);
                setMessage({ text: note, bad: false });
              }}
              onTileTap={() => {
                setFilter('pawn');
                setMessage({ text: t('Оберіть пішака в колекції нижче й перетягніть його на плитку (або «Використати» → плитка).'), bad: false });
              }}
              onInfo={(id) => setDetail(id)}
            />
          </div>
          {message ? (
            <p className={message.bad ? 'error-text' : 'ok-text'}>{message.text}</p>
          ) : (
            <p className="muted small">
              {armed
                ? t('Натисніть підсвічену клітинку, щоб поставити «{0}».', CARD_BY_ID[armed].name)
                : t('Перетягніть картку на дошку або натисніть картку, а потім клітинку.')}
            </p>
          )}
        </div>
      </div>

      <div className="section-head hub-head">
        <h2>
          {t('Ваші карти')}{' '}<span className="muted">{ownedCount}/{CARDS.length}</span>
        </h2>
        <div className="collect-bar" aria-hidden="true">
          <span style={{ width: `${(ownedCount / CARDS.length) * 100}%` }} />
        </div>
      </div>
      <div className="chip-row" role="group" aria-label={t('Фігура')}>
        <button className={`chip ${filter === 'all' ? 'on' : ''}`} onClick={() => setFilter('all')}>
          {t('Усі')}
        </button>
        {PIECE_ORDER.map((p) => (
          <button key={p} className={`chip ${filter === p ? 'on' : ''}`} onClick={() => setFilter(p)}>
            {PIECE_NAMES[p]}
          </button>
        ))}
      </div>
      <div className="mini-cards hub-cards">{mine.map((c) => miniCard(c, false))}</div>
      {mine.length === 0 && <p className="muted small">{t('Тут поки нічого — відкривайте паки.')}</p>}

      <a className="panel shards-note" href="#/shop">
        <span className="shards-big">💎 {s.profile.shards}</span>
        <span className="muted small">
          {t('Повторки не лежать мертвим вантажем: кожна одразу стає уламками, а за уламки в магазині купуються паки.')}
        </span>
      </a>

      {locked.length > 0 && (
        <>
          <div className="section-head hub-head">
            <h2>
              <Icon name="lock" /> {t('Ще не знайдені')}{' '}<span className="muted">{locked.length}</span>
            </h2>
            <span className="muted small">{t('Випадають з паків')}</span>
          </div>
          <div className="mini-cards hub-cards hub-locked">{locked.map((c) => miniCard(c, true))}</div>
        </>
      )}

      {detailCard && (
        <CardModal
          card={detailCard}
          locked={!owned[detailCard.id]}
          note={
            !owned[detailCard.id]
              ? detailCard.trialOnly
                ? t('Не випадає з паків — це нагорода за випробування «Шлях Комети».')
                : t('Цієї картки у вас ще немає — вона випадає з паків.')
              : inDeck.has(detailCard.id)
                ? t('Уже стоїть у цій колоді.')
                : undefined
          }
          onClose={() => setDetail(null)}
        >
          {owned[detailCard.id] && (
            <>
              <button className="btn btn-primary" onClick={() => armCard(detailCard.id)}>
                {t('Використати')}
              </button>
              {detailCard.pieceType === 'pawn' && (
                <button
                  className="btn"
                  onClick={() => {
                    setDetail(null);
                    place(8, detailCard.id, true);
                  }}
                >
                  {t('На всі 8 пішаків')}
                </button>
              )}
            </>
          )}
        </CardModal>
      )}

      {drag && (
        <div className={`drag-ghost r-${CARD_BY_ID[drag.cardId].rarity}`} style={{ left: drag.x, top: drag.y }}>
          <CardArt cardId={drag.cardId} />
          <span>{CARD_BY_ID[drag.cardId].name}</span>
        </div>
      )}
    </section>
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

function squareName(index: number): string {
  return `${FILES[index % 8]}${index >= 8 ? 2 : 1}`;
}
