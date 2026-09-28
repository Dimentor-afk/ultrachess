import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ABILITY_DEFS, abilityOptions, abilityReady } from '../engine/abilities';
import type { BotOptions } from '../engine/bot/search';
import { PIECE_NAMES, getCard } from '../engine/cards';
import { opposite, squareName } from '../engine/coords';
import { legalMoves } from '../engine/legal';
import { type Action, type MatchState, createMatch, fullMoves, performAction, resign, withHint } from '../engine/match';
import { findKing } from '../engine/position';
import type { Color, Move, PieceType, Square } from '../engine/types';
import type { MatchFinish, MatchStart } from '../api/client';
import { packArt } from './cardArt';
import { playerView } from '../engine/view';
import { Board, type Mark } from './Board';
import { requestBotTurn, requestHint } from './botClient';
import { CardView, Glyph } from './common';

export interface GameProps {
  start: MatchStart;
  playerName: string;
  trophies: number;
  /** Report the finished game; resolves to the server's verdict. */
  onFinish: (actions: Action[], resigned: boolean) => Promise<MatchFinish>;
  onExit: () => void;
  onRematch: () => void;
}

export function botOptions(level: number): BotOptions {
  return { depth: level, timeMs: level >= 3 ? 2500 : 1500 };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function Game({ start, playerName, trophies, onFinish, onExit, onRematch }: GameProps) {
  const human = start.color;
  const bot = opposite(human);
  const botOpts = botOptions(start.botLevel);
  const [match, setMatchState] = useState<MatchState>(() =>
    human === 'w' ? createMatch(start.playerDeck, start.botDeck) : createMatch(start.botDeck, start.playerDeck),
  );
  // Every action is recorded so the server can replay and verify the game.
  const actionsRef = useRef<Action[]>([]);
  const matchRef = useRef(match);
  const setMatch = (next: MatchState) => {
    matchRef.current = next;
    setMatchState(next);
  };
  const apply = (m: MatchState, a: Action): MatchState => {
    const next = performAction(m, a);
    actionsRef.current.push(a);
    return next;
  };
  const [verdict, setVerdict] = useState<MatchFinish | null>(null);
  const [verdictError, setVerdictError] = useState<string | null>(null);
  const reported = useRef(false);
  const report = (resigned: boolean) => {
    if (reported.current) return;
    reported.current = true;
    onFinish(actionsRef.current, resigned)
      .then((v) => alive.current && setVerdict(v))
      .catch((e) => alive.current && setVerdictError(e instanceof Error ? e.message : String(e)));
  };
  const [selected, setSelected] = useState<Square | null>(null);
  const [choice, setChoice] = useState<Move[] | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [preview, setPreview] = useState<Square[]>([]);
  const [mirage, setMirage] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [hintBusy, setHintBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSummary, setShowSummary] = useState(true);
  const [confirmResign, setConfirmResign] = useState(false);
  const alive = useRef(true);
  const historyRef = useRef<HTMLOListElement>(null);
  useEffect(() => () => void (alive.current = false), []);

  const view = useMemo(() => playerView(match, human), [match, human]);
  useEffect(() => {
    const el = historyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [view.history.length]);
  const myTurn = match.turn === human && !match.result;
  const busy = thinking || hintBusy;
  const legal = useMemo(() => (myTurn ? legalMoves(match) : []), [match, myTurn]);
  const mirageMoves = legal.filter((m) => m.kind === 'mirage');
  const usable = legal.filter((m) => (mirage ? m.kind === 'mirage' : m.kind !== 'mirage'));
  const fromSelected = selected === null ? [] : usable.filter((m) => m.from === selected);

  const marks = useMemo(() => {
    const out = new Map<Square, Mark>();
    if (view.pending && myTurn) {
      for (const s of view.pending.options) out.set(s, 'option');
      return out;
    }
    for (const m of fromSelected) {
      const cur = out.get(m.target);
      out.set(m.target, m.captures.length || cur === 'capture' ? 'capture' : 'move');
    }
    return out;
  }, [view.pending, myTurn, fromSelected]);

  const act = useCallback(
    (action: Action) => {
      try {
        setMatch(apply(matchRef.current, action));
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
      setSelected(null);
      setChoice(null);
      setMenu(null);
      setPreview([]);
      if (action.type === 'move') setMirage(false);
    },
    [],
  );

  // Bot turn. Any change of `match` (e.g. resigning) invalidates a pending answer.
  const botToken = useRef(0);
  useEffect(() => {
    const token = ++botToken.current;
    if (match.result || match.turn !== bot) {
      setThinking(false);
      return;
    }
    setThinking(true);
    (async () => {
      const started = Date.now();
      let next = match;
      try {
        const turn = await requestBotTurn(match, bot, botOpts);
        await sleep(Math.max(0, 450 - (Date.now() - started)));
        const recorded: Action[] = [];
        for (const a of turn.actions) {
          next = performAction(next, a);
          recorded.push(a);
        }
        if (token !== botToken.current || !alive.current) return;
        actionsRef.current.push(...recorded);
      } catch (e) {
        console.error('Bot failed, playing a fallback move', e);
        if (token !== botToken.current || !alive.current) return;
        next = match;
        const pc = next.pending.find((p) => p.color === bot);
        if (pc) next = apply(next, { type: 'choose', square: pc.options[0] });
        const fallback = legalMoves(next)[0];
        if (fallback) next = apply(next, { type: 'move', move: fallback });
      }
      if (token !== botToken.current || !alive.current) return;
      setMatch(next);
      setThinking(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match]);

  const onSquare = (s: Square) => {
    const cell = view.cells[s];
    if (!myTurn || busy) {
      setSelected(cell ? s : null);
      return;
    }
    if (view.pending) {
      if (view.pending.options.includes(s)) act({ type: 'choose', square: s });
      return;
    }
    if (selected !== null) {
      const ms = fromSelected.filter((m) => m.target === s);
      if (ms.length === 1) return act({ type: 'move', move: ms[0] });
      if (ms.length > 1) return setChoice(ms);
    }
    setSelected(cell && s !== selected ? s : null);
  };

  useEffect(() => {
    if (match.result) report(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match.result]);

  const showHint = async (pieceId: string) => {
    let armed: MatchState;
    try {
      armed = apply(match, { type: 'ability', pieceId, key: 'show' });
    } catch (e) {
      setError(String(e));
      return;
    }
    setMatch(armed);
    setHintBusy(true);
    try {
      const move = await requestHint(armed, human, { ...botOpts, depth: Math.max(2, botOpts.depth) });
      if (alive.current && matchRef.current.ply === armed.ply) setMatch(withHint(matchRef.current, human, move));
    } finally {
      if (alive.current) setHintBusy(false);
    }
  };

  const lastMove = new Set<Square>();
  if (view.lastMove) {
    lastMove.add(view.lastMove.from);
    lastMove.add(view.lastMove.target);
    if (view.lastMove.to !== null) lastMove.add(view.lastMove.to);
  }
  const hint = new Set<Square>(view.hint ? [view.hint.from, view.hint.target] : []);
  const checkSquare = match.status === 'check' || match.status === 'checkmate' ? findKing(match, match.turn) : null;

  const myAbilityPieces = view.cells
    .map((c, s) => ({ c, s }))
    .filter(({ c }) => c && c.color === human && !c.illusion && (ABILITY_DEFS[c.cardId] || c.cardId.endsWith('levitation')));

  const selectedPiece = selected !== null ? view.cells[selected] : null;
  const menuOptions = useMemo(() => (menu ? abilityOptions(match, menu) : []), [menu, match]);

  let statusText: string;
  if (match.result) {
    statusText =
      match.result.winner === null ? `Нічия — ${match.result.reason}` : match.result.winner === human ? `Перемога! ${match.result.reason}` : `Поразка. ${match.result.reason}`;
  } else if (myTurn && view.pending) {
    statusText = 'Вершника вдарили: оберіть клітинку для відстрибу';
  } else if (myTurn) {
    statusText = match.status === 'check' ? 'Ваш хід — вам шах!' : 'Ваш хід';
  } else {
    statusText = match.status === 'check' ? 'Шах боту. Бот думає…' : 'Бот думає…';
  }

  return (
    <section className="page game">
      <div className="game-board-col">
        <div className={`player-bar ${match.turn === bot && !match.result ? 'to-move' : ''}`}>
          <span className="pb-who">
            <span className="avatar avatar-bot">🤖</span>
            <span>
              <b>Бот · рівень {start.botLevel}</b>
              <small className="muted">{start.botDeck.name}</small>
            </span>
          </span>
          <Captured types={lostPieces(match, human)} color={human} />
          {thinking && <span className="thinking" aria-live="polite">думає…</span>}
        </div>
        <Board
          view={view}
          orientation={human}
          selected={selected}
          marks={marks}
          lastMove={lastMove}
          hint={hint}
          preview={new Set(preview)}
          checkSquare={checkSquare}
          onSquare={onSquare}
        />
        <div className={`player-bar ${myTurn ? 'to-move' : ''}`}>
          <span className="pb-who">
            <span className="avatar">{playerName.slice(0, 1).toUpperCase()}</span>
            <span>
              <b>{playerName}</b>
              <small className="muted">
                🏆 {trophies} · {start.playerDeck.name}
              </small>
            </span>
          </span>
          <Captured types={lostPieces(match, bot)} color={bot} />
          <span className="muted small">Хід {fullMoves(match.ply) + (match.turn === 'w' ? 1 : 0)}</span>
        </div>
      </div>

      <aside className="game-side">
        <div className={`panel status status-${match.result ? 'over' : myTurn ? 'mine' : 'bot'}`} aria-live="polite">
          <span className="eyebrow mode-tag">{start.ranked ? 'Рейтинговий бій' : 'Тренування'}</span>
          <br />
          <strong>{statusText}</strong>
          {error && <p className="error-text">{error}</p>}
          {mirage && <p className="tip">Міраж увімкнено: оберіть стрибок коня без взяття.</p>}
          {fromSelected.some((m) => m.kind === 'levitate') && (
            <p className="tip">Сині плитки за краєм дошки — платформи левітації. Фігура мусить повернутися за 3 ходи суперника.</p>
          )}
        </div>

        {myAbilityPieces.length > 0 && (
          <div className="panel">
            <h2>Здібності</h2>
            {myAbilityPieces.map(({ c, s }) => {
              const card = getCard(c!.cardId);
              const def = ABILITY_DEFS[c!.cardId];
              const cd = match.cooldowns[c!.id] ?? 0;
              const ready = cd === 0;
              const canPress = myTurn && !busy && !view.pending && ready && !!def && !def.viaMove && abilityReady(match, c!.id);
              return (
                <div key={c!.id} className="ability">
                  <div className="ability-head">
                    <span>
                      <Glyph type={c!.type} color={human} /> {def?.name ?? 'Левітація'}{' '}
                      <span className="muted small">({card.name}, {squareName(s)})</span>
                    </span>
                    <span className={`pill ${ready ? 'pill-ok' : ''}`}>{ready ? 'готово' : `ще ${cd} ход.`}</span>
                  </div>
                  {def?.id === 'mirage' && (
                    <button
                      className={`btn btn-sm ${mirage ? 'btn-primary' : ''}`}
                      disabled={!myTurn || busy || (!mirage && mirageMoves.length === 0)}
                      onClick={() => {
                        setMirage(!mirage);
                        setSelected(mirageMoves[0]?.from ?? null);
                      }}
                    >
                      {mirage ? 'Скасувати міраж' : 'Міраж: стрибок з ілюзіями'}
                    </button>
                  )}
                  {def && !def.viaMove && (
                    <>
                      <button
                        className="btn btn-sm"
                        disabled={!canPress}
                        onClick={() => {
                          if (def.id === 'immortal') act({ type: 'ability', pieceId: c!.id, key: 'arm' });
                          else if (def.id === 'hint') void showHint(c!.id);
                          else setMenu(menu === c!.id ? null : c!.id);
                        }}
                      >
                        {def.id === 'immortal' ? 'Увімкнути захист' : def.id === 'hint' ? 'Показати найкращий хід' : 'Обрати лінію…'}
                      </button>
                      {def.id === 'immortal' && view.immortalArmed && <p className="small ok-text">Захист діє на цей хід суперника.</p>}
                      {hintBusy && def.id === 'hint' && <p className="small muted">Рахую…</p>}
                      {view.hint && def.id === 'hint' && (
                        <p className="small ok-text">
                          Підказка: {PIECE_NAMES[view.cells[view.hint.from]?.type ?? 'pawn']} {squareName(view.hint.from)} → {squareName(view.hint.target)} ({view.hint.label})
                        </p>
                      )}
                      {menu === c!.id && (
                        <div className="ability-options" onMouseLeave={() => setPreview([])}>
                          {menuOptions.map((o) => (
                            <button
                              key={o.key}
                              className="btn btn-sm"
                              onMouseEnter={() => setPreview(o.squares)}
                              onFocus={() => setPreview(o.squares)}
                              onClick={() => act({ type: 'ability', pieceId: c!.id, key: o.key })}
                            >
                              {o.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
            <p className="muted small">Кнопки не витрачають хід — після них ви ходите як звичайно.</p>
          </div>
        )}

        <div className="panel">
          <h2>Фігура</h2>
          {selectedPiece ? (
            <div>
              <CardView card={getCard(selectedPiece.cardId)} compact />
              <ul className="piece-status small">
                <li>
                  {selectedPiece.color === human ? 'Ваша' : 'Суперника'}, {squareName(selected!)}
                </li>
                {selectedPiece.illusion && <li>Це ваша ілюзія: суперник бачить звичайну фігуру.</li>}
                {selectedPiece.frozen && <li>❄ пропускає хід</li>}
                {selectedPiece.onceUsed && <li>Здібність «раз за гру» вже використано</li>}
                {selectedPiece.cooldown !== null && selectedPiece.cooldown > 0 && <li>Cooldown: ще {selectedPiece.cooldown} ход.</li>}
                {selectedPiece.passenger && <li>Везе пішака-пасажира</li>}
                {selectedPiece.platformTurnsLeft !== null && <li>На платформі: зникне через {selectedPiece.platformTurnsLeft} ход. суперника</li>}
              </ul>
            </div>
          ) : (
            <p className="muted small">Натисніть на фігуру, щоб побачити її картку.</p>
          )}
        </div>

        <div className="panel history">
          <h2>Хід партії</h2>
          <ol ref={historyRef}>
            {view.history.map((h, i) => (
              <li key={i}>
                <span className="mono muted">{Math.floor(h.ply / 2) + 1}.</span> <Glyph type="pawn" color={h.color} /> {h.text}
              </li>
            ))}
          </ol>
        </div>

        <div className="game-actions">
          {!match.result && (
            <button
              className="btn btn-danger"
              onClick={() => {
                if (!confirmResign) return setConfirmResign(true);
                setMatch(resign(matchRef.current, human));
                report(true);
              }}
              onBlur={() => setConfirmResign(false)}
            >
              {confirmResign ? 'Точно здатися?' : 'Здатися'}
            </button>
          )}
          {match.result && (
            <button className="btn" onClick={onExit}>
              До меню
            </button>
          )}
        </div>
      </aside>

      {choice && (
        <div className="modal-backdrop" onClick={() => setChoice(null)}>
          <div className="modal" role="dialog" aria-label="Оберіть варіант ходу" onClick={(e) => e.stopPropagation()}>
            <h2>Оберіть варіант</h2>
            {choice.map((m, i) => (
              <button key={i} className="btn btn-block" onClick={() => act({ type: 'move', move: m })}>
                {m.label}
                {m.to !== null && m.to !== m.target ? ` → ${squareName(m.to)}` : ''}
              </button>
            ))}
            <button className="btn btn-ghost btn-block" onClick={() => setChoice(null)}>
              Скасувати
            </button>
          </div>
        </div>
      )}

      {match.result && showSummary && (
        <div className="modal-backdrop">
          <div className="modal summary" role="dialog" aria-label="Підсумок партії">
            <h2 className={`outcome outcome-${match.result.winner === null ? 'draw' : match.result.winner === human ? 'win' : 'loss'}`}>
              {match.result.winner === null ? 'Нічия' : match.result.winner === human ? 'Перемога!' : 'Поразка'}
            </h2>
            <p>
              {match.result.reason} · ходів: {match.result.moves}
            </p>
            {!verdict && !verdictError && <p className="muted">Перевіряємо партію…</p>}
            {verdictError && <p className="error-text">{verdictError}</p>}
            {verdict && start.ranked && (
              <div className="verdict">
                <span className={`trophy-delta ${verdict.trophiesDelta >= 0 ? 'up' : 'down'}`}>
                  🏆 {verdict.trophiesDelta >= 0 ? '+' : ''}
                  {verdict.trophiesDelta}
                </span>
                <span className="muted">Тепер: {verdict.profile.trophies} · {verdict.profile.arena}</span>
                {verdict.reward && (
                  <div className="reward">
                    <img className="pack-img" src={packArt(verdict.reward.type)} alt="" />
                    <div>
                      <b>{verdict.reward.name}</b>
                      <small className="muted">у слоті на головній · відкривається {verdict.reward.unlockMinutes} хв</small>
                    </div>
                  </div>
                )}
                {verdict.rewardSkipped && <p className="error-text small">Усі 4 слоти зайняті — пак не отримано. Відкрийте паки!</p>}
              </div>
            )}
            {verdict && !start.ranked && <p className="muted">Тренування: кубки й паки не нараховуються.</p>}
            <div className="editor-actions">
              <button className="btn btn-primary" onClick={onRematch}>
                Ще бій
              </button>
              <button className="btn" onClick={onExit}>
                До меню
              </button>
              <button className="btn btn-ghost" onClick={() => setShowSummary(false)}>
                Дошка
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

const START_COUNT: Record<PieceType, number> = { pawn: 8, knight: 2, bishop: 2, rook: 2, queen: 1, king: 1 };

/** Pieces of `color` no longer in play (approximate after promotions). */
function lostPieces(match: MatchState, color: Color): PieceType[] {
  const have: Record<PieceType, number> = { pawn: 0, knight: 0, bishop: 0, rook: 0, queen: 0, king: 0 };
  for (const p of match.board) if (p && p.color === color) have[p.type]++;
  for (const pc of match.pending) if (pc.piece.color === color) have[pc.piece.type]++;
  for (const p of Object.values(match.passengers)) if (p.color === color) have.pawn++;
  const out: PieceType[] = [];
  for (const t of ['queen', 'rook', 'bishop', 'knight', 'pawn'] as PieceType[]) {
    for (let i = have[t]; i < START_COUNT[t]; i++) out.push(t);
  }
  return out;
}

function Captured({ types, color }: { types: PieceType[]; color: Color }) {
  if (!types.length) return null;
  return (
    <span className="captured" title="Взяті фігури">
      {types.map((t, i) => (
        <Glyph key={i} type={t} color={color} />
      ))}
    </span>
  );
}
