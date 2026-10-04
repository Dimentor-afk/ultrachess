import { type CSSProperties, useEffect, useMemo, useState } from 'react';
import type { GameRecord } from '../api/client';
import { type GameReview, MATE_CP, MOVE_CLASSES, type MoveClass, splitTurns, winChance } from '../engine/bot/analysis';
import { type MatchState, createMatch, moveText, performAction } from '../engine/match';
import { findKing } from '../engine/position';
import type { Color, Square } from '../engine/types';
import { playerView } from '../engine/view';
import { FREE_ANALYSES } from '../economy/service';
import { t, tr } from '../i18n';
import { cachedReview, runReview } from './analysisClient';
import { Board, boardRing, squareCenter } from './Board';
import { Avatar } from './common';
import { navigate } from './router';
import { errorText, useSession } from './state';

/** How each kind of move is shown: its mark, name and colour. */
export const CLASS_INFO: Record<MoveClass, { mark: string; name: string; color: string }> = {
  brilliant: { mark: '!!', name: t('Блискучий хід'), color: '#26c2a3' },
  great: { mark: '!', name: t('Єдиний хід'), color: '#5c8bde' },
  best: { mark: '★', name: t('Найкращий'), color: '#81b64c' },
  excellent: { mark: '✦', name: t('Відмінний'), color: '#96bc4b' },
  good: { mark: '✓', name: t('Добрий'), color: '#8fb38a' },
  inaccuracy: { mark: '?!', name: t('Неточність'), color: '#f2c14e' },
  mistake: { mark: '?', name: t('Помилка'), color: '#e8913a' },
  miss: { mark: '✗', name: t('Пропущений мат'), color: '#ee6b55' },
  blunder: { mark: '??', name: t('Грубий промах'), color: '#d6403a' },
  forced: { mark: '→', name: t('Вимушений'), color: '#8a93a8' },
};

/** Move number of a ply: 1 for White's first move and Black's reply. */
const moveNo = (ply: number) => Math.floor(ply / 2) + 1;

/** "+1.4", "−0.3", "M" for a mate. */
function evalText(cp: number): string {
  if (Math.abs(cp) >= MATE_CP) return cp > 0 ? '+M' : '−M';
  const v = (cp / 100).toFixed(1);
  return cp > 0 ? `+${v}` : cp < 0 ? `−${v.slice(1)}` : '0.0';
}

/**
 * A finished game, move by move, and its analysis (#/review/<m|p>/<id>):
 * the board, an evaluation bar and graph, every move marked from "!!" to
 * "??" with the engine's better move, and both sides' accuracy.
 */
export function ReviewPage({ kind, id }: { kind: 'm' | 'p'; id: string }) {
  const s = useSession();
  const key = `${kind}:${id}`;
  const [rec, setRec] = useState<GameRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [review, setReview] = useState<GameReview | null>(() => cachedReview(key));
  const [progress, setProgress] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  // Position shown: after `at` turns (0 = the start).
  const [at, setAt] = useState(0);
  // Stepping forward one turn animates; jumps do not.
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    s.api.gameRecord(kind, id).then(setRec, (e) => setError(errorText(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Every turn and the position after it.
  const game = useMemo(() => {
    if (!rec) return null;
    const turns = splitTurns(rec.decks, rec.actions);
    const states: MatchState[] = [createMatch(rec.decks.w, rec.decks.b)];
    let st = states[0];
    for (const tn of turns) {
      for (let i = tn.from; i < tn.to; i++) st = performAction(st, rec.actions[i]);
      states.push(st);
    }
    return { turns, states };
  }, [rec]);

  // An unlocked game without a stored review: run it.
  useEffect(() => {
    if (!rec || !rec.analysis.unlocked || review) return;
    setProgress(0);
    const job = runReview(key, { decks: rec.decks, actions: rec.actions }, setProgress);
    job.promise.then(
      (r) => {
        setReview(r);
        setProgress(null);
      },
      (e) => {
        setProgress(null);
        s.toast(errorText(e), 'error');
      },
    );
    return job.cancel;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rec?.analysis.unlocked, review]);

  const last = game ? game.states.length - 1 : 0;
  const go = (n: number, step = false) => {
    setAnimate(step);
    setAt(Math.max(0, Math.min(last, n)));
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === 'ArrowRight') go(at + 1, true);
      else if (e.key === 'ArrowLeft') go(at - 1);
      else if (e.key === 'Home') go(0);
      else if (e.key === 'End') go(last);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  // The current move in the list stays in sight.
  useEffect(() => {
    document.querySelector('.rv-move.on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [at]);

  if (error) {
    return (
      <section className="page">
        <p className="error-text">{error}</p>
        <a className="btn" href="#/profile">
          {t('До профілю')}
        </a>
      </section>
    );
  }
  if (!rec || !game) return <p className="muted page-loading">{t('Завантаження…')}</p>;

  const unlock = async () => {
    setBusy(true);
    try {
      const r = await s.api.unlockAnalysis(kind, id);
      s.setProfile(r.profile);
      setRec({ ...rec, analysis: r.analysis });
    } catch (e) {
      s.toast(errorText(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  const me = rec.myColor;
  const state = game.states[at];
  const view = playerView(state, me);
  const shown = animate ? view : { ...view, fx: null };
  const turn = at > 0 ? game.turns[at - 1] : null;
  const tr_ = at > 0 && review ? review.turns[at - 1] : null;
  const lastMove = new Set<Square>();
  if (at > 0 && state.lastMove) {
    lastMove.add(state.lastMove.from);
    lastMove.add(state.lastMove.target);
    if (state.lastMove.to !== null) lastMove.add(state.lastMove.to);
  }
  // The engine's better move, on the position before it.
  const better = tr_?.best ?? null;
  const hint = new Set<Square>(better ? [better.from, better.target] : []);
  const checkSquare = state.status === 'check' || state.status === 'checkmate' ? findKing(state, state.turn) : null;
  // White's score of the position shown.
  const score = review ? (at === 0 ? (review.turns[0]?.before ?? 0) : review.turns[at - 1].after) : null;
  const whiteChance = score === null ? 50 : winChance(score);
  const turnText = (i: number) => {
    const tn = game.turns[i];
    const texts = game.states[i + 1].history.slice(tn.from, tn.to).map((h) => tr(h.ownText ?? h.text ?? ''));
    return texts.filter(Boolean).join('; ');
  };
  const outcome = rec.result.winner === null ? t('Нічия') : rec.result.winner === me ? t('Перемога') : t('Поразка');

  return (
    <section className="page review">
      <div className="page-head rv-head">
        <button className="btn btn-sm btn-ghost" onClick={() => (history.length > 1 ? history.back() : navigate('/profile'))}>
          ← {t('Назад')}
        </button>
        <h1>{t('Аналіз партії')}</h1>
        <span className={`rv-outcome out-${rec.result.winner === null ? 'draw' : rec.result.winner === me ? 'win' : 'loss'}`}>
          {outcome} · {tr(rec.result.reason)}
        </span>
      </div>

      <div className="rv-layout">
        <div className="rv-board-col">
          <PlayerLine p={rec.players[me === 'w' ? 'b' : 'w']} color={me === 'w' ? 'b' : 'w'} review={review} />
          <div className="rv-board-row">
            <div className="rv-evalbar" aria-label={t('Оцінка позиції')} title={score === null ? '' : evalText(score)}>
              <span className="rv-evalbar-fill" style={{ height: `${me === 'w' ? whiteChance : 100 - whiteChance}%` } as CSSProperties} />
              {score !== null && <b className={`rv-evalbar-num ${(score >= 0) === (me === 'w') ? 'low' : 'high'}`}>{evalText(me === 'w' ? score : -score)}</b>}
            </div>
            <div className="rv-board">
              <Board
                view={shown}
                orientation={me}
                selected={null}
                marks={new Map()}
                lastMove={lastMove}
                hint={hint}
                preview={new Set()}
                checkSquare={checkSquare}
                onSquare={() => {}}
              />
              {tr_ && state.lastMove && <MoveBadge cls={tr_.cls} square={state.lastMove.to ?? state.lastMove.target} orientation={me} ring={boardRing(shown, new Map())} />}
            </div>
          </div>
          <PlayerLine p={rec.players[me]} color={me} review={review} />

          <div className="rv-controls">
            <button className="btn" onClick={() => go(0)} disabled={at === 0} aria-label={t('На початок')}>
              ⏮
            </button>
            <button className="btn" onClick={() => go(at - 1)} disabled={at === 0} aria-label={t('Назад')}>
              ◀
            </button>
            <button className="btn btn-primary" onClick={() => go(at + 1, true)} disabled={at === last} aria-label={t('Далі')}>
              ▶
            </button>
            <button className="btn" onClick={() => go(last)} disabled={at === last} aria-label={t('В кінець')}>
              ⏭
            </button>
          </div>
        </div>

        <div className="rv-side">
          {turn && (
            <div className="panel rv-now">
              {tr_ ? (
                <div className="rv-verdict" style={{ '--c': CLASS_INFO[tr_.cls].color } as CSSProperties}>
                  <span className="rv-mark">{CLASS_INFO[tr_.cls].mark}</span>
                  <b>{CLASS_INFO[tr_.cls].name}</b>
                  <span className="rv-eval">{evalText(tr_.after)}</span>
                </div>
              ) : null}
              <p className="rv-move-text">
                {moveNo(turn.state.ply)}
                {turn.color === 'w' ? '.' : '…'} {turnText(at - 1)}
              </p>
              {better && (
                <p className="muted small">
                  {t('Краще було:')} <b>{tr(moveText(turn.state, better))}</b>
                </p>
              )}
            </div>
          )}

          {!rec.analysis.unlocked ? (
            <div className="panel rv-unlock">
              <h3>{t('Розбір кожного ходу')}</h3>
              <p className="muted small">{t('Оцінка позиції, точність обох гравців і найкращі ходи — від «!!» до «??».')}</p>
              <button className="btn btn-primary" disabled={busy || (rec.analysis.freeLeft === 0 && s.profile.shards < rec.analysis.price)} onClick={unlock}>
                {rec.analysis.freeLeft > 0 ? t('Аналізувати безкоштовно') : t('Аналізувати за 💎 {0}', rec.analysis.price)}
              </button>
              <small className="muted">
                {rec.analysis.freeLeft > 0
                  ? t('Безкоштовних сьогодні: {0} з {1}', rec.analysis.freeLeft, FREE_ANALYSES)
                  : s.profile.shards < rec.analysis.price
                    ? t('Безкоштовні аналізи на сьогодні закінчились, а уламків не вистачає.')
                    : t('Безкоштовні аналізи на сьогодні закінчились — завтра будуть нові.')}
              </small>
            </div>
          ) : !review ? (
            <div className="panel rv-progress">
              <b>{t('Рушій аналізує партію…')}</b>
              <div className="bar">
                <span style={{ width: `${Math.round((progress ?? 0) * 100)}%` }} />
              </div>
              <small className="muted">{Math.round((progress ?? 0) * 100)}%</small>
            </div>
          ) : (
            <>
              {review.turns.length > 0 && <EvalGraph review={review} at={at} onPick={(n) => go(n)} flip={me === 'b'} />}
              <Summary review={review} rec={rec} />
            </>
          )}

          {game.turns.length > 0 && (
            <div className="panel rv-moves">
              <div className="rv-move-grid">
                {game.turns.map((tn, i) => {
                  const r = review?.turns[i];
                  const info = r ? CLASS_INFO[r.cls] : null;
                  const showMark = r && r.cls !== 'best' && r.cls !== 'excellent' && r.cls !== 'good' && r.cls !== 'forced';
                  return (
                    <button key={i} className={`rv-move c-${tn.color} ${at === i + 1 ? 'on' : ''}`} onClick={() => go(i + 1)}>
                      {(tn.color === 'w' || i === 0) && <span className="rv-num">{moveNo(tn.state.ply)}.{tn.color === 'b' ? '…' : ''}</span>}
                      <span className="rv-move-name">{shortText(game.states[i + 1], tn)}</span>
                      {showMark && (
                        <span className="rv-move-mark" style={{ color: info!.color }}>
                          {info!.mark}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/** A turn in a few characters for the move list: "e2–e4", "Кf3×e5". */
function shortText(after: MatchState, tn: { from: number; to: number }): string {
  const h = after.history[tn.to - 1];
  const text = tr(h?.ownText ?? h?.text ?? '');
  // "Пішак e2–e4 …": the squares are enough here.
  const m = /([a-h][1-8](?:[–×][a-h][1-8])?)/.exec(text);
  const prefix = tn.to - tn.from > 1 ? '✨' : '';
  return prefix + (m ? m[1] : text.slice(0, 10));
}

function PlayerLine({ p, color, review }: { p: GameRecord['players'][Color]; color: Color; review: GameReview | null }) {
  return (
    <div className="rv-player">
      {p.avatar ? <Avatar card={p.avatar} size="sm" /> : <span className="avatar avatar-sm rv-bot">🤖</span>}
      <b>{tr(p.name)}</b>
      <span className={`rv-side-dot side-${color}`} />
      {review && <span className="rv-acc">{t('Точність')} {review.accuracy[color].toFixed(1)}</span>}
    </div>
  );
}

/** The move's mark in the corner of its square, like on chess.com. */
function MoveBadge({ cls, square, orientation, ring }: { cls: MoveClass; square: Square; orientation: Color; ring: number }) {
  const info = CLASS_INFO[cls];
  const c = squareCenter(square, orientation, ring);
  const half = 50 / (8 + 2 * ring);
  return (
    <span className="rv-badge" style={{ left: `${c.x + half * 0.72}%`, top: `${c.y - half * 0.72}%`, background: info.color } as CSSProperties} title={info.name}>
      {info.mark}
    </span>
  );
}

/** White's winning chance over the game; tap to jump there. */
function EvalGraph({ review, at, onPick, flip }: { review: GameReview; at: number; onPick: (n: number) => void; flip: boolean }) {
  const n = review.turns.length;
  const W = 300;
  const H = 70;
  const xs = (i: number) => (n ? (i / n) * W : 0);
  const ys = (cp: number) => {
    const c = winChance(cp);
    return ((flip ? c : 100 - c) / 100) * H;
  };
  const pts = [review.turns[0]?.before ?? 0, ...review.turns.map((x) => x.after)].map((cp, i) => `${xs(i).toFixed(1)},${ys(cp).toFixed(1)}`);
  const area = `0,${H} ${pts.join(' ')} ${W},${H}`;
  const bad = new Set<MoveClass>(['blunder', 'mistake', 'miss', 'brilliant', 'great']);
  return (
    <div className="panel rv-graph">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        onClick={(e) => {
          const box = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          onPick(Math.round(((e.clientX - box.left) / box.width) * n));
        }}
        role="img"
        aria-label={t('Графік переваги')}
      >
        <rect x="0" y="0" width={W} height={H} className="rv-graph-bg" />
        <polygon points={area} className="rv-graph-area" />
        <line x1="0" x2={W} y1={H / 2} y2={H / 2} className="rv-graph-mid" />
        {review.turns.map((x, i) =>
          bad.has(x.cls) ? <circle key={i} cx={xs(i + 1)} cy={ys(x.after)} r="3.2" fill={CLASS_INFO[x.cls].color} /> : null,
        )}
        <line x1={xs(at)} x2={xs(at)} y1="0" y2={H} className="rv-graph-now" />
      </svg>
    </div>
  );
}

function Summary({ review, rec }: { review: GameReview; rec: GameRecord }) {
  const rows = MOVE_CLASSES.filter((c) => c !== 'forced');
  return (
    <div className="panel rv-summary">
      <div className="rv-sum-head">
        <span />
        <b title={tr(rec.players.w.name)}>{tr(rec.players.w.name)}</b>
        <b title={tr(rec.players.b.name)}>{tr(rec.players.b.name)}</b>
      </div>
      <div className="rv-sum-row rv-sum-acc">
        <span>{t('Точність')}</span>
        <b className="rv-acc-big side-w">{review.accuracy.w.toFixed(1)}</b>
        <b className="rv-acc-big side-b">{review.accuracy.b.toFixed(1)}</b>
      </div>
      {rows.map((c) => (
        <div key={c} className="rv-sum-row" style={{ '--c': CLASS_INFO[c].color } as CSSProperties}>
          <span>
            <i className="rv-mark-sm">{CLASS_INFO[c].mark}</i> {CLASS_INFO[c].name}
          </span>
          <b>{review.counts.w[c]}</b>
          <b>{review.counts.b[c]}</b>
        </div>
      ))}
    </div>
  );
}
