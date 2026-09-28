// What one player is allowed to see (spec §4.5, §6): own hidden state is
// shown, the opponent's illusions look like ordinary pieces and the
// opponent's hidden buttons and flags never leave the engine.

import { ABILITY_DEFS } from './abilities';
import { CELLS } from './coords';
import type { HistoryEntry, LastMove, MatchResult, MatchState } from './match';
import { isFrozen } from './position';
import { inCheck } from './status';
import type { Color, Move, PendingChoice, PieceType, Square, Status } from './types';

export interface ViewPiece {
  /** Own pieces only; opponent pieces get an empty id. */
  id: string;
  color: Color;
  type: PieceType;
  cardId: string;
  /** Own illusion (never set for the opponent's illusions). */
  illusion: boolean;
  frozen: boolean;
  onceUsed: boolean;
  /** Turns until ready; null when unknown or not applicable. */
  cooldown: number | null;
  passenger: boolean;
  /** Opponent turns left before the platform disappears. */
  platformTurnsLeft: number | null;
}

export interface PlayerView {
  color: Color;
  turn: Color;
  ply: number;
  status: Status;
  result: MatchResult | null;
  inCheck: boolean;
  cells: (ViewPiece | null)[];
  barriers: { squares: Square[]; againstColor: Color }[];
  lastMove: LastMove | null;
  history: { ply: number; color: Color; text: string }[];
  hint: Move | null;
  immortalArmed: boolean;
  pending: PendingChoice | null;
}

const COOLDOWN_CARDS = new Set(['bishop-levitation', 'queen-levitation']);

function visibleCooldown(state: MatchState, id: string, cardId: string, own: boolean): number | null {
  const def = ABILITY_DEFS[cardId];
  if (!def && !COOLDOWN_CARDS.has(cardId)) return null;
  if (!own && def?.hidden) return null;
  return state.cooldowns[id] ?? 0;
}

function visibleHistory(history: HistoryEntry[], color: Color): PlayerView['history'] {
  const out: PlayerView['history'] = [];
  for (const h of history) {
    const text = h.color === color ? (h.ownText ?? h.text) : h.text;
    if (text) out.push({ ply: h.ply, color: h.color, text });
  }
  return out;
}

export function playerView(state: MatchState, color: Color): PlayerView {
  const cells: (ViewPiece | null)[] = new Array(CELLS).fill(null);
  const nowPly = state.ply;
  const frozenNow = (id: string, c: Color) => isFrozen(state, id, state.turn === c ? nowPly : nowPly + 1);
  const platformLeft = (id: string): number | null => {
    const pl = state.platforms.find((x) => x.pieceId === id);
    if (!pl) return null;
    // Opponent plies remaining until the platform expires.
    return Math.max(0, Math.ceil((pl.expiresAfterPly - nowPly + 1) / 2));
  };

  for (let s = 0; s < CELLS; s++) {
    const p = state.board[s];
    if (!p) continue;
    const own = p.color === color;
    cells[s] = {
      id: own ? p.id : '',
      color: p.color,
      type: p.type,
      cardId: p.cardId,
      illusion: false,
      frozen: frozenNow(p.id, p.color),
      onceUsed: !!state.onceUsed[p.id],
      cooldown: visibleCooldown(state, p.id, p.cardId, own),
      passenger: !!state.passengers[p.id],
      platformTurnsLeft: platformLeft(p.id),
    };
  }

  for (const c of ['w', 'b'] as Color[]) {
    const own = c === color;
    for (const ill of state.hiddenState[c].illusions) {
      if (cells[ill.square]) continue;
      // An opponent illusion mirrors its source so nothing gives it away.
      const src = state.board.find((p) => p?.id === ill.sourceId);
      cells[ill.square] = {
        id: own ? ill.id : '',
        color: c,
        type: ill.type,
        cardId: ill.cardId,
        illusion: own,
        frozen: src ? frozenNow(src.id, c) : false,
        onceUsed: src ? !!state.onceUsed[src.id] : false,
        cooldown: src ? visibleCooldown(state, src.id, src.cardId, own) : null,
        passenger: false,
        platformTurnsLeft: null,
      };
    }
  }

  const hidden = state.hiddenState[color];
  const pending = state.pending.find((pc) => pc.color === color) ?? null;
  return {
    color,
    turn: state.turn,
    ply: state.ply,
    status: state.status,
    result: state.result,
    inCheck: inCheck(state, color),
    cells,
    barriers: state.barriers.map((b) => ({ squares: b.squares, againstColor: b.againstColor })),
    lastMove: state.lastMove,
    history: visibleHistory(state.history, color),
    hint: hidden.hint,
    immortalArmed: hidden.immortalPly !== null && hidden.immortalPly >= state.ply,
    pending,
  };
}

