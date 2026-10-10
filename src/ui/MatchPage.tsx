import { WEEKLY_GAMES, WEEKLY_TIERS, divisionByN } from '../economy/weekly';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ABILITY_DEFS, abilityOptions, abilityReady } from '../engine/abilities';
import { HINT_BOT, botLevel } from '../engine/bot/levels';
import { PIECE_NAMES, getCard } from '../engine/cards';
import { opposite, squareName } from '../engine/coords';
import { type Action, type MatchState, fullMoves, performAction, resign } from '../engine/match';
import { findKing } from '../engine/position';
import type { Color, Move, PieceType, Square } from '../engine/types';
import type { ViewPiece } from '../engine/view';
import type { GameView, MatchFinish, MatchStart, PlayerCard } from '../api/client';
import type { LiveStatus } from '../api/live';
import { packArt, pieceSprite } from './cardArt';
import { playerView } from '../engine/view';
import { Board, type Mark, boardRing, legsMs, mateTimes, squareCenter } from './Board';
import { type MatchFx, moveLegs } from '../engine/fx';
import { type Stage, advanceStage, nextStops, stageAt, startStage, stayMoves, stopsOf } from './stage';
import { getSettings, play } from './settings';
import { LADDER_NAMES } from '../economy/leagues';
import { CLAIM_MS } from '../economy/service';
import { DeckIntro, introSteps } from './DeckIntro';
import type { FxName } from './fxSprites';
import { requestHint } from './botClient';
import { Avatar, CardView, Glyph } from './common';
import { CardModal } from './CardModal';
import { Medal, TitlePlate } from './Achievements';
import { PlayerModal } from './PlayerModal';
import { EMOTES, EMOTE_GAP_MS } from '../economy/emotes';
import { ACHIEVEMENT_BY_ID } from '../economy/achievements';
import { t, tr } from '../i18n';

export interface GameProps {
  start: MatchStart;
  playerName: string;
  playerAvatar?: string;
  /** The achievement plate under the player's name. */
  playerTitle?: string | null;
  trophies: number;
  /** Report the finished game; resolves to the server's verdict (bot games). */
  onFinish?: (resigned: boolean) => Promise<MatchFinish>;
  /**
   * Bot games: send the player's action (null: let the bot move, or just
   * fetch the game) and get the player's view back, with the bot's answer.
   */
  onAction?: (action: Action | null, v: string) => Promise<{ view: GameView; stale?: boolean }>;
  onExit: () => void;
  onRematch?: () => void;
  rematchLabel?: string;
  /** A game with people (or one you watch): views come from the server, live. */
  remote?: RemoteGame;
  /** Capture effect sprites per side. */
  captureFx?: Partial<Record<Color, FxName>>;
}

/** An update of a game with people: the viewer's view and who is watching. */
export interface RemoteUpdate {
  view: GameView;
  watchers: number;
}

export interface RemoteGame {
  /** Your side; null when you watch someone else's game. */
  you: Color | null;
  white: PlayerCard;
  black: PlayerCard;
  /** A player-ladder game (trophies at stake). */
  ranked?: boolean;
  /** New views as the server sends them (WebSocket; polling in the demo). Returns the unsubscribe function. */
  subscribe(cb: (u: RemoteUpdate) => void): () => void;
  /** The game as it is now (after an error). */
  fetch(): Promise<GameView>;
  send(action: Action, v: string): Promise<GameView>;
  resign(): Promise<GameView>;
  /** Take the win when the opponent stalls (player ladder). */
  claim?: () => Promise<GameView>;
  /** The live connection, for the "reconnecting" banner (absent in the demo). */
  onStatus?: (cb: (s: LiveStatus) => void) => () => void;
  /** Link to this game, for the opponent or spectators. */
  shareUrl?: string;
  /** Send a reaction (players of a live game). */
  emote?: (e: string) => void;
  /** Reactions as they come: whose side and which emoji. */
  onEmote?: (cb: (color: Color, e: string) => void) => () => void;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function Game({ start, playerName, playerAvatar, playerTitle, trophies, onFinish, onAction, onExit, onRematch, rematchLabel, remote, captureFx }: GameProps) {
  // A spectator sees the board from white's side and acts as nobody.
  const spectator = !!remote && remote.you === null;
  const human = start.color;
  const bot = opposite(human);
  // Lets the shell make room for the board (a class is much cheaper than :has(.game)).
  useEffect(() => {
    document.documentElement.classList.add('in-game');
    return () => document.documentElement.classList.remove('in-game');
  }, []);
  const alive = useRef(true);
  // Set again on mount: React's dev double mount runs the cleanup once before the real mount.
  useEffect(() => {
    alive.current = true;
    return () => void (alive.current = false);
  }, []);

  // The server's latest view of the game for us, and what the board shows:
  // the same view, or for a moment our own move played on it ahead of the answer.
  const [server, setServer] = useState<GameView>(start.view);
  const serverRef = useRef(start.view);
  const [match, setMatchState] = useState<MatchState>(start.view.state);
  const matchRef = useRef(match);
  const setMatch = (next: MatchState) => {
    matchRef.current = next;
    setMatchState(next);
  };
  const lastSeen = useRef(JSON.stringify(start.view));
  const receive = (v: GameView) => {
    if (!alive.current) return;
    lastSeen.current = JSON.stringify(v);
    serverRef.current = v;
    setServer(v);
    setMatch(v.state);
  };
  const [error, setError] = useState<string | null>(null);
  const [watchers, setWatchers] = useState(0);
  const [link, setLink] = useState<LiveStatus>('online');

  // Actions go to the server one after another; `chain` ends when all are answered.
  const chain = useRef<Promise<void>>(Promise.resolve());
  // How long our last move takes to play out on the board: the bot's answer waits for it.
  const landing = useRef(0);
  const inflight = useRef(0);
  const [sending, setSending] = useState(0);
  const send = (action: Action | null) => {
    if (spectator || (!remote && !onAction)) return;
    inflight.current++;
    setSending((n) => n + 1);
    chain.current = chain.current.then(async () => {
      const started = Date.now();
      try {
        for (let attempt = 0; alive.current; attempt++) {
          try {
            // The version of the view the action was made on (read now: an earlier answer may have changed it).
            const v = serverRef.current.v;
            if (remote) {
              receive(await remote.send(action!, v));
              setError(null);
            } else {
              const r = await onAction!(action, v);
              // Let the player's own move land before the bot's answer: a chain of
              // jumps or a portal would be cut short and look like a teleport.
              if (action) await sleep(Math.max(0, Math.max(450, landing.current) - (Date.now() - started)));
              receive(r.view);
              setError(r.stale && action ? t('Позиція оновилась — зробіть хід ще раз.') : null);
            }
            return;
          } catch (e) {
            if (!alive.current) return;
            // fetch() and a dropped socket fail with a TypeError: keep the move and send it again
            // (a repeat is safe: the version makes the server refuse a move it already has).
            if (e instanceof TypeError && attempt < 10) {
              setError(t('Немає зв’язку з сервером — надішлемо хід, щойно зв’язок повернеться…'));
              await sleep(Math.min(10_000, 1000 * 2 ** attempt));
              continue;
            }
            setError(e instanceof TypeError ? t('Немає зв’язку з сервером.') : e instanceof Error ? e.message : String(e));
            await resync();
            return;
          }
        }
      } finally {
        inflight.current--;
        if (alive.current) setSending((n) => n - 1);
      }
    });
  };
  /** Fetch the game as the server has it, waiting longer after each failure. */
  const resync = async () => {
    for (let i = 0; i < 8 && alive.current; i++) {
      try {
        receive(remote ? await remote.fetch() : (await onAction!(null, '')).view);
        return;
      } catch {
        await sleep(Math.min(15_000, 1000 * 2 ** i));
      }
    }
  };

  // Games with people: views pushed by the server (or polled in the demo).
  useEffect(() => {
    if (!remote) return;
    const stop = remote.subscribe(({ view, watchers: w }) => {
      setWatchers(w);
      // Our own request will bring this view too; nothing else may happen while it is on its way.
      if (inflight.current > 0 || JSON.stringify(view) === lastSeen.current) return;
      receive(view);
    });
    const offStatus = remote.onStatus?.((st) => setLink(st));
    return () => {
      stop();
      offStatus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remote]);

  const [verdict, setVerdict] = useState<MatchFinish | null>(null);
  const [verdictError, setVerdictError] = useState<string | null>(null);
  const reported = useRef(false);
  const report = (resigned: boolean) => {
    if (reported.current || !onFinish) return;
    reported.current = true;
    // The last move must reach the server before the result is asked for.
    chain.current
      .then(() => onFinish(resigned))
      .then((v) => alive.current && setVerdict(v))
      .catch((e) => alive.current && setVerdictError(e instanceof Error ? e.message : String(e)));
  };
  const [selected, setSelected] = useState<Square | null>(null);
  // A move is chosen on the board stop by stop: the piece stands on the
  // current stop, and the squares where it may go on are marked.
  const [stage, setStage] = useState<Stage | null>(null);
  const stageRef = useRef<Stage | null>(null);
  stageRef.current = stage;
  // Variants that end on the same square (promotion, …) pick from a small
  // popover over that square.
  const [popover, setPopover] = useState<{ square: Square; moves: Move[] } | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [linePreview, setPreview] = useState<Square[]>([]);
  // Abilities played as a move (Міраж, Ривок Комети): pressing the button switches to those moves.
  const [special, setSpecial] = useState<'mirage' | 'dash' | null>(null);
  // A fresh game opens with the opponent's deck; the bot waits for it.
  const [intro, setIntro] = useState(() => getSettings().animations && !spectator && start.view.state.history.length === 0);
  // Intro progress: how many of the opponent's cards have landed on the board.
  const [landed, setLanded] = useState(0);
  const [hintBusy, setHintBusy] = useState(false);
  // Підказка's answer, worked out here on our own view; it holds for this ply only.
  const [hintMove, setHintMove] = useState<{ ply: number; move: Move } | null>(null);
  const [showSummary, setShowSummary] = useState(true);
  // The result waits until the last move has played out on the board (a mate: until the king is down).
  // A game opened already finished shows it at once.
  const [summaryReady, setSummaryReady] = useState(() => !!start.view.state.result);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const later = (fn: () => void, ms: number) => {
    const id = setTimeout(() => {
      timers.current.delete(id);
      fn();
    }, ms);
    timers.current.add(id);
  };
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const [confirmResign, setConfirmResign] = useState(false);
  const [shared, setShared] = useState(false);
  // A player's profile opened from the player bar.
  const [viewing, setViewing] = useState<string | null>(null);
  // Reactions: the bubble over each side's bar, the picker, and muting the opponent's.
  const [bubbles, setBubbles] = useState<Partial<Record<Color, { e: string; n: number }>>>({});
  const [picker, setPicker] = useState(false);
  const [muted, setMuted] = useState(() => {
    try {
      return localStorage.getItem('uc.emotes.muted') === '1';
    } catch {
      return false;
    }
  });
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  useEffect(() => {
    if (!remote?.onEmote) return;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const off = remote.onEmote((color, e) => {
      if (color !== human && mutedRef.current) return;
      const n = Date.now();
      setBubbles((b) => ({ ...b, [color]: { e, n } }));
      if (color !== human) play('click');
      const timer = setTimeout(() => setBubbles((b) => (b[color]?.n === n ? { ...b, [color]: undefined } : b)), 2600);
      timers.add(timer);
    });
    return () => {
      off();
      timers.forEach(clearTimeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remote]);
  // The server takes one reaction per 2 s: the buttons rest meanwhile, so a press is never lost silently.
  const [emoteRest, setEmoteRest] = useState(false);
  const sendEmote = (e: string) => {
    if (emoteRest) return;
    remote?.emote?.(e);
    setPicker(false);
    setEmoteRest(true);
    setTimeout(() => setEmoteRest(false), EMOTE_GAP_MS);
  };
  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    try {
      localStorage.setItem('uc.emotes.muted', next ? '1' : '0');
    } catch {
      // Remembered for this game only.
    }
  };
  // Player ladder: a stalled opponent can be timed out.
  const [quietSince, setQuietSince] = useState(() => Date.now());
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => setQuietSince(Date.now()), [match.history.length]);
  useEffect(() => {
    if (!remote?.claim) return;
    const t = setInterval(() => setClock(Date.now()), 5000);
    return () => clearInterval(t);
  }, [remote]);
  const historyRef = useRef<HTMLOListElement>(null);

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
  const myTurn = !spectator && match.turn === human && !match.result;
  // Bot games: the bot's move comes from the server.
  const thinking = !remote && !intro && !match.result && match.turn === bot;
  const busy = thinking || hintBusy || sending > 0;
  // Our legal moves are worked out by the server; none while our own move is on its way.
  const legal = myTurn && match === server.state ? server.legal : [];
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
      if (spectator) return;
      landing.current = 0;
      let shown = 0;
      if (action.type === 'move') {
        const m = action.move;
        const legs = moveLegs(m, matchRef.current.board[m.from]?.type);
        // Legs up to the stop the piece already stands on have been shown.
        const st = stageRef.current;
        shown = st && stayMoves(st).length ? legs.findIndex((l) => l.stop && l.to === stageAt(st)) + 1 : 0;
      }
      // Shown at once; the server's answer replaces it (it may differ: an illusion taken, …).
      try {
        const next = performAction(matchRef.current, action);
        landing.current = next.fx ? fxMs(next.fx, shown) : 0;
        setMatch(next);
      } catch {
        // Our view cannot play it (an opponent's illusion is in the way): the server decides.
      }
      setError(null);
      send(action);
      setSelected(null);
      setStage(null);
      setPopover(null);
      setMenu(null);
      setPreview([]);
      if (action.type === 'move') setSpecial(null);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Bot games: when the bot is to move and nothing is on its way to the server
  // (the bot opens as white, or a resumed game), ask the server for its move.
  useEffect(() => {
    if (!thinking || inflight.current > 0) return;
    send(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thinking, sending]);

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
      const final = match.result && (spectator || match.result.winner === human) ? 'win' : 'loss';
      if (match.result && match.status === 'checkmate' && getSettings().animations) {
        // The mate plays out first: the blow as the king falls, the fanfare with the result.
        const { fall, end } = mateTimes(playerView(match, human).fx);
        play('whoosh');
        later(() => play('mate'), fall + 300);
        later(() => play(final), end);
      } else if (match.result) play(final);
      else if (match.status === 'check') play('check');
      else play(pieces < prev.pieces ? 'capture' : 'move');
    }
    soundRef.current = { plies: match.history.length, pieces };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match]);

  useEffect(() => {
    if (match.result && !spectator) report(false);
    if (!match.result) return setSummaryReady(false);
    if (summaryReady) return;
    const mate = match.status === 'checkmate' && getSettings().animations;
    later(() => setSummaryReady(true), mate ? mateTimes(playerView(match, human).fx).end + 300 : 500);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match.result]);

  const showHint = async (pieceId: string) => {
    act({ type: 'ability', pieceId, key: 'show' });
    setHintBusy(true);
    try {
      // Worked out on our own view (the opponent's illusions are real pieces for it), after the press is recorded.
      await chain.current;
      const at = serverRef.current.state;
      const move = await requestHint(at, human, HINT_BOT);
      if (alive.current && move && matchRef.current.ply === at.ply) setHintMove({ ply: at.ply, move });
    } finally {
      if (alive.current) setHintBusy(false);
    }
  };

  const share = async () => {
    if (!remote?.shareUrl) return;
    try {
      if (navigator.share) await navigator.share({ title: 'Ultrachess', text: t('Подивись партію в Ultrachess'), url: remote.shareUrl });
      else await navigator.clipboard.writeText(remote.shareUrl);
      setShared(true);
      setTimeout(() => alive.current && setShared(false), 2500);
    } catch {
      // Cancelled by the user, or no clipboard access: nothing to do.
    }
  };

  const lastMove = new Set<Square>();
  if (view.lastMove) {
    lastMove.add(view.lastMove.from);
    lastMove.add(view.lastMove.target);
    if (view.lastMove.to !== null) lastMove.add(view.lastMove.to);
    for (const sq of view.lastMove.spread ?? []) lastMove.add(sq);
  }
  const shownHint = myTurn && hintMove && hintMove.ply === match.ply ? hintMove.move : null;
  const hint = new Set<Square>(shownHint ? [shownHint.from, shownHint.target] : []);
  const checkSquare = match.status === 'check' || match.status === 'checkmate' ? findKing(match, match.turn) : null;

  const myAbilityPieces = spectator
    ? []
    : view.cells
        .map((c, s) => ({ c, s }))
        .filter(({ c }) => c && c.color === human && !c.illusion && (ABILITY_DEFS[c.cardId] || c.cardId.endsWith('levitation')));

  // Who sits where: the opponent on top, you at the bottom (a spectator: black on top, white below).
  const top: PlayerCard | null = remote ? (human === 'w' ? remote.black : remote.white) : null;
  const bottomCard: PlayerCard | null = remote ? (human === 'w' ? remote.white : remote.black) : null;
  // The weekly league's bot keeps its strength a secret.
  const botName = start.weekly ? t('Бот тижня') : t('Бот · {0}', botLevel(start.botLevel).name);
  const sideName = (c: Color) => (remote ? (c === 'w' ? remote.white : remote.black).name : c === human ? playerName : botName);

  const selectedPiece = selected !== null ? view.cells[selected] : null;
  const [cardOpen, setCardOpen] = useState<string | null>(null);
  const menuOptions = useMemo(() => (menu ? abilityOptions(match, menu) : []), [menu, match]);

  /** One ability button's state and action (the dock tile and the round quick button share it). */
  const ability = (c: NonNullable<(typeof view.cells)[number]>) => {
    const card = getCard(c.cardId);
    const def = ABILITY_DEFS[c.cardId];
    const cd = match.cooldowns[c.id] ?? 0;
    const ready = cd === 0;
    const canPress = myTurn && !busy && !view.pending && !stage && ready && !!def && !def.viaMove && abilityReady(match, c.id);
    const viaMoveKind = def?.id === 'mirage' || def?.id === 'dash' ? def.id : null;
    const on = (!!viaMoveKind && special === viaMoveKind) || menu === c.id || (def?.id === 'immortal' && view.immortalArmed);
    const press = () => {
      if (!def) return;
      if (viaMoveKind) {
        const turnOn = special !== viaMoveKind;
        setSpecial(turnOn ? viaMoveKind : null);
        setSelected(turnOn ? (specialMoves(viaMoveKind)[0]?.from ?? null) : null);
      } else if (def.id === 'immortal') act({ type: 'ability', pieceId: c.id, key: 'arm' });
      else if (def.id === 'hint') void showHint(c.id);
      else {
        // The line picker comes up right under the buttons, not below the tapped piece's card.
        setSelected(null);
        setMenu(menu === c.id ? null : c.id);
      }
    };
    const disabled = viaMoveKind ? !myTurn || busy || (special !== viaMoveKind && specialMoves(viaMoveKind).length === 0) : !canPress;
    const sprite = pieceSprite(c.cardId, c.type, human);
    // Levitation has no button (it is a move); Міраж is pressed, then played as a jump.
    const passive = !def || (def.viaMove && !viaMoveKind);
    return { card, def, cd, ready, viaMoveKind, on, press, disabled, sprite, passive };
  };

  // Землетрус: the lines to shake are picked by arrows at the board's edge, not from a list.
  const quakeMenu = menu !== null && ABILITY_DEFS[match.board.find((p) => p?.id === menu)?.cardId ?? '']?.id === 'earthquake';
  const quakeArrows = quakeMenu
    ? menuOptions.map((o) => {
        const dir = Number(o.key.split(':')[2]);
        const ring = boardRing(view, marks);
        const end = dir > 0 ? o.squares[o.squares.length - 1] : o.squares[0];
        const before = dir > 0 ? o.squares[o.squares.length - 2] : o.squares[1];
        const a = squareCenter(end, human, ring);
        const b = squareCenter(before, human, ring);
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        return { o, x: a.x + dx * 0.62, y: a.y + dy * 0.62, angle: (Math.atan2(dy, dx) * 180) / Math.PI };
      })
    : [];

  // On a phone the bar under the board only holds your takes and reactions: with neither it goes.
  const ownBarEmpty = lostPieces(match, bot).length === 0 && !(remote?.emote && !spectator) && !bubbles[human];

  let statusText: string;
  if (match.result && spectator) {
    statusText =
      match.result.winner === null ? t('Нічия — {0}', tr(match.result.reason)) : t('Перемога: {0} — {1}', sideName(match.result.winner), tr(match.result.reason));
  } else if (match.result) {
    statusText =
      match.result.winner === null ? t('Нічия — {0}', tr(match.result.reason)) : match.result.winner === human ? t('Перемога! {0}', tr(match.result.reason)) : t('Поразка. {0}', tr(match.result.reason));
  } else if (spectator) {
    statusText = t('{0}Хід: {1} ({2})', match.status === 'check' ? t('Шах! ') : '', sideName(match.turn), match.turn === 'w' ? t('білі') : t('чорні'));
  } else if (stage) {
    statusText = stayMoves(stage).length
      ? t('Фігура тут. Натисніть її, щоб зупинитись, або підсвічену клітинку, щоб іти далі')
      : t('Оберіть підсвічену клітинку, куди йти далі');
  } else if (myTurn && view.pending) {
    statusText = t('Вершника вдарили: оберіть клітинку для відстрибу');
  } else if (myTurn) {
    statusText = match.status === 'check' ? t('Ваш хід — вам шах!') : t('Ваш хід');
  } else {
    statusText = remote
      ? match.status === 'check'
        ? t('Шах! Хід: {0}…', sideName(bot))
        : t('Хід суперника: {0}…', sideName(bot))
      : match.status === 'check'
        ? t('Шах боту. Бот думає…')
        : t('Бот думає…');
  }

  return (
    <section className="page game">
      <div className="game-board-col">
        <div className={`player-bar ${match.turn === bot && !match.result ? 'to-move' : ''}`}>
          <span className={`pb-who ${top ? 'clickable' : ''}`} onClick={top ? () => setViewing(top.id) : undefined} role={top ? 'button' : undefined} title={top ? t('Профіль гравця') : undefined}>
            {top ? <Avatar card={top.avatar} /> : <span className="avatar avatar-bot">🤖</span>}
            <span>
              <b>{top ? top.name : botName}</b>
              {top?.title && <TitlePlate id={top.title} small />}
              <small className="muted">{top ? `🏆 ${top.trophies} · ` : ''}{tr(start.botDeck.name)}</small>
            </span>
          </span>
          <Captured types={lostPieces(match, human)} color={human} />
          {bubbles[bot] && (
            <span key={bubbles[bot]!.n} className="emote-bubble">
              {bubbles[bot]!.e}
            </span>
          )}
          {(thinking || (remote && match.turn === bot && !match.result)) && (
            <span className="thinking" aria-live="polite">
              {remote ? t('ходить…') : t('думає…')}
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
            celebrate={!!match.result && match.result.winner === human && summaryReady}
            mated={match.status === 'checkmate' ? checkSquare : null}
            captureFx={captureFx}
            introHidden={intro ? new Set(introPlan.slice(landed).flatMap((x) => x.squares)) : undefined}
            introLanding={intro && landed > 0 ? new Set(introPlan[landed - 1].squares) : undefined}
            skins={start.skins}
          />
          {quakeArrows.map(({ o, x, y, angle }) => (
            <button
              key={o.key}
              className="quake-arrow"
              style={{ left: `${x}%`, top: `${y}%` }}
              onClick={() => act({ type: 'ability', pieceId: menu!, key: o.key })}
              onMouseEnter={() => setPreview(o.squares)}
              onMouseLeave={() => setPreview([])}
              onFocus={() => setPreview(o.squares)}
              aria-label={tr(o.label)}
              title={tr(o.label)}
            >
              <span style={{ transform: `rotate(${angle}deg)` }}>➤</span>
            </button>
          ))}
          {popover && (
            <div
              className={`board-popover ${squareCenter(popover.square, human, boardRing(view, marks)).y < 50 ? 'grow-down' : 'grow-up'}`}
              style={{ left: `${squareCenter(popover.square, human, boardRing(view, marks)).x}%`, top: `${squareCenter(popover.square, human, boardRing(view, marks)).y}%` }}
              role="dialog"
              aria-label={t('Оберіть варіант ходу')}
            >
              {popover.moves.map((m, i) => (
                <button key={i} className="btn btn-sm" onClick={() => act({ type: 'move', move: m })}>
                  {m.promotion && <Glyph type={m.promotion} color={human} />} {m.promotion ? PROMO_NAMES[m.promotion] : tr(m.label)}
                </button>
              ))}
              <button className="btn btn-sm btn-ghost" onClick={() => setPopover(null)}>
                {t('Скасувати')}
              </button>
            </div>
          )}
        </div>
        <div
          className={`player-bar player-bar-own ${spectator ? 'spectating' : ''} ${match.turn === human && !match.result ? 'to-move' : ''} ${
            ownBarEmpty ? 'is-empty' : ''
          }`}
        >
          <span
            className={`pb-who ${bottomCard ? 'clickable' : ''}`}
            onClick={bottomCard ? () => setViewing(bottomCard.id) : undefined}
            role={bottomCard ? 'button' : undefined}
          >
            {playerAvatar ? <Avatar card={playerAvatar} /> : <span className="avatar">{playerName.slice(0, 1).toUpperCase()}</span>}
            <span>
              <b>{playerName}</b>
              {playerTitle && <TitlePlate id={playerTitle} small />}
              <small className="muted">
                🏆 {trophies} · {tr(start.playerDeck.name)}
              </small>
            </span>
          </span>
          <Captured types={lostPieces(match, bot)} color={bot} />
          <span className="muted small pb-move">{t('Хід')}{' '}{fullMoves(match.ply) + (match.turn === 'w' ? 1 : 0)}</span>
          {bubbles[human] && (
            <span key={bubbles[human]!.n} className="emote-bubble mine">
              {bubbles[human]!.e}
            </span>
          )}
          {remote?.emote && !spectator && (
            <span className="emote-wrap">
              <button type="button" className="emote-btn" onClick={() => setPicker(!picker)} aria-label={t('Реакції')} title={t('Реакції')}>
                🙂
              </button>
              {picker && (
                <span className="emote-picker" role="menu">
                  {EMOTES.map((e) => (
                    <button key={e} type="button" onClick={() => sendEmote(e)} role="menuitem">
                      {e}
                    </button>
                  ))}
                  <button type="button" className="emote-mute" onClick={toggleMute} title={muted ? t('Показувати реакції суперника') : t('Сховати реакції суперника')}>
                    {muted ? '🔈' : '🔇'}
                  </button>
                </span>
              )}
            </span>
          )}
          {myAbilityPieces.some(({ c }) => !ability(c!).passive) && (
            <span className="quick-abilities">
              {myAbilityPieces.map(({ c }) => {
                const a = ability(c!);
                if (a.passive) return null;
                return (
                  <button
                    key={c!.id}
                    type="button"
                    className={`quick-ability r-${a.card.rarity} ${a.ready ? 'ready' : ''} ${a.on ? 'on' : ''}`}
                    disabled={a.disabled}
                    onClick={a.press}
                    title={tr(a.def?.name)}
                    aria-label={tr(a.def?.name)}
                  >
                    <img className={`pixel ${a.sprite.tint ? 'tinted' : ''}`} src={a.sprite.src} alt="" />
                    {!a.ready && <span className="quick-cd">{a.cd}</span>}
                  </button>
                );
              })}
            </span>
          )}
        </div>
      </div>

      <aside className="game-side">
        <div className={`panel status status-${match.result ? 'over' : myTurn ? 'mine' : 'bot'}`} aria-live="polite">
          <span className="eyebrow mode-tag">{remote
              ? `${spectator ? t('Глядач · ') : ''}${remote.ranked ? t('Ліга гравців') : t('Гра з другом')}`
              : start.trial
                ? t('{0} · раунд {1}/{2}', start.trial.name, start.trial.round, start.trial.rounds)
                : start.weekly
                  ? t('Тиждень слави · матч {0}/{1}', start.weekly.game, WEEKLY_GAMES)
                  : start.ranked
                  ? t('Ліга ботів')
                  : t('Тренування')}<span className="status-move"> · {t('хід {0}', fullMoves(match.ply) + (match.turn === 'w' ? 1 : 0))}</span></span>
          <br />
          <strong>{statusText}</strong>
          {remote && watchers > 0 && (
            <span className="watchers" title={t('Скільки людей дивиться партію')}>
              👁 {watchers}
            </span>
          )}
          {remote && link !== 'online' && (
            <p className="link-lost" role="status">
              {t('Зв’язок обірвався — перепідключаємось, партія чекає на сервері…')}
            </p>
          )}
          {error && <p className="error-text">{error}</p>}
          {special === 'mirage' && <p className="tip">{t('Міраж увімкнено: оберіть стрибок коня без взяття.')}</p>}
          {special === 'dash' && <p className="tip">{t('Ривок Комети: оберіть клітинку за 2–5 кроків по прямій.')}</p>}
          {fromSelected.some((m) => m.kind === 'levitate') && (
            <p className="tip">{t('Сині плитки за краєм дошки — платформи левітації. Фігура мусить повернутися за 3 ходи суперника.')}</p>
          )}
        </div>

        {remote?.emote && !spectator && (
          <div className="panel emote-panel">
            <div className="emote-panel-head">
              <h2>{t('Реакції')}</h2>
              <button type="button" className="emote-panel-mute" onClick={toggleMute} title={muted ? t('Показувати реакції суперника') : t('Сховати реакції суперника')}>
                {muted ? '🔈' : '🔇'}
              </button>
            </div>
            <div className="emote-row">
              {EMOTES.map((e) => (
                <button key={e} type="button" onClick={() => sendEmote(e)} disabled={emoteRest} aria-label={e}>
                  {e}
                </button>
              ))}
            </div>
          </div>
        )}

        {myAbilityPieces.length > 0 && (
          <div className="ability-dock" aria-label={t('Здібності')}>
            {myAbilityPieces.map(({ c }) => {
              const { card, def, cd, ready, viaMoveKind, on, press, disabled, sprite, passive } = ability(c!);
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
                    {card.rarity === 'mythological' && <span className="ability-eyebrow">{t('Міфічна здібність')}</span>}
                    <b>{def ? tr(def.name) : t('Левітація')}</b>
                    <small>
                      {c!.platformTurnsLeft !== null
                        ? t('на платформі: ще {0} ход. суперника', c!.platformTurnsLeft)
                        : !ready
                        ? t('перезарядка: {0} ход.', cd)
                        : passive
                          ? t('готово, ходіть фігурою')
                          : def.id === 'immortal'
                            ? view.immortalArmed
                              ? t('захист увімкнено')
                              : t('увімкнути захист')
                            : def.id === 'hint'
                              ? hintBusy
                                ? t('рахую…')
                                : t('показати найкращий хід')
                              : viaMoveKind
                                ? special === viaMoveKind
                                  ? t('скасувати')
                                  : myTurn && specialMoves(viaMoveKind).length === 0
                                    ? t('зараз немає куди')
                                    : viaMoveKind === 'mirage'
                                    ? t('стрибок з ілюзіями')
                                    : t('ривок до 5 клітинок')
                                : t('обрати лінію')}
                    </small>
                  </span>
                </button>
              );
            })}
          </div>
        )}
        {menu && quakeMenu && (
          <div className="ability-options quake-hint">
            <span>{t('Оберіть лінію: натисніть стрілку біля краю дошки, куди її зсунути.')}</span>
            <button className="btn btn-sm btn-ghost" onClick={() => setMenu(null)}>
              {t('Скасувати')}
            </button>
          </div>
        )}
        {menu && !quakeMenu && (
          <div className="ability-options" onMouseLeave={() => setPreview([])}>
            {menuOptions.map((o) => (
              <button
                key={o.key}
                className="btn btn-sm"
                onMouseEnter={() => setPreview(o.squares)}
                onFocus={() => setPreview(o.squares)}
                onClick={() => act({ type: 'ability', pieceId: menu, key: o.key })}
              >
                {tr(o.label)}
              </button>
            ))}
            <button className="btn btn-sm btn-ghost" onClick={() => setMenu(null)}>
              {t('Скасувати')}
            </button>
          </div>
        )}
        {shownHint && (
          <p className="tip hint-tip">
            {t('Підказка:')} {PIECE_NAMES[view.cells[shownHint.from]?.type ?? 'pawn']} {squareName(shownHint.from)} → {squareName(shownHint.target)} ({tr(shownHint.label)})
          </p>
        )}

        <div className={`panel piece-panel ${selectedPiece ? '' : 'is-empty'}`}>
          <h2>{t('Фігура')}</h2>
          {selectedPiece ? (
            <div>
              <div className="piece-card">
                <CardView card={getCard(selectedPiece.cardId)} compact color={selectedPiece.color} />
              </div>
              <PieceBrief cell={selectedPiece} onMore={() => setCardOpen(selectedPiece.cardId)} />
              <ul className="piece-status small">
                <li>
                  {spectator ? (selectedPiece.color === 'w' ? t('Білі') : t('Чорні')) : selectedPiece.color === human ? t('Ваша') : t('Суперника')}, {squareName(selected!)}
                </li>
                {selectedPiece.illusion && <li>{t('Це ваша ілюзія: суперник бачить звичайну фігуру.')}</li>}
                {selectedPiece.frozen && <li>{t('❄ пропускає хід')}</li>}
                {selectedPiece.onceUsed && <li>{t('Здібність «раз за гру» вже використано')}</li>}
                {selectedPiece.cooldown !== null && selectedPiece.cooldown > 0 && <li>{t('Перезарядка: ще {0} ваших ход.', selectedPiece.cooldown)}</li>}
                {selectedPiece.passenger && <li>{t('Везе пішака-пасажира')}</li>}
                {selectedPiece.platformTurnsLeft !== null && <li>{t('На платформі: зникне через {0} ход. суперника', selectedPiece.platformTurnsLeft)}</li>}
              </ul>
            </div>
          ) : (
            <p className="muted small">{t('Натисніть фігуру, щоб побачити, як вона ходить.')}</p>
          )}
        </div>

        <div className="panel history">
          <h2>{t('Хід партії')}</h2>
          <ol ref={historyRef}>
            {view.history.map((h, i) => (
              <li key={i}>
                <span className="mono muted">{Math.floor(h.ply / 2) + 1}.</span> <Glyph type="pawn" color={h.color} /> {tr(h.text)}
              </li>
            ))}
          </ol>
        </div>

        <div className="game-actions">
          {remote?.shareUrl && (
            <button className="btn btn-ghost" onClick={() => void share()} title={t('Посилання на цю партію: суперник повернеться в гру, друзі зможуть дивитися')}>
              {shared ? t('✓ Посилання скопійовано') : t('🔗 Поділитися')}
            </button>
          )}
          {remote?.claim && !spectator && !match.result && !myTurn && clock - quietSince > CLAIM_MS && (
            <button
              className="btn btn-primary"
              onClick={() =>
                remote.claim!()
                  .then(receive)
                  .catch((e) => setError(e instanceof Error ? e.message : String(e)))
              }
            >
              {t('Суперник мовчить — забрати перемогу')}
            </button>
          )}
          {!match.result && !spectator && (
            <button
              className="btn btn-danger"
              onClick={() => {
                if (!confirmResign) return setConfirmResign(true);
                setStage(null);
                setPopover(null);
                setMatch(resign(matchRef.current, human));
                if (remote) void remote.resign().then(receive, () => resync());
                else report(true);
              }}
              onBlur={() => setConfirmResign(false)}
            >
              {confirmResign ? t('Точно здатися?') : t('Здатися')}
            </button>
          )}
          {(match.result || spectator) && (
            <button className="btn" onClick={onExit}>
              {spectator && !match.result ? t('Вийти') : t('До меню')}
            </button>
          )}
        </div>
      </aside>

      {viewing && <PlayerModal userId={viewing} onClose={() => setViewing(null)} />}
      {cardOpen && <CardModal card={getCard(cardOpen)} onClose={() => setCardOpen(null)} />}
      {intro && (
        <DeckIntro
          steps={introPlan}
          color={bot}
          opponent={sideName(bot)}
          onLand={setLanded}
          onDone={() => setIntro(false)}
        />
      )}

      {match.result && showSummary && summaryReady && (
        <div className="modal-backdrop summary-backdrop">
          <div className="modal summary" role="dialog" aria-label={t('Підсумок партії')}>
            <h2 className={`outcome outcome-${match.result.winner === null ? 'draw' : spectator || match.result.winner === human ? 'win' : 'loss'}`}>
              {match.result.winner === null
                ? t('Нічия')
                : spectator
                  ? t('Перемога: {0}', sideName(match.result.winner))
                  : match.result.winner === human
                    ? t('Перемога!')
                    : t('Поразка')}
            </h2>
            <p>
              {t('{0} · ходів: {1}', tr(match.result.reason), match.result.moves)}
            </p>
            {remote && !remote.ranked && !spectator && <p className="muted">{t('Дружня гра без кубків.')}</p>}
            {onFinish && !verdict && !verdictError && <p className="muted">{remote ? t('Рахуємо кубки…') : t('Перевіряємо партію…')}</p>}
            {verdictError && <p className="error-text">{verdictError}</p>}
            {verdict?.ladder && (
              <div className="verdict">
                <span className="eyebrow">{LADDER_NAMES[verdict.ladder]}</span>
                <span className={`trophy-delta ${verdict.trophiesDelta >= 0 ? 'up' : 'down'}`}>
                  🏆 {verdict.trophiesDelta >= 0 ? '+' : ''}
                  {verdict.trophiesDelta}
                </span>
                {!!verdict.streakBonus && (
                  <span className="streak-bonus">🔥 {t('+{0} за серію: {1} перемог поспіль', verdict.streakBonus, verdict.streak ?? 0)}</span>
                )}
                <span className="muted">
                  {t('Тепер: {0} · {1}', verdict.profile.ladders[verdict.ladder].trophies, tr(verdict.profile.ladders[verdict.ladder].leagueName))}
                </span>
                {verdict.goldDelta > 0 && <span className="loot-item gold">🪙 +{verdict.goldDelta} {t('золота')}</span>}
                {verdict.reward && (
                  <div className="reward">
                    <img className="pack-img" src={packArt(verdict.reward.type)} alt="" />
                    <div>
                      <b>{tr(verdict.reward.name)}</b>
                      <small className="muted">
                        {t('уже чекає на головній · паків сьогодні')}{' '}{verdict.profile.ladders[verdict.ladder].packsToday}/
                        {verdict.profile.ladders[verdict.ladder].packsLimit}
                      </small>
                    </div>
                  </div>
                )}
                {verdict.rewardSkipped && (
                  <p className="muted small">
                    {t('Ліміт {0} паків на сьогодні в цій лізі вичерпано — завтра паки знову падатимуть.', verdict.profile.ladders[verdict.ladder].packsLimit)}
                  </p>
                )}
                {verdict.leagueUps.map((l) => (
                  <div key={l.name} className="league-up">
                    <span className="league-up-title">{t('🎉 Нова ліга: {0}!', tr(l.name))}</span>
                    <span>
                      {l.gold > 0 && <>🪙 +{l.gold} </>}
                      {l.pack && <>· {tr(l.pack.name)}</>}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {verdict?.trial && (
              <div className="verdict">
                <span className="eyebrow">{tr(verdict.trial.name)}</span>
                {verdict.trial.status === 'won' ? (
                  <>
                    <span className="trophy-delta up">{t('🏅 Випробування пройдено!')}</span>
                    {verdict.trial.card && (
                      <div className="trial-won-card">
                        <CardView card={getCard(verdict.trial.card)} />
                        <small className="muted">{t('Нова картка вже у вашій колекції — поставте її в колоду.')}</small>
                      </div>
                    )}
                    {verdict.trial.reward && (
                      <div className="reward">
                        <img className="pack-img" src={packArt(verdict.trial.reward.type)} alt="" />
                        <div>
                          <b>{tr(verdict.trial.reward.name)}</b>
                          <small className="muted">{t('уже чекає на головній')}</small>
                        </div>
                      </div>
                    )}
                  </>
                ) : verdict.trial.status === 'lost' ? (
                  <span className="trophy-delta down">{t('Спробу завершено: {0} з {1} перемог', verdict.trial.wins, verdict.trial.rounds)}</span>
                ) : (
                  <span className="trophy-delta up">
                    {t('Раунд пройдено: {0} / {1}', verdict.trial.wins, verdict.trial.rounds)}
                  </span>
                )}
              </div>
            )}
            {verdict && verdict.achievements.length > 0 && (
              <div className="verdict ach-won">
                <span className="eyebrow">{t('Нові досягнення')}</span>
                {verdict.achievements.map((id) => ACHIEVEMENT_BY_ID[id] && (
                  <span key={id} className="ach-won-row">
                    <Medal a={ACHIEVEMENT_BY_ID[id]} />
                    <b>{ACHIEVEMENT_BY_ID[id].name}</b>
                    <small className="muted">{ACHIEVEMENT_BY_ID[id].text}</small>
                  </span>
                ))}
                <a className="small" href="#/profile/achievements">{t('Усі досягнення →')}</a>
              </div>
            )}
            {verdict?.weekly && (
              <div className="verdict">
                <span className="eyebrow">{t('Тиждень слави · дивізіон {0}', divisionByN(verdict.weekly.division).roman)}</span>
                <span className="trophy-delta up">{t('Перемог: {0} · зіграно {1} з {2}', verdict.weekly.wins, verdict.weekly.played, WEEKLY_GAMES)}</span>
                {verdict.weekly.settled ? (
                  <a className="btn btn-primary btn-sm" href="#/weekly">
                    {verdict.weekly.tier >= 0 ? t('Забрати нагороди тижня') : t('Підсумки тижня')}
                  </a>
                ) : (
                  <span className="muted small">{weeklyNextText(verdict.weekly.wins)}</span>
                )}
              </div>
            )}
            {verdict && !verdict.ladder && !verdict.trial && !verdict.weekly && <p className="muted">{t('Тренування: кубки й паки не нараховуються.')}</p>}
            <div className="editor-actions">
              {onRematch && !spectator && (
                <button className="btn btn-primary" onClick={onRematch}>
                  {rematchLabel ?? (remote ? t('Шукати ще') : t('Ще бій'))}
                </button>
              )}
              {/* The record is finished on the server once the verdict is in (games with people: at once). */}
              {!spectator && (remote || verdict) && (
                <a className="btn btn-replay" href={`#/replay/${remote ? 'p' : 'm'}/${start.matchId}`}>
                  {t('Переглянути партію')}
                </a>
              )}
              <button className="btn" onClick={onExit}>
                {t('До меню')}
              </button>
              <button className="btn btn-ghost" onClick={() => setShowSummary(false)}>
                {t('Дошка')}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

const PROMO_NAMES: Partial<Record<PieceType, string>> = { queen: t('Ферзь'), rook: t('Тура'), bishop: t('Слон'), knight: t('Кінь') };

/**
 * How long an action takes to play out on the board, in ms: the mover's legs
 * (from leg `shown` on), pieces that move after it, and the scenes that follow
 * the blow (Безсмертна rising). The bot's answer waits for it.
 */
function fxMs(fx: MatchFx, shown: number): number {
  const [first, ...rest] = fx.moves;
  const mover = first ? legsMs(first.from, first.legs, Math.min(shown, first.legs.length - 1)) : 0;
  let end = mover + 120;
  for (const m of rest) end = Math.max(end, (m.after ? mover : 0) + legsMs(m.from, m.legs) + 80);
  for (const x of fx.sprites) {
    if (x.kind === 'capture') end = Math.max(end, mover + 300);
    if (x.wait !== undefined) end = Math.max(end, mover + x.wait + 400);
    // The fire cloud over an explosion.
    if (x.kind === 'explode') end = Math.max(end, mover + 1000);
  }
  // Землетрус: the wave runs along the whole line.
  if (fx.shake) end = Math.max(end, 1300);
  return end;
}

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
    <span className={`captured captured-${color}`} title={t('Взяті фігури')}>
      {/* One glyph per kind with a count, so the tray stays one short line. */}
      {[...new Set(types)].map((t) => {
        const n = types.filter((x) => x === t).length;
        return (
          <span key={t} className="captured-kind">
            <Glyph type={t} color={color} />
            {n > 1 && <small>×{n}</small>}
          </span>
        );
      })}
    </span>
  );
}

/** Phones: what the tapped piece does, in the card's own rules text, with the full card a tap away. */
function PieceBrief({ cell, onMore }: { cell: ViewPiece; onMore: () => void }) {
  const card = getCard(cell.cardId);
  const sprite = pieceSprite(cell.cardId, cell.type, cell.color, getSettings().blackStyle);
  return (
    <div className={`piece-brief r-${card.rarity}`}>
      <button type="button" className="pbr-head" onClick={onMore}>
        <span className="pbr-art">
          <img className={`pixel ${sprite.tint ? 'tinted' : ''}`} src={sprite.src} alt="" />
        </span>
        <span className="pbr-name">
          <small>{PIECE_NAMES[card.pieceType]}</small>
          <b>{card.name}</b>
        </span>
        <span className="pbr-more">{t('Детальніше')}</span>
      </button>
      <p className="pbr-rules">{card.rulesText}</p>
    </div>
  );
}

/** What the next weekly reward needs ("ще 2 перемоги до 6"). */
function weeklyNextText(wins: number): string {
  const next = WEEKLY_TIERS.find((x) => x > wins);
  return next ? t('До нагороди за {0} перемог: ще {1}', next, next - wins) : t('Найвища нагорода тижня вже ваша');
}

