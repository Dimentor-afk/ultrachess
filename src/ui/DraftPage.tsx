import { useCallback, useEffect, useState } from 'react';
import type { DraftPage as DraftData } from '../api/client';
import { DRAFT_PICK_MS, DRAFT_ROUNDS, type DraftKind, draftBoard, gotSquares, ownSquares, roundType } from '../economy/draft';
import { CARD_BY_ID, PIECE_NAMES } from '../engine/cards';
import type { Color, PieceType } from '../engine/types';
import { CardModal } from './CardModal';
import { Avatar, CardArt, CardView, Glyph } from './common';
import { navigate } from './router';
import { errorText, useSession } from './state';
import { t } from '../i18n';

const KIND_ICON: Record<DraftKind, PieceType> = { pawn: 'pawn', knight: 'knight', bishop: 'bishop', rook: 'rook', crown: 'king' };
const KIND_NAME = (k: DraftKind) => (k === 'crown' ? t('Корона') : PIECE_NAMES[k]);

/**
 * Драфт з другом: five rounds of "one of two". The card you take stands on your left side, the
 * other goes to your friend's right side; the lineups below fill in as the rounds finish.
 */
export function DraftPage({ id }: { id: string }) {
  const s = useSession();
  const [v, setV] = useState<DraftData | null>(null);
  const [at, setAt] = useState(Date.now());
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<string | null>(null);

  const show = (d: DraftData) => {
    setV(d);
    setAt(Date.now());
    setError(null);
  };
  const load = useCallback(async () => {
    try {
      show(await s.api.draftState(id));
    } catch (e) {
      setError(errorText(e));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.api, id]);

  useEffect(() => {
    void load();
    // The server says when the friend picked; polling is the fallback (and the demo's only way).
    const poll = setInterval(() => !document.hidden && void load(), s.api.live ? 5000 : 1500);
    const off = s.api.live?.onDraft((did) => did === id && void load());
    return () => {
      clearInterval(poll);
      off?.();
    };
  }, [load, id, s.api.live]);

  const left = v && !v.done ? Math.max(0, v.left - (now - at)) : 0;
  useEffect(() => {
    if (!v || v.done) return;
    const tick = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(tick);
  }, [v]);
  // Time is up: the server picks at random; ask it for the next round.
  useEffect(() => {
    if (v && !v.done && left === 0) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left === 0]);

  const pick = async (cardId: string) => {
    if (!v || busy || v.picked) return;
    setBusy(true);
    // Shown at once; the server's answer confirms it.
    setV({ ...v, picked: cardId });
    try {
      show(await s.api.draftPick(id, cardId));
    } catch (e) {
      s.toast(errorText(e), 'error');
      void load();
    } finally {
      setBusy(false);
    }
  };

  if (error && !v) {
    return (
      <section className="page draft">
        <div className="panel empty-state">
          <h1>{t('Драфт')}</h1>
          <p className="muted">{error}</p>
          <a className="btn btn-primary" href="#/friends">
            {t('До друзів')}
          </a>
        </div>
      </section>
    );
  }
  if (!v) return <p className="muted page-loading">{t('Завантаження…')}</p>;

  const kind = DRAFT_ROUNDS[Math.min(v.round, DRAFT_ROUNDS.length - 1)];
  const type = roundType(Math.min(v.round, DRAFT_ROUNDS.length - 1), v.color);
  const secs = Math.ceil(left / 1000);
  const prompt =
    kind === 'crown'
      ? v.color === 'w'
        ? t('Білі обирають короля. Інший король дістанеться суперникові, а ферзя він віддасть вам.')
        : t('Чорні обирають ферзя. Інший ферзь дістанеться суперникові, а короля він віддасть вам.')
      : kind === 'pawn'
        ? t('Обраний пішак стане на ваші 4 клітинки зліва, інший піде суперникові.')
        : t('Обрана фігура стане у вас зліва, інша піде суперникові.');

  return (
    <section className={`page draft ${v.done ? 'done' : ''}`}>
      <header className="dr-head">
        <span className="dr-player">
          <Avatar card={v.me.avatar} />
          <b>{v.me.name}</b>
          <small className="muted">{v.color === 'w' ? t('білі') : t('чорні')}</small>
        </span>
        <span className="dr-title">
          <small>{t('Драфт')}</small>
          <b>VS</b>
        </span>
        <span className="dr-player them">
          <Avatar card={v.opponent.avatar} />
          <b>{v.opponent.name}</b>
          <small className="muted">{v.color === 'w' ? t('чорні') : t('білі')}</small>
        </span>
      </header>

      <ol className="dr-steps" aria-label={t('Раунди')}>
        {DRAFT_ROUNDS.map((k, i) => (
          <li key={k} className={i < v.round ? 'past' : i === v.round ? 'now' : ''}>
            <span className="dr-step-icon">
              <Glyph type={KIND_ICON[k]} color={v.color} />
            </span>
            <small>{KIND_NAME(k)}</small>
          </li>
        ))}
      </ol>

      <div className="dr-body">
      <div className="dr-main">
      {!v.done ? (
        <div className="panel dr-round">
          <div className="dr-round-head">
            <div>
              <span className="eyebrow">{t('Раунд {0}/{1}', v.round + 1, DRAFT_ROUNDS.length)}</span>
              <h1>{kind === 'crown' ? (v.color === 'w' ? t('Ваш король') : t('Ваш ферзь')) : t('Ваш {0}', PIECE_NAMES[type].toLowerCase())}</h1>
            </div>
            <span className={`dr-timer ${secs <= 5 ? 'hurry' : ''}`} aria-label={t('Залишилось {0} с', secs)}>
              <svg viewBox="0 0 36 36" aria-hidden="true">
                <circle cx="18" cy="18" r="16" />
                <circle className="dr-timer-left" cx="18" cy="18" r="16" style={{ strokeDashoffset: `${100.5 * (1 - left / DRAFT_PICK_MS)}` }} />
              </svg>
              <b>{secs}</b>
            </span>
          </div>
          <p className="muted small dr-prompt">{prompt}</p>
          <div className="dr-offers">
            {v.offers.map((cardId) => {
              const state = v.picked ? (v.picked === cardId ? 'took' : 'gave') : '';
              return (
                <button key={cardId} type="button" className={`dr-offer ${state}`} disabled={!!v.picked || busy} onClick={() => pick(cardId)}>
                  <CardView card={CARD_BY_ID[cardId]} color={v.color} />
                  {state && <span className="dr-offer-tag">{state === 'took' ? t('✓ Ваш') : t('→ суперникові')}</span>}
                </button>
              );
            })}
          </div>
          <p className={`dr-wait ${v.theyPicked ? 'ready' : ''}`}>
            {v.picked
              ? v.theyPicked
                ? t('Обидва вибрали…')
                : t('Чекаємо, поки {0} обере…', v.opponent.name)
              : v.theyPicked
                ? t('{0} уже вибрав. Ваша черга!', v.opponent.name)
                : t('Ви обираєте одночасно. Не встигнете, і картку виберуть навмання.')}
          </p>
        </div>
      ) : (
        <div className="panel dr-ready">
          <span className="dr-ready-burst" aria-hidden="true" />
          <h1>{t('Колоди готові!')}</h1>
          <p className="muted">{t('Тепер видно, що обрав суперник. Удачі в грі!')}</p>
          {v.pvpId && (
            <button className="btn btn-battle" onClick={() => navigate(`/game/${v.pvpId}`)}>
              ⚔ {t('До гри')}
            </button>
          )}
        </div>
      )}

      </div>
      <DraftLineup v={v} kind={v.done ? null : kind} onCard={setDetail} />
      </div>

      {v.rounds.length > 0 && !v.done && (
        <div className="panel dr-log">
          <span className="eyebrow">{t('Обміни')}</span>
          <ul>
            {v.rounds.map((r) => (
              <li key={r.kind}>
                <span className="dr-log-kind">
                  <Glyph type={KIND_ICON[r.kind]} color={v.color} />
                </span>
                <button className="dr-chip mine" onClick={() => setDetail(r.took)}>
                  <CardArt cardId={r.took} /> {CARD_BY_ID[r.took].name}
                </button>
                <button className="dr-chip got" onClick={() => setDetail(r.got)} title={t('Від суперника')}>
                  <CardArt cardId={r.got} /> {CARD_BY_ID[r.got].name}
                </button>
                <button className="dr-chip gave" onClick={() => setDetail(r.gave)} title={t('Віддали суперникові')}>
                  → <CardArt cardId={r.gave} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {detail && <CardModal card={CARD_BY_ID[detail]} onClose={() => setDetail(null)} />}
    </section>
  );
}

/**
 * Both lineups from this player's seat: the friend's two ranks on top, yours below. Glowing squares
 * show where this round's cards go: yours (your pick), the friend's (the card you leave).
 */
function DraftLineup({ v, kind, onCard }: { v: DraftData; kind: DraftKind | null; onCard: (id: string) => void }) {
  const me = v.color;
  const them: Color = me === 'w' ? 'b' : 'w';
  const board = draftBoard(v);
  // Files as the board shows them to this player: White sees a–h, Black h–a.
  const files = me === 'w' ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0];
  const mineHere = new Set(kind ? ownSquares(me, kind) : []);
  const gotHere = new Set(kind ? gotSquares(me, kind) : []);
  const giveHere = new Set(kind ? gotSquares(them, kind) : []);
  const row = (side: Color, base: number) =>
    files.map((f) => {
      const i = base + f;
      const id = board[side][i];
      const mark = side === me ? (mineHere.has(i) ? 'target-mine' : gotHere.has(i) ? 'target-got' : '') : giveHere.has(i) ? 'target-give' : '';
      return (
        <button
          key={i}
          type="button"
          className={`dr-sq ${(f + (base ? 1 : 0) + (side === 'b' ? 1 : 0)) % 2 ? 'light' : 'dark'} ${id ? `r-${CARD_BY_ID[id].rarity}` : 'empty'} ${mark}`}
          disabled={!id}
          onClick={() => id && onCard(id)}
          aria-label={id ? CARD_BY_ID[id].name : t('ще невідомо')}
        >
          {id ? <CardArt cardId={id} /> : <span className="dr-q">?</span>}
        </button>
      );
    });
  return (
    <div className="panel dr-lineup">
      <div className="dr-side them">
        <span className="dr-side-label">
          {v.opponent.name} <small className="muted">{v.done ? t('усе відкрито') : t('«?»: його вибір, поки таємниця')}</small>
        </span>
        <div className="dr-rank">{row(them, 0)}</div>
        <div className="dr-rank">{row(them, 8)}</div>
      </div>
      <div className="dr-mid" aria-hidden="true">
        <span>{t('← ваш вибір')}</span>
        <span>{t('від суперника →')}</span>
      </div>
      <div className="dr-side mine">
        <div className="dr-rank">{row(me, 8)}</div>
        <div className="dr-rank">{row(me, 0)}</div>
        <span className="dr-side-label">{t('Ваша колода')}</span>
      </div>
    </div>
  );
}
