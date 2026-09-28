import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ABILITY_DEFS, abilityOptions, abilityReady } from '../engine/abilities';
import type { BotOptions } from '../engine/bot/search';
import { PIECE_NAMES, getCard } from '../engine/cards';
import { opposite, squareName } from '../engine/coords';
import { legalMoves } from '../engine/legal';
import { type Action, type MatchState, createMatch, fullMoves, performAction, resign, withHint } from '../engine/match';
import { findKing } from '../engine/position';
import type { Color, Deck, Move, Square } from '../engine/types';
import { playerView } from '../engine/view';
import { Board, type Mark } from './Board';
import { requestBotTurn, requestHint } from './botClient';
import { CardView, Glyph } from './common';
import { CLASSIC_DECK } from './storage';

interface Props {
  decks: Deck[];
  activeId: string;
}

interface GameConfig {
  human: Color;
  level: number;
  myDeck: Deck;
  botDeck: Deck;
}

const LEVELS = [
  { level: 1, name: 'Легкий', desc: 'дивиться на 1 хід уперед' },
  { level: 2, name: 'Середній', desc: 'свій хід + відповідь суперника' },
  { level: 3, name: 'Складний', desc: 'на 3 півходи, думає довше' },
];

export function botOptions(level: number): BotOptions {
  return { depth: level, timeMs: level >= 3 ? 2500 : 1500 };
}

export function MatchPage({ decks, activeId }: Props) {
  const [myDeckId, setMyDeckId] = useState(activeId);
  const [botDeckId, setBotDeckId] = useState(CLASSIC_DECK.id);
  const [human, setHuman] = useState<Color>('w');
  const [level, setLevel] = useState(2);
  const [game, setGame] = useState<{ id: number; cfg: GameConfig } | null>(null);

  useEffect(() => setMyDeckId(activeId), [activeId]);

  const find = (id: string) => decks.find((d) => d.id === id) ?? CLASSIC_DECK;
  const start = (cfg?: GameConfig) =>
    setGame({
      id: Date.now(),
      cfg: cfg ?? { human, level, myDeck: find(myDeckId), botDeck: find(botDeckId) },
    });

  if (game) {
    return (
      <Game
        key={game.id}
        cfg={game.cfg}
        onNew={() => setGame(null)}
        onRematch={() => start({ ...game.cfg })}
      />
    );
  }

  return (
    <section className="page">
      <div className="page-head">
        <h1>Матч проти бота</h1>
        <p className="muted">Дошка 8×8, ваша колода проти колоди бота. Партія йде лише в цьому браузері.</p>
      </div>
      <div className="panel setup">
        <label className="field">
          <span>Ваша колода</span>
          <select value={myDeckId} onChange={(e) => setMyDeckId(e.target.value)}>
            {decks.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Колода бота</span>
          <select value={botDeckId} onChange={(e) => setBotDeckId(e.target.value)}>
            {decks.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <div className="field">
          <span>Ваш колір</span>
          <div className="chip-row">
            <button className={`chip ${human === 'w' ? 'on' : ''}`} onClick={() => setHuman('w')}>
              <Glyph type="king" color="w" /> Білі (ходять першими)
            </button>
            <button className={`chip ${human === 'b' ? 'on' : ''}`} onClick={() => setHuman('b')}>
              <Glyph type="king" color="b" /> Чорні
            </button>
          </div>
        </div>
        <div className="field">
          <span>Рівень бота</span>
          <div className="chip-row">
            {LEVELS.map((l) => (
              <button key={l.level} className={`chip ${level === l.level ? 'on' : ''}`} onClick={() => setLevel(l.level)} title={l.desc}>
                {l.name}
              </button>
            ))}
          </div>
          <span className="muted small">{LEVELS.find((l) => l.level === level)?.desc}</span>
        </div>
        <button className="btn btn-primary btn-lg" onClick={() => start()}>
          Почати партію
        </button>
      </div>
    </section>
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function Game({ cfg, onNew, onRematch }: { cfg: GameConfig; onNew: () => void; onRematch: () => void }) {
  const { human } = cfg;
  const bot = opposite(human);
  const botOpts = botOptions(cfg.level);
  const [match, setMatch] = useState<MatchState>(() =>
    human === 'w' ? createMatch(cfg.myDeck, cfg.botDeck) : createMatch(cfg.botDeck, cfg.myDeck),
  );
  const [selected, setSelected] = useState<Square | null>(null);
  const [choice, setChoice] = useState<Move[] | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [preview, setPreview] = useState<Square[]>([]);
  const [mirage, setMirage] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [hintBusy, setHintBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSummary, setShowSummary] = useState(true);
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
        setMatch((m) => performAction(m, action));
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
        for (const a of turn.actions) next = performAction(next, a);
      } catch (e) {
        console.error('Bot failed, playing a fallback move', e);
        next = match;
        const pc = next.pending.find((p) => p.color === bot);
        if (pc) next = performAction(next, { type: 'choose', square: pc.options[0] });
        const fallback = legalMoves(next)[0];
        if (fallback) next = performAction(next, { type: 'move', move: fallback });
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

  const showHint = async (pieceId: string) => {
    let armed: MatchState;
    try {
      armed = performAction(match, { type: 'ability', pieceId, key: 'show' });
    } catch (e) {
      setError(String(e));
      return;
    }
    setMatch(armed);
    setHintBusy(true);
    try {
      const move = await requestHint(armed, human, { ...botOpts, depth: Math.max(2, botOpts.depth) });
      if (alive.current) setMatch((m) => (m.ply === armed.ply ? withHint(m, human, move) : m));
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
        <div className="player-bar">
          <span>
            <Glyph type="king" color={bot} /> Бот · {cfg.botDeck.name}
          </span>
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
        <div className="player-bar">
          <span>
            <Glyph type="king" color={human} /> Ви · {cfg.myDeck.name}
          </span>
          <span className="muted small">Хід {fullMoves(match.ply) + (match.turn === 'w' ? 1 : 0)}</span>
        </div>
      </div>

      <aside className="game-side">
        <div className={`panel status status-${match.result ? 'over' : myTurn ? 'mine' : 'bot'}`} aria-live="polite">
          <strong>{statusText}</strong>
          {error && <p className="error-text">{error}</p>}
          {mirage && <p className="small">Міраж увімкнено: оберіть стрибок коня без взяття.</p>}
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
            <button className="btn btn-danger" onClick={() => confirm('Здатися?') && setMatch((m) => resign(m, human))}>
              Здатися
            </button>
          )}
          <button className="btn" onClick={onNew}>
            Нова партія
          </button>
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
            <h2>{match.result.winner === null ? 'Нічия' : match.result.winner === human ? 'Перемога!' : 'Поразка'}</h2>
            <p>{match.result.reason}</p>
            <p className="muted">
              Переможець: {match.result.winner === null ? '—' : match.result.winner === human ? 'ви' : 'бот'} · Ходів: {match.result.moves}
            </p>
            <div className="editor-actions">
              <button className="btn btn-primary" onClick={onRematch}>
                Реванш
              </button>
              <button className="btn" onClick={onNew}>
                Нова партія
              </button>
              <button className="btn btn-ghost" onClick={() => setShowSummary(false)}>
                Переглянути дошку
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
