import { useEffect, useMemo, useState } from 'react';
import type { GameRecord } from '../api/client';
import { type Action, type MatchState, createMatch, performAction } from '../engine/match';
import { findKing } from '../engine/position';
import type { Color, Deck, Square } from '../engine/types';
import { playerView } from '../engine/view';
import { t, tr } from '../i18n';
import { Board } from './Board';
import { Avatar } from './common';
import { navigate } from './router';
import { errorText, useSession } from './state';

/** Move number of a ply: 1 for White's first move and Black's reply. */
const moveNo = (ply: number) => Math.floor(ply / 2) + 1;

interface Turn {
  /** Actions of this turn: actions[from] … actions[to - 1] (an ability press and a move, or a choice). */
  from: number;
  to: number;
  color: Color;
  /** Ply at the start of the turn. */
  ply: number;
}

/**
 * Replay the game turn by turn (one side's consecutive actions are one turn).
 * states[k] is the position after k turns.
 */
function replay(decks: Record<Color, Deck>, actions: Action[]): { turns: Turn[]; states: MatchState[] } {
  const turns: Turn[] = [];
  const states: MatchState[] = [createMatch(decks.w, decks.b)];
  let state = states[0];
  for (let i = 0; i < actions.length; i++) {
    const last = turns.at(-1);
    if (last && last.color === state.turn) last.to = i + 1;
    else {
      if (last) states.push(state);
      turns.push({ from: i, to: i + 1, color: state.turn, ply: state.ply });
    }
    state = performAction(state, actions[i], true);
  }
  if (turns.length) states.push(state);
  return { turns, states };
}

/**
 * A finished game, move by move (#/replay/<m|p>/<id>): the board as it was
 * after each turn, the move list, and buttons or arrow keys to step through.
 */
export function ReplayPage({ kind, id }: { kind: 'm' | 'p'; id: string }) {
  const s = useSession();
  const [rec, setRec] = useState<GameRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Position shown: after `at` turns (0 = the start).
  const [at, setAt] = useState(0);
  // Stepping forward one turn animates; jumps do not.
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    s.api.gameRecord(kind, id).then(setRec, (e) => setError(errorText(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, id]);

  const game = useMemo(() => (rec ? replay(rec.decks, rec.actions) : null), [rec]);
  const last = game ? game.states.length - 1 : 0;
  const go = (n: number, step = false) => {
    setAnimate(step);
    setAt(Math.max(0, Math.min(last, n)));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
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

  // The current move in the list stays in sight. Only the list scrolls:
  // scrollIntoView would move the whole page down to it as well.
  useEffect(() => {
    const el = document.querySelector<HTMLElement>('.rp-move.on');
    const list = el?.closest<HTMLElement>('.rp-moves');
    if (!el || !list) return;
    const top = el.offsetTop;
    if (top < list.scrollTop) list.scrollTop = top - 8;
    else if (top + el.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = top + el.offsetHeight - list.clientHeight + 8;
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

  const me = rec.myColor;
  const them: Color = me === 'w' ? 'b' : 'w';
  const state = game.states[at];
  const view = playerView(state, me);
  const turn = at > 0 ? game.turns[at - 1] : null;
  const lastMove = new Set<Square>();
  if (turn && state.lastMove) {
    lastMove.add(state.lastMove.from);
    lastMove.add(state.lastMove.target);
    if (state.lastMove.to !== null) lastMove.add(state.lastMove.to);
  }
  const checkSquare = state.status === 'check' || state.status === 'checkmate' ? findKing(state, state.turn) : null;
  // The game is over: every action is shown as its player saw it, hidden ones included.
  const texts = (i: number) =>
    game.states[i + 1].history
      .slice(game.turns[i].from, game.turns[i].to)
      .map((h) => tr(h.ownText ?? h.text ?? ''))
      .filter(Boolean);
  const outcome = rec.result.winner === null ? t('Нічия') : rec.result.winner === me ? t('Перемога') : t('Поразка');

  return (
    <section className="page replay">
      <div className="page-head rp-head">
        <button className="btn btn-sm btn-ghost" onClick={() => (history.length > 1 ? history.back() : navigate('/profile'))}>
          ← {t('Назад')}
        </button>
        <h1>{t('Перегляд партії')}</h1>
        <span className={`rp-outcome out-${rec.result.winner === null ? 'draw' : rec.result.winner === me ? 'win' : 'loss'}`}>
          {outcome} · {tr(rec.result.reason)}
        </span>
      </div>

      <div className="rp-layout">
        <div className="rp-board-col">
          <PlayerLine p={rec.players[them]} color={them} />
          <Board
            view={animate ? view : { ...view, fx: null }}
            orientation={me}
            selected={null}
            marks={new Map()}
            lastMove={lastMove}
            hint={new Set()}
            preview={new Set()}
            checkSquare={checkSquare}
            onSquare={() => {}}
            mated={state.status === 'checkmate' ? checkSquare : null}
          />
          <PlayerLine p={rec.players[me]} color={me} />
          <div className="rp-controls">
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

        <div className="rp-side">
          <div className="panel rp-now">
            {turn ? (
              <>
                <span className="eyebrow">
                  {t('Хід {0}', moveNo(turn.ply))} · {tr(rec.players[turn.color].name)}
                </span>
                {texts(at - 1).map((x, i) => (
                  <p key={i}>{x}</p>
                ))}
              </>
            ) : (
              <span className="muted">{t('Початкова позиція')}</span>
            )}
          </div>

          {game.turns.length > 0 && (
            <div className="panel rp-moves">
              <div className="rp-move-grid">
                {game.turns.map((tn, i) => (
                  <button key={i} className={`rp-move c-${tn.color} ${at === i + 1 ? 'on' : ''}`} onClick={() => go(i + 1)}>
                    {tn.color === 'w' && <span className="rp-num">{moveNo(tn.ply)}.</span>}
                    <span className="rp-move-name">{shortText(texts(i))}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/** A turn in a few characters for the move list: "e2–e4", "✨d1×h5" (an ability first). */
function shortText(texts: string[]): string {
  const text = texts.at(-1) ?? '';
  const m = /([a-h][1-8](?:[–×][a-h][1-8])?)/.exec(text);
  return (texts.length > 1 ? '✨' : '') + (m ? m[1] : text.slice(0, 12));
}

function PlayerLine({ p, color }: { p: GameRecord['players'][Color]; color: Color }) {
  return (
    <div className="rp-player">
      {p.avatar ? <Avatar card={p.avatar} size="sm" /> : <span className="avatar avatar-sm rp-bot">🤖</span>}
      <b>{tr(p.name)}</b>
      <span className={`rp-side-dot side-${color}`} />
    </div>
  );
}
