// The clip on every card: a short scripted scene that shows the card's trick
// (the first-move jump, the attacker dying with Смертник, the illusion left
// behind…). The script only says who moves where; the engine plays every
// step, so the clip can never show a rule the game does not have.

import { abilityOptions, applyAbility } from '../engine/abilities';
import { applyChoice, applyMoveWithEvents, type GameEvent } from '../engine/apply';
import { CARD_BY_ID, CLASSIC_CARD } from '../engine/cards';
import { CELLS, fileOf, isBoardSquare, parseSquare, rankOf, squareName } from '../engine/coords';
import { legalMoves } from '../engine/legal';
import { clonePosition, emptyPosition, findPiece } from '../engine/position';
import type { Color, Move, PieceType, Position, Square } from '../engine/types';
import { CARD_SCRIPTS, type ClipScript, type ClipStep } from './cardScripts';
import { stopsOf } from './stage';
import { t } from '../i18n';

export type ClipMark = 'move' | 'capture' | 'far' | 'far-capture';

export interface ClipItem {
  /** Stable key: the piece id, so a piece glides when its square changes. */
  key: string;
  cardId: string;
  type: PieceType;
  color: Color;
  square: Square;
  hero: boolean;
  state: 'on' | 'born' | 'gone' | 'illusion';
  frozen: boolean;
  rider: boolean;
  /** Moved far since the last frame (portal, wrap-around): reappears instead of gliding. */
  warp?: boolean;
}

export interface ClipScene {
  items: ClipItem[];
  caption: string;
  /** Whose action the caption is about (colours the caption). */
  who: 'hero' | 'enemy' | 'note';
  ms: number;
  marks: [Square, ClipMark][];
  /** The path the next move takes (dots) and where it ends (ring). */
  aim: Square[];
  target: Square | null;
  /** Squares where something happened (flash). */
  flash: Square[];
  barrier: Square[];
  platforms: Square[];
  /** The piece moving in this frame. */
  moving: string | null;
}

export interface Clip {
  scenes: ClipScene[];
  /** Show the ring around the board (platforms, portals). */
  ring: boolean;
  /** What each step did (tests read it). */
  log: string[];
}

const AIM_MS = 1600;
const STEP_MS = 300;
const RESULT_MS = 1700;
const MARKS_MS = 2000;

function put(pos: Position, name: string, spec: string, heroCard: string): void {
  // spec: "hero" | "w:pawn" | "b:rook-kamikaze", optional "!" (has moved), "^d1" (home square)
  let rest = spec;
  let moved = false;
  let home: Square | null = null;
  const caret = rest.indexOf('^');
  if (caret >= 0) {
    home = parseSquare(rest.slice(caret + 1));
    rest = rest.slice(0, caret);
  }
  if (rest.endsWith('!')) {
    moved = true;
    rest = rest.slice(0, -1);
  }
  const s = parseSquare(name);
  let color: Color = 'w';
  let cardId = heroCard;
  let id = 'hero';
  if (rest !== 'hero') {
    const [c, what] = rest.split(':') as [Color, string];
    color = c;
    cardId = what.includes('-') ? what : CLASSIC_CARD[what as PieceType];
    id = `${color}-${name}`;
  }
  const card = CARD_BY_ID[cardId];
  if (!card) throw new Error(`Unknown card ${cardId}`);
  pos.board[s] = { id, color, type: card.pieceType, cardId, moveCount: moved ? 1 : 0, homeSquare: home ?? s };
}

function setup(cardId: string, script: ClipScript): Position {
  const pos = emptyPosition();
  for (const [s, spec] of Object.entries(script.pieces)) put(pos, s, spec, cardId);
  const hasKing = (c: Color) => pos.board.some((p) => p?.color === c && p.type === 'king');
  if (!hasKing('w')) put(pos, script.kings?.w ?? 'h1', 'w:king!', cardId);
  if (!hasKing('b')) put(pos, script.kings?.b ?? 'a8', 'b:king!', cardId);
  pos.turn = 'w';
  pos.ply = 0;
  return pos;
}

function items(pos: Position, override?: { id: string; square: Square }, gone: Set<Square> = new Set()): ClipItem[] {
  const out: ClipItem[] = [];
  for (let s = 0; s < CELLS; s++) {
    const p = pos.board[s];
    if (!p) continue;
    const square = override && p.id === override.id ? override.square : s;
    out.push({
      key: p.id,
      cardId: p.cardId,
      type: p.type,
      color: p.color,
      square,
      hero: p.id === 'hero',
      state: gone.has(s) && !(override && p.id === override.id) ? 'gone' : 'on',
      frozen: (pos.frozenUntil[p.id] ?? -1) >= pos.ply,
      rider: !!pos.passengers[p.id],
    });
  }
  for (const c of ['w', 'b'] as Color[]) {
    for (const ill of pos.hiddenState[c].illusions) {
      out.push({
        key: ill.id,
        cardId: ill.cardId,
        type: ill.type,
        color: ill.color,
        square: ill.square,
        hero: false,
        state: 'illusion',
        frozen: false,
        rider: false,
      });
    }
  }
  return out;
}

/** Moves of the piece on `from`; the ones its classic piece could not make are violet. */
function marksOf(pos: Position, from: Square): [Square, ClipMark][] {
  const moves = legalMoves(pos).filter((m) => m.from === from);
  const piece = pos.board[from]!;
  const plain = clonePosition(pos);
  plain.board[from] = { ...piece, cardId: CLASSIC_CARD[piece.type] };
  const classic = new Set(
    legalMoves(plain)
      .filter((m) => m.from === from)
      .map((m) => `${m.target}|${m.captures.join(',')}`),
  );
  const out = new Map<Square, ClipMark>();
  for (const m of moves) {
    const first = stopsOf(m)[0];
    const cur = out.get(first);
    const special = !classic.has(`${m.target}|${m.captures.join(',')}`);
    const hit = m.captures.includes(first) || cur === 'capture' || cur === 'far-capture';
    if (special && cur !== 'move' && cur !== 'capture') out.set(first, hit ? 'far-capture' : 'far');
    else out.set(first, hit ? 'capture' : 'move');
  }
  for (const m of moves) {
    const st = stopsOf(m);
    const end = st[st.length - 1];
    if (st.length > 1 && !out.has(end)) out.set(end, m.captures.includes(end) ? 'far-capture' : 'far');
  }
  return [...out];
}

function squareOf(pos: Position, ref: string): Square {
  if (ref === 'hero') return findPiece(pos, 'hero');
  return parseSquare(ref);
}

/** Give the move to `color`, as if the other side had made a quiet move. */
function turnTo(pos: Position, color: Color): Position {
  if (pos.turn === color) return pos;
  const next = clonePosition(pos);
  next.ply += 1;
  next.turn = color;
  return next;
}

const PLAIN = new Set([t('Хід'), t('Взяти')]);

function pickMove(pos: Position, step: Extract<ClipStep, { move: string }>): Move {
  const [fromRef, toRef] = step.move.split(' ');
  const from = squareOf(pos, fromRef);
  let moves = legalMoves(pos).filter((m) => m.from === from);
  if (toRef !== '*') {
    // Board squares by name ("e4"), ring squares as the engine names them ("d↑").
    moves = moves.filter((m) => squareName(m.target) === toRef || (m.to !== null && squareName(m.to) === toRef));
  }
  if (step.label) moves = moves.filter((m) => step.label!.test(m.label));
  if (!moves.length) throw new Error(`No move ${step.move} ${step.label ?? ''}`);
  // Prefer the special move, then captures, then the longest trip.
  const rank = (m: Move) => (PLAIN.has(m.label) ? 0 : 100) + m.captures.length * 10 + m.path.length;
  return moves.reduce((a, b) => (rank(b) > rank(a) ? b : a));
}

function flashOf(events: GameEvent[], pos: Position, m: Move): Square[] {
  const out: Square[] = [];
  if (events.some((e) => e.type === 'kamikaze')) out.push(m.target);
  for (const e of events) {
    if ('square' in e && e.type !== 'captured') out.push(e.square);
    if ('to' in e) out.push(e.to);
    if (e.type === 'kamikaze' || e.type === 'martyr') {
      const id = e.type === 'kamikaze' ? e.attacker.id : e.attackerId;
      const s = findPiece(pos, id);
      if (s >= 0) out.push(s);
    }
  }
  return out;
}

function base(pos: Position, extra: Partial<ClipScene>): ClipScene {
  return {
    items: items(pos),
    caption: '',
    who: 'note',
    ms: AIM_MS,
    marks: [],
    aim: [],
    target: null,
    flash: [],
    barrier: pos.barriers.flatMap((b) => b.squares),
    platforms: pos.platforms.map((p) => p.square),
    moving: null,
    ...extra,
  };
}

/** Mark what changed between scenes: pieces that left fade out, new ones pop in. */
function link(scenes: ClipScene[]): ClipScene[] {
  for (let i = 1; i < scenes.length; i++) {
    const prev = scenes[i - 1].items;
    const cur = scenes[i].items;
    const keys = new Set(cur.map((it) => it.key));
    const before = new Map(prev.map((it) => [it.key, it.square]));
    for (const it of cur) {
      const was = before.get(it.key);
      if (was === undefined) {
        if (it.state === 'on') it.state = 'born';
      } else if (Math.max(Math.abs(fileOf(was) - fileOf(it.square)), Math.abs(rankOf(was) - rankOf(it.square))) > 2) {
        it.warp = true;
        scenes[i].ms = Math.max(scenes[i].ms, STEP_MS * 2);
      }
    }
    for (const it of prev) if (!keys.has(it.key) && it.state !== 'gone') cur.push({ ...it, state: 'gone' });
  }
  return scenes;
}

export function runScript(cardId: string, script: ClipScript): Clip {
  let pos = setup(cardId, script);
  const scenes: ClipScene[] = [];
  const log: string[] = [];
  const heroColor: Color = 'w';
  for (const step of script.steps) {
    if ('marks' in step) {
      const from = squareOf(pos, step.marks);
      const color = pos.board[from]!.color;
      pos = turnTo(pos, color);
      const marks = marksOf(pos, from);
      log.push(`marks ${marks.length}`);
      scenes.push(base(pos, { caption: step.say, who: color === heroColor ? 'hero' : 'enemy', ms: MARKS_MS, marks }));
      continue;
    }
    if ('ability' in step) {
      const from = squareOf(pos, step.ability);
      const piece = pos.board[from]!;
      pos = turnTo(pos, piece.color);
      const option = abilityOptions(pos, piece.id).find((o) => step.key.test(o.key));
      if (!option) throw new Error(`No ability ${step.key} for ${cardId}`);
      scenes.push(base(pos, { caption: step.say, who: 'hero', flash: [from] }));
      pos = applyAbility(pos, piece.id, option.key).pos;
      log.push(`ability ${option.key}`);
      const shown = step.show ? step.show.split(' ').map(parseSquare) : [];
      scenes.push(
        base(pos, {
          caption: step.then ?? step.say,
          who: 'hero',
          ms: RESULT_MS,
          flash: shown.length ? [] : option.squares,
          aim: shown,
          target: shown[shown.length - 1] ?? null,
        }),
      );
      continue;
    }
    if ('choose' in step) {
      const pc = pos.pending[0];
      if (!pc) throw new Error(`Nothing to choose for ${cardId}`);
      const to = step.choose === '*' ? pc.options[0] : parseSquare(step.choose);
      scenes.push(base(pos, { caption: step.say, who: 'hero', marks: pc.options.map((s) => [s, 'move']) }));
      pos = applyChoice(pos, to).pos;
      log.push('choice');
      scenes.push(base(pos, { caption: step.then ?? step.say, who: 'hero', ms: RESULT_MS, flash: [to] }));
      continue;
    }
    const from = squareOf(pos, step.move.split(' ')[0]);
    const mover = pos.board[from];
    if (!mover) throw new Error(`No piece on ${step.move} for ${cardId}`);
    pos = turnTo(pos, mover.color);
    const m = pickMove(pos, step);
    const who = mover.color === heroColor ? 'hero' : 'enemy';
    const route = m.path.filter((s) => script.ring || isBoardSquare(s));
    const end = m.to ?? m.target;
    scenes.push(base(pos, { caption: step.say, who, aim: route, target: m.target }));
    const gone = new Set<Square>();
    // Walk the path; a piece that ends elsewhere (Дуеліст goes back, Ротатор
    // swaps) takes one more step to its final square.
    const walk = m.to !== null && route[route.length - 1] !== end ? [...route, end] : route;
    for (const s of walk) {
      if (m.captures.includes(s)) gone.add(s);
      scenes.push(
        base(pos, {
          items: items(pos, { id: mover.id, square: s }, gone),
          caption: step.say,
          who,
          ms: STEP_MS,
          moving: mover.id,
        }),
      );
    }
    const res = applyMoveWithEvents(pos, m);
    log.push(`${m.label}${res.events.length ? ' [' + res.events.map((e) => e.type).join(',') + ']' : ''}`);
    pos = res.pos;
    scenes.push(base(pos, { caption: step.then ?? step.say, who: step.then ? 'note' : who, ms: RESULT_MS, flash: flashOf(res.events, pos, m) }));
  }
  return { scenes: link(scenes), ring: !!script.ring, log };
}

const cache = new Map<string, Clip | null>();

export function buildClip(cardId: string): Clip | null {
  if (cache.has(cardId)) return cache.get(cardId)!;
  const script = CARD_SCRIPTS[cardId];
  let clip: Clip | null = null;
  if (script) {
    try {
      clip = runScript(cardId, script);
    } catch (e) {
      if (import.meta.env?.DEV) console.warn(`clip ${cardId}:`, e);
    }
  }
  cache.set(cardId, clip);
  return clip;
}
