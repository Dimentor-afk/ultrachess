// Battle scenes for the ads: a position from { e1: 'w:king-classic', ... }
// and the moves played on it, through the real engine.
import { abilityOptions } from '../../src/engine/abilities';
import { getCard } from '../../src/engine/cards';
import { parseSquare } from '../../src/engine/coords';
import { classicDeck } from '../../src/engine/deck';
import { legalMoves } from '../../src/engine/legal';
import { type Action, type MatchState, performAction } from '../../src/engine/match';
import { emptyPosition, findKing } from '../../src/engine/position';
import type { Color } from '../../src/engine/types';
import { playerView } from '../../src/engine/view';
import { squareCenter } from '../../src/ui/Board';

export interface SceneSpec {
  /** Pieces: { e1: 'w:king-classic', d8: 'b:queen-immortal', ... }. */
  pos: Record<string, string>;
  turn?: Color;
  /** Background pieces (CROWD, or the ones given) unless false; `clear`: crowd squares to leave empty. */
  crowd?: boolean | Record<string, string>;
  clear?: string[];
  /** "e2e4", "e2e4~" (the longest of the moves there), "f1>levitate" (a move of that kind),
   *  "*card" (that card's move, a capture if it has one), "!queen-immortal:arm" or
   *  "!rook-earthquake:*" (an ability, it does not use the turn); "…|caption" changes the caption. */
  steps: string[];
}

/**
 * Pieces around the action so the board looks like a game in progress; any
 * square the scene uses (or one listed in `clear`) stays as the scene has it.
 */
const CROWD: Record<string, string> = {
  a2: 'w:pawn-classic', b3: 'w:pawn-classic', c2: 'w:pawn-classic', g2: 'w:pawn-classic', h3: 'w:pawn-classic',
  b1: 'w:knight-classic', c1: 'w:bishop-classic', a1: 'w:rook-classic',
  a7: 'b:pawn-classic', b6: 'b:pawn-classic', g7: 'b:pawn-classic', h6: 'b:pawn-classic', f7: 'b:pawn-classic',
  b8: 'b:knight-classic', h8: 'b:rook-classic', c8: 'b:bishop-classic',
};

export function startState(spec: SceneSpec): MatchState {
  const pos = emptyPosition();
  let n = 1;
  const clear = new Set(spec.clear ?? []);
  const crowd = spec.crowd === false ? {} : spec.crowd === true || !spec.crowd ? CROWD : spec.crowd;
  const pieces = { ...(Object.fromEntries(Object.entries(crowd).filter(([q]) => !clear.has(q)))), ...spec.pos };
  for (const [name, def] of Object.entries(pieces)) {
    const [color, cardId] = def.split(':') as [Color, string];
    const s = parseSquare(name);
    pos.board[s] = { id: `p${n++}`, color, type: getCard(cardId).pieceType, cardId, moveCount: 0, homeSquare: s };
  }
  pos.nextId = n + 1;
  pos.turn = spec.turn ?? 'w';
  pos.ply = pos.turn === 'w' ? 10 : 11;
  return { ...pos, decks: { w: classicDeck(), b: classicDeck() }, history: [], repetition: {}, status: 'playing', result: null, lastMove: null, fx: null };
}

function step(m: MatchState, raw: string): MatchState {
  const s = raw.split('|')[0].trim();
  if (s.startsWith('!')) {
    const [card, ...rest] = s.slice(1).split(':');
    const key = rest.join(':');
    const piece = m.board.find((p) => p?.cardId === card && p.color === m.turn);
    if (!piece) throw new Error(`no ${card} for ${m.turn}`);
    const opts = abilityOptions(m, piece.id);
    const k = key === '*' ? (opts.find((o) => o.squares.filter((q) => m.board[q]).length > 2) ?? opts[0]).key : key;
    return performAction(m, { type: 'ability', pieceId: piece.id, key: k } as Action);
  }
  // "*bishop-levitation": that card's move, a capture if it has one.
  if (s.startsWith('*')) {
    const card = s.slice(1);
    const mine = legalMoves(m).filter((x) => m.board[x.from]?.cardId === card);
    const move = mine.find((x) => x.captures.length) ?? mine[0];
    if (!move) throw new Error(`no move for ${card}`);
    return performAction(m, { type: 'move', move });
  }
  if (s.includes('>')) {
    const [sq, kind] = s.split('>');
    const move = legalMoves(m).find((x) => x.from === parseSquare(sq) && x.kind === kind);
    if (!move) throw new Error(`no ${kind} from ${sq}`);
    return performAction(m, { type: 'move', move });
  }
  const longest = s.endsWith('~');
  const uci = s.replace('~', '');
  const from = parseSquare(uci.slice(0, 2));
  const to = parseSquare(uci.slice(2, 4));
  const all = legalMoves(m).filter((x) => x.from === from && (x.target === to || x.to === to));
  if (!all.length) throw new Error(`no move ${s}: ${legalMoves(m).filter((x) => x.from === from).map((x) => `${x.target}/${x.label}`).join(', ')}`);
  const move = longest ? all.sort((a, b) => (b.legs?.length ?? 0) - (a.legs?.length ?? 0))[0] : all.find((x) => x.to === to) ?? all[0];
  return performAction(m, { type: 'move', move });
}

export function playScene(spec: SceneSpec): MatchState[] {
  let m = startState(spec);
  const out = [m];
  for (const s of spec.steps) out.push((m = step(m, s)));
  return out;
}

export const view = (m: MatchState) => playerView(m, 'w');
export { parseSquare };

export function squareXY(name: string): { x: number; y: number } {
  return squareCenter(parseSquare(name), 'w');
}

export function checkSquare(m: MatchState): number | null {
  if (m.status !== 'check' && m.status !== 'checkmate') return null;
  const k = findKing(m, m.turn);
  return k ?? null;
}
