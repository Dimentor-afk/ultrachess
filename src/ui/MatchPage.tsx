import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ABILITY_DEFS, abilityOptions, abilityReady } from '../engine/abilities';
import { HINT_BOT, botLevel } from '../engine/bot/levels';
import { PIECE_NAMES, getCard } from '../engine/cards';
import { opposite, squareName } from '../engine/coords';
import { legalMoves } from '../engine/legal';
import { type Action, type MatchState, createMatch, fullMoves, performAction, resign, withHint } from '../engine/match';
import { findKing } from '../engine/position';
import type { Color, Move, PieceType, Square } from '../engine/types';
import type { MatchFinish, MatchStart } from '../api/client';
import { packArt, pieceSprite } from './cardArt';
import { playerView } from '../engine/view';
import { Board, type Mark, boardRing, squareCenter } from './Board';
import { type Stage, advanceStage, nextStops, stageAt, startStage, stayMoves, stopsOf } from './stage';
import { getSettings, play } from './settings';
import { LADDER_NAMES } from '../economy/leagues';
import { CLAIM_MS } from '../economy/service';
import { DeckIntro, introSteps } from './DeckIntro';
import type { FxName } from './fxSprites';
import { requestBotTurn, requestHint } from './botClient';
import { Avatar, CardView, Glyph } from './common';

export interface GameProps {
  start: MatchStart;
  playerName: string;
  playerAvatar?: string;
  trophies: number;
  /** Report the finished game; resolves to the server's verdict (bot games). */
  onFinish?: (actions: Action[], resigned: boolean) => Promise<MatchFinish>;
  onExit: () => void;
  onRematch?: () => void;
  rematchLabel?: string;
  /** A friend instead of the bot: moves go to the server, theirs come back by polling. */
  remote?: RemoteGame;
  /** Capture effect sprites per side. */
  captureFx?: Partial<Record<Color, FxName>>;
}

export interface RemoteGame {
  opponentName: string;
  opponentAvatar: string;
  initialActions: Action[];
  resignedBy: Color | null;
  poll(): Promise<{ actions: Action[]; resignedBy: Color | null }>;
  send(action: Action, expected: number): Promise<void>;
  resign(): Promise<void>;
  /** A player-ladder game (trophies at stake). */
  ranked?: boolean;
  /** Take the win when the opponent stalls (player ladder). */
  claim?: () => Promise<void>;
}


const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function Game({ start, playerName, playerAvatar, trophies, onFinish, onExit, onRematch, rematchLabel, remote, captureFx }: GameProps) {
  const human = start.color;
  const bot = opposite(human);
  const botOpts = botLevel(start.botLevel).opts;
  // Lets the shell make room for the board (a class is much cheaper than :has(.game)).
  useEffect(() => {
    document.documentElement.classList.add('in-game');
    return () => document.documentElement.classList.remove('in-game');
  }, []);
  const fresh = () => (human === 'w' ? createMatch(start.playerDeck, start.botDeck) : createMatch(start.botDeck, start.playerDeck));
  const replay = (actions: Action[], resignedBy: Color | null) => {
    let m = fresh();
    for (const a of actions) m = performAction(m, a);
    return resignedBy && !m.result ? resign(m, resignedBy) : m;
  };
  const [match, setMatchState] = useState<MatchState>(() => (remote ? replay(remote.initialActions, remote.resignedBy) : fresh()));
  // Every action is recorded so the server can replay and verify the game.
  const actionsRef = useRef<Action[]>(remote ? [...remote.initialActions] : []);
  const sending = useRef(0);
  const matchRef = useRef(match);
  const setMatch = (next: MatchState) => {
    matchRef.current = next;
    setMatchState(next);
  };
  const apply = (m: MatchState, a: Action): MatchState => {
    const next = performAction(m, a);
    const expected = actionsRef.current.length;
    actionsRef.current.push(a);
    if (remote) {
      sending.current++;
      remote
        .send(a, expected)
        .catch((e) => {
          setError(e instanceof Error ? e.message : String(e));
          return resync();
        })
        .finally(() => sending.current--);
    }
    return next;
  };
  // Friend games: rebuild from the server's record when ours went out of step.
  const resync = async () => {
    if (!remote) return;
    const r = await remote.poll();
    actionsRef.current = [...r.actions];
    if (alive.current) setMatch(replay(r.actions, r.resignedBy));
  };
  const [verdict, setVerdict] = useState<MatchFinish | null>(null);
  const [verdictError, setVerdictError] = useState<string | null>(null);
  const reported = useRef(false);
  const report = (resigned: boolean) => {
    if (reported.current || !onFinish) return;
    reported.current = true;
    onFinish(actionsRef.current, resigned)
      .then((v) => alive.current && setVerdict(v))
      .catch((e) => alive.current && setVerdictError(e instanceof Error ? e.message : String(e)));
  };
  const [selected, setSelected] = useState<Square | null>(null);
  // A move is chosen on the board stop by stop: the piece stands on the
  // current stop, and the squares where it may go on are marked.
  const [stage, setStage] = useState<Stage | null>(null);
  // Variants that end on the same square (promotion, …) pick from a small
  // popover over that square.
  const [popover, setPopover] = useState<{ square: Square; moves: Move[] } | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [linePreview, setPreview] = useState<Square[]>([]);
  // Abilities played as a move (Міраж, Ривок Комети): pressing the button switches to those moves.
  const [special, setSpecial] = useState<'mirage' | 'dash' | null>(null);
  const [thinking, setThinking] = useState(false);
  // A fresh game opens with the opponent's deck; the bot waits for it.
  const [intro, setIntro] = useState(() => getSettings().animations && (remote ? remote.initialActions.length === 0 : true));
  // Intro progress: how many of the opponent's cards have landed on the board.
  const [landed, setLanded] = useState(0);
  const [hintBusy, setHintBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSummary, setShowSummary] = useState(true);
  const [confirmResign, setConfirmResign] = useState(false);
  // Player ladder: a stalled opponent can be timed out.
  const [quietSince, setQuietSince] = useState(() => Date.now());
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => setQuietSince(Date.now()), [match.history.length]);
  useEffect(() => {
    if (!remote?.claim) return;
    const t = setInterval(() => setClock(Date.now()), 5000);
    return () => clearInterval(t);
  }, [remote]);
  const alive = useRef(true);
  const historyRef = useRef<HTMLOListElement>(null);
  useEffect(() => () => void (alive.current = false), []);

  const realView = useMemo(() => playerView(match, human), [match, human]);
  const preview = useMemo(() => {
    if (!stage) return null;
    try {
      const stay = stayMoves(stage)[0];
      return stay ? performAction(match, { type: 'move', move: stay }) : null;
    } catch {
      return null;
    }
  }, [stage, match]);
  const view = useMemo(() => (preview ? playerView(preview, human) : realView), [preview, realView, human]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const introPlan = useMemo(() => introSteps(realView, bot), []);
  useEffect(() => {
    const el = historyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [view.history.length]);
  const myTurn = match.turn === human && !match.result;
  const busy = thinking || hintBusy;
  const legal = useMemo(() => (myTurn ? legalMoves(match) : []), [match, myTurn]);
  const specialMoves = (kind: 'mirage' | 'dash') => legal.filter((m) => m.kind === kind);
  const usable = legal.filter((m) => (special ? m.kind === special : m.kind !== 'mirage' && m.kind !== 'dash'));
  const fromSelected = selected === null ? [] : usable.filter((m) => m.from === selected);

  const marks = useMemo(() => {
    const out = new Map<Square, Mark>();
    if (stage) {
      if (stayMoves(stage).length) out.set(stageAt(stage), 'stay');
      for (const [d, ms] of nextStops(stage)) out.set(d, ms.some((m) => m.captures.includes(d)) ? 'capture' : 'option');
      return out;
    }
    if (view.pending && myTurn) {
      for (const s of view.pending.options) out.set(s, 'option');
      return out;
    }
    // First stops as usual; where a move goes on (portal, ricochet, a turn),
    // its final squares show at once in their own colour and can be tapped directly.
    for (const m of fromSelected) {
      const first = stopsOf(m)[0];
      const cur = out.get(first);
      out.set(first, m.captures.includes(first) || cur === 'capture' ? 'capture' : 'move');
    }
    for (const m of fromSelected) {
      const stops = stopsOf(m);
      if (stops.length < 2) continue;
      const end = stops[stops.length - 1];
      const cur = out.get(end);
      if (cur === 'move' || cur === 'capture') continue;
      out.set(end, m.captures.includes(end) || cur === 'far-capture' ? 'far-capture' : 'far');
    }
    return out;
  }, [view.pending, myTurn, fromSelected, stage]);

  const act = useCallback(
    (action: Action) => {
      try {
        setMatch(apply(matchRef.current, action));
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
      setSelected(null);
      setStage(null);
      setPopover(null);
      setMenu(null);
      setPreview([]);
      if (action.type === 'move') setSpecial(null);
    },
    [],
  );

  // Bot turn. Any change of `match` (e.g. resigning) invalidates a pending answer.
  const botToken = useRef(0);
  useEffect(() => {
    const token = ++botToken.current;
    if (remote || intro || match.result || match.turn !== bot) {
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
  }, [match, intro]);

  // Friend games: pick up the opponent's moves.
  useEffect(() => {
    if (!remote) return;
    let stop = false;
    const tick = async () => {
      if (stop || sending.current) return;
      try {
        const r = await remote.poll();
        if (stop || sending.current) return;
        const local = actionsRef.current;
        const same = r.actions.length >= local.length && local.every((a, i) => JSON.stringify(a) === JSON.stringify(r.actions[i]));
        if (!same) {
          actionsRef.current = [...r.actions];
          setMatch(replay(r.actions, r.resignedBy));
          return;
        }
        let m = matchRef.current;
        for (const a of r.actions.slice(local.length)) m = performAction(m, a);
        actionsRef.current = [...r.actions];
        if (r.resignedBy && !m.result) m = resign(m, r.resignedBy);
        if (m !== matchRef.current) setMatch(m);
      } catch {
        // Offline for a moment: try again on the next tick.
      }
    };
    const t = setInterval(tick, 1500);
    return () => {
      stop = true;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remote]);

  // Reached a stop: finish when nothing goes further, otherwise stand there.
  const enter = (st: Stage) => {
    const stay = stayMoves(st);
    if (nextStops(st).size === 0) {
      if (stay.length === 1) return act({ type: 'move', move: stay[0] });
      return setPopover({ square: stageAt(st), moves: stay });
    }
    setStage(st);
  };

  const onSquare = (s: Square) => {
    const cell = view.cells[s];
    if (!myTurn || busy) {
      setSelected(cell ? s : null);
      return;
    }
    if (popover) return setPopover(null);
    if (stage) {
      if (s === stageAt(stage)) {
        const stay = stayMoves(stage);
        if (stay.length === 1) return act({ type: 'move', move: stay[0] });
        if (stay.length > 1) return setPopover({ square: s, moves: stay });
        return;
      }
      const next = advanceStage(stage, s);
      if (!next) {
        setStage(null);
        setSelected(null);
        return;
      }
      return enter(next);
    }
    if (view.pending) {
      if (view.pending.options.includes(s)) act({ type: 'choose', square: s });
      return;
    }
    if (selected !== null) {
      const st = startStage(fromSelected, s);
      if (st) return enter(st);
      // A far square: the end of a move with stops, played in one tap.
      const far = fromSelected.filter((m) => {
        const stops = stopsOf(m);
        return stops.length > 1 && stops[stops.length - 1] === s;
      });
      if (far.length === 1) return act({ type: 'move', move: far[0] });
      if (far.length > 1) return setPopover({ square: s, moves: far });
    }
    setSelected(cell && s !== selected ? s : null);
  };

  // Sounds: one per turn, picked from what happened on the board.
  const soundRef = useRef({ plies: match.history.length, pieces: countPieces(match) });
  useEffect(() => {
    const prev = soundRef.current;
    const pieces = countPieces(match);
    if (match.history.length !== prev.plies) {
      if (match.result) play(match.result.winner === human ? 'win' : 'loss');
      else if (match.status === 'check') play('check');
      else play(pieces < prev.pieces ? 'capture' : 'move');
    }
    soundRef.current = { plies: match.history.length, pieces };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match]);

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
      const move = await requestHint(armed, human, HINT_BOT);
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
  } else if (stage) {
    statusText = stayMoves(stage).length
      ? 'Фігура тут. Натисніть її, щоб зупинитись, або підсвічену клітинку, щоб іти далі'
      : 'Оберіть підсвічену клітинку, куди йти далі';
  } else if (myTurn && view.pending) {
    statusText = 'Вершника вдарили: оберіть клітинку для відстрибу';
  } else if (myTurn) {
    statusText = match.status === 'check' ? 'Ваш хід — вам шах!' : 'Ваш хід';
  } else {
    statusText = remote
      ? match.status === 'check'
        ? `Шах! Хід: ${remote.opponentName}…`
        : `Хід суперника: ${remote.opponentName}…`
      : match.status === 'check'
        ? 'Шах боту. Бот думає…'
        : 'Бот думає…';
  }

  return (
    <section className="page game">
      <div className="game-board-col">
        <div className={`player-bar ${match.turn === bot && !match.result ? 'to-move' : ''}`}>
          <span className="pb-who">
            {remote ? <Avatar card={remote.opponentAvatar} /> : <span className="avatar avatar-bot">🤖</span>}
            <span>
              <b>{remote ? remote.opponentName : `Бот · ${botLevel(start.botLevel).name}`}</b>
              <small className="muted">{start.botDeck.name}</small>
            </span>
          </span>
          <Captured types={lostPieces(match, human)} color={human} />
          {(thinking || (remote && match.turn === bot && !match.result)) && (
            <span className="thinking" aria-live="polite">
              {remote ? 'ходить…' : 'думає…'}
            </span>
          )}
        </div>
        <div className="board-wrap">
          <Board
            view={view}
            orientation={human}
            selected={stage ? stageAt(stage) : selected}
            marks={marks}
            lastMove={lastMove}
            hint={hint}
            preview={new Set(linePreview)}
            checkSquare={checkSquare}
            onSquare={onSquare}
            celebrate={!!match.result && match.result.winner === human}
            captureFx={captureFx}
            introHidden={intro ? new Set(introPlan.slice(landed).flatMap((x) => x.squares)) : undefined}
            introLanding={intro && landed > 0 ? new Set(introPlan[landed - 1].squares) : undefined}
          />
          {popover && (
            <div
              className={`board-popover ${squareCenter(popover.square, human, boardRing(view, marks)).y < 50 ? 'grow-down' : 'grow-up'}`}
              style={{ left: `${squareCenter(popover.square, human, boardRing(view, marks)).x}%`, top: `${squareCenter(popover.square, human, boardRing(view, marks)).y}%` }}
              role="dialog"
              aria-label="Оберіть варіант ходу"
            >
              {popover.moves.map((m, i) => (
                <button key={i} className="btn btn-sm" onClick={() => act({ type: 'move', move: m })}>
                  {m.promotion && <Glyph type={m.promotion} color={human} />} {m.promotion ? PROMO_NAMES[m.promotion] : m.label}
                </button>
              ))}
              <button className="btn btn-sm btn-ghost" onClick={() => setPopover(null)}>
                Скасувати
              </button>
            </div>
          )}
        </div>
        <div className={`player-bar ${myTurn ? 'to-move' : ''}`}>
          <span className="pb-who">
            {playerAvatar ? <Avatar card={playerAvatar} /> : <span className="avatar">{playerName.slice(0, 1).toUpperCase()}</span>}
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
          <span className="eyebrow mode-tag">{remote
              ? remote.ranked
                ? 'Ліга гравців'
                : 'Гра з другом'
              : start.trial
                ? `${start.trial.name} · раунд ${start.trial.round}/${start.trial.rounds}`
                : start.ranked
                  ? 'Ліга ботів'
                  : 'Тренування'}</span>
          <br />
          <strong>{statusText}</strong>
          {error && <p className="error-text">{error}</p>}
          {special === 'mirage' && <p className="tip">Міраж увімкнено: оберіть стрибок коня без взяття.</p>}
          {special === 'dash' && <p className="tip">Ривок Комети: оберіть клітинку за 2–5 кроків по прямій.</p>}
          {fromSelected.some((m) => m.kind === 'levitate') && (
            <p className="tip">Сині плитки за краєм дошки — платформи левітації. Фігура мусить повернутися за 3 ходи суперника.</p>
          )}
        </div>

        {myAbilityPieces.length > 0 && (
          <div className="ability-dock" aria-label="Здібності">
            {myAbilityPieces.map(({ c }) => {
              const card = getCard(c!.cardId);
              const def = ABILITY_DEFS[c!.cardId];
              const cd = match.cooldowns[c!.id] ?? 0;
              const ready = cd === 0;
              const canPress = myTurn && !busy && !view.pending && !stage && ready && !!def && !def.viaMove && abilityReady(match, c!.id);
              const viaMoveKind = def?.id === 'mirage' || def?.id === 'dash' ? def.id : null;
              const on = (!!viaMoveKind && special === viaMoveKind) || menu === c!.id || (def?.id === 'immortal' && view.immortalArmed);
              const press = () => {
                if (!def) return;
                if (viaMoveKind) {
                  const turnOn = special !== viaMoveKind;
                  setSpecial(turnOn ? viaMoveKind : null);
                  setSelected(turnOn ? (specialMoves(viaMoveKind)[0]?.from ?? null) : null);
                } else if (def.id === 'immortal') act({ type: 'ability', pieceId: c!.id, key: 'arm' });
                else if (def.id === 'hint') void showHint(c!.id);
                else setMenu(menu === c!.id ? null : c!.id);
              };
              const disabled = viaMoveKind ? !myTurn || busy || (special !== viaMoveKind && specialMoves(viaMoveKind).length === 0) : !canPress;
              const sprite = pieceSprite(c!.cardId, c!.type, human);
              // Levitation has no button (it is a move); Міраж is pressed, then played as a jump.
              const passive = !def || (def.viaMove && !viaMoveKind);
              return (
                <button
                  key={c!.id}
                  type="button"
                  className={`ability-tile r-${card.rarity} ${ready ? 'ready' : ''} ${on ? 'on' : ''} ${passive ? 'passive' : ''}`}
                  disabled={passive || disabled}
                  onClick={press}
                  title={card.rulesText}
                >
                  <span className="ability-art">
                    <img className={`pixel ${sprite.tint ? 'tinted' : ''}`} src={sprite.src} alt="" />
                    {!ready && <span className="ability-cd">{cd}</span>}
                  </span>
                  <span className="ability-text">
                    {card.rarity === 'mythological' && <span className="ability-eyebrow">Міфічна здібність</span>}
                    <b>{def?.name ?? 'Левітація'}</b>
                    <small>
                      {!ready
                        ? `перезарядка: ${cd} ход.`
                        : passive
                          ? 'готово — ходом фігури'
                          : def.id === 'immortal'
                            ? view.immortalArmed
                              ? 'захист увімкнено'
                              : 'увімкнути захист'
                            : def.id === 'hint'
                              ? hintBusy
                                ? 'рахую…'
                                : 'показати найкращий хід'
                              : viaMoveKind
                                ? special === viaMoveKind
                                  ? 'скасувати'
                                  : myTurn && specialMoves(viaMoveKind).length === 0
                                    ? 'зараз немає куди'
                                    : viaMoveKind === 'mirage'
                                    ? 'стрибок з ілюзіями'
                                    : 'ривок до 5 клітинок'
                                : 'обрати лінію'}
                    </small>
                  </span>
                </button>
              );
            })}
          </div>
        )}
        {menu && (
          <div className="ability-options" onMouseLeave={() => setPreview([])}>
            {menuOptions.map((o) => (
              <button
                key={o.key}
                className="btn btn-sm"
                onMouseEnter={() => setPreview(o.squares)}
                onFocus={() => setPreview(o.squares)}
                onClick={() => act({ type: 'ability', pieceId: menu, key: o.key })}
              >
                {o.label}
              </button>
            ))}
            <button className="btn btn-sm btn-ghost" onClick={() => setMenu(null)}>
              Скасувати
            </button>
          </div>
        )}
        {view.hint && (
          <p className="tip">
            Підказка: {PIECE_NAMES[view.cells[view.hint.from]?.type ?? 'pawn']} {squareName(view.hint.from)} → {squareName(view.hint.target)} (
            {view.hint.label})
          </p>
        )}

        <div className="panel">
          <h2>Фігура</h2>
          {selectedPiece ? (
            <div>
              <CardView card={getCard(selectedPiece.cardId)} compact color={selectedPiece.color} />
              <ul className="piece-status small">
                <li>
                  {selectedPiece.color === human ? 'Ваша' : 'Суперника'}, {squareName(selected!)}
                </li>
                {selectedPiece.illusion && <li>Це ваша ілюзія: суперник бачить звичайну фігуру.</li>}
                {selectedPiece.frozen && <li>❄ пропускає хід</li>}
                {selectedPiece.onceUsed && <li>Здібність «раз за гру» вже використано</li>}
                {selectedPiece.cooldown !== null && selectedPiece.cooldown > 0 && <li>Перезарядка: ще {selectedPiece.cooldown} ваших ход.</li>}
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
          {remote?.claim && !match.result && !myTurn && clock - quietSince > CLAIM_MS && (
            <button
              className="btn btn-primary"
              onClick={() =>
                remote.claim!()
                  .then(resync)
                  .catch((e) => setError(e instanceof Error ? e.message : String(e)))
              }
            >
              Суперник мовчить — забрати перемогу
            </button>
          )}
          {!match.result && (
            <button
              className="btn btn-danger"
              onClick={() => {
                if (!confirmResign) return setConfirmResign(true);
                setStage(null);
                setPopover(null);
                setMatch(resign(matchRef.current, human));
                if (remote) void remote.resign().catch(() => resync());
                else report(true);
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

      {intro && (
        <DeckIntro
          steps={introPlan}
          color={bot}
          opponent={remote ? remote.opponentName : `Бот · ${botLevel(start.botLevel).name}`}
          onLand={setLanded}
          onDone={() => setIntro(false)}
        />
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
            {remote && !remote.ranked && <p className="muted">Дружня гра: кубки не змінюються, партія є в історії обох гравців.</p>}
            {onFinish && !verdict && !verdictError && <p className="muted">{remote ? 'Рахуємо кубки…' : 'Перевіряємо партію…'}</p>}
            {verdictError && <p className="error-text">{verdictError}</p>}
            {verdict?.ladder && (
              <div className="verdict">
                <span className="eyebrow">{LADDER_NAMES[verdict.ladder]}</span>
                <span className={`trophy-delta ${verdict.trophiesDelta >= 0 ? 'up' : 'down'}`}>
                  🏆 {verdict.trophiesDelta >= 0 ? '+' : ''}
                  {verdict.trophiesDelta}
                </span>
                <span className="muted">
                  Тепер: {verdict.profile.ladders[verdict.ladder].trophies} · {verdict.profile.ladders[verdict.ladder].leagueName}
                </span>
                {verdict.goldDelta > 0 && <span className="loot-item gold">🪙 +{verdict.goldDelta} золота</span>}
                {verdict.reward && (
                  <div className="reward">
                    <img className="pack-img" src={packArt(verdict.reward.type)} alt="" />
                    <div>
                      <b>{verdict.reward.name}</b>
                      <small className="muted">
                        уже чекає на головній · паків сьогодні {verdict.profile.ladders[verdict.ladder].packsToday}/
                        {verdict.profile.ladders[verdict.ladder].packsLimit}
                      </small>
                    </div>
                  </div>
                )}
                {verdict.rewardSkipped && (
                  <p className="muted small">
                    Ліміт {verdict.profile.ladders[verdict.ladder].packsLimit} паків на сьогодні в цій лізі вичерпано — завтра паки знову падатимуть.
                  </p>
                )}
                {verdict.leagueUps.map((l) => (
                  <div key={l.name} className="league-up">
                    <span className="league-up-title">🎉 Нова ліга: {l.name}!</span>
                    <span>
                      {l.gold > 0 && <>🪙 +{l.gold} </>}
                      {l.pack && <>· {l.pack.name}</>}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {verdict?.trial && (
              <div className="verdict">
                <span className="eyebrow">{verdict.trial.name}</span>
                {verdict.trial.status === 'won' ? (
                  <>
                    <span className="trophy-delta up">🏅 Випробування пройдено!</span>
                    {verdict.trial.card && (
                      <div className="trial-won-card">
                        <CardView card={getCard(verdict.trial.card)} />
                        <small className="muted">Нова картка вже у вашій колекції — поставте її в колоду.</small>
                      </div>
                    )}
                    {verdict.trial.reward && (
                      <div className="reward">
                        <img className="pack-img" src={packArt(verdict.trial.reward.type)} alt="" />
                        <div>
                          <b>{verdict.trial.reward.name}</b>
                          <small className="muted">уже чекає на головній</small>
                        </div>
                      </div>
                    )}
                  </>
                ) : verdict.trial.status === 'lost' ? (
                  <span className="trophy-delta down">Спробу завершено: {verdict.trial.wins} з {verdict.trial.rounds} перемог</span>
                ) : (
                  <span className="trophy-delta up">
                    Раунд пройдено: {verdict.trial.wins} / {verdict.trial.rounds}
                  </span>
                )}
              </div>
            )}
            {verdict && !verdict.ladder && !verdict.trial && <p className="muted">Тренування: кубки й паки не нараховуються.</p>}
            <div className="editor-actions">
              {onRematch && (
                <button className="btn btn-primary" onClick={onRematch}>
                  {rematchLabel ?? (remote ? 'Шукати ще' : 'Ще бій')}
                </button>
              )}
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

const PROMO_NAMES: Partial<Record<PieceType, string>> = { queen: 'Ферзь', rook: 'Тура', bishop: 'Слон', knight: 'Кінь' };

function countPieces(m: MatchState): number {
  return m.board.reduce((n, p) => n + (p ? 1 : 0), 0);
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
