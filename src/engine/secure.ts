// The game as one viewer may see it (spec §4.5–4.6, §6). The server never
// sends the real state to a client: each player gets this view for their
// side, a spectator gets it for nobody.
//
// What changes for a side that is not the viewer:
// - its illusions become ordinary pieces (copying the real piece's flags),
// - its piece ids are replaced by opaque ones, so no id says "illusion",
// - its hidden state (illusions, Безсмертна's shield, the hint) is emptied,
// - cooldowns of its hidden buttons (Безсмертна, Підказка, Міраж) are dropped,
// - its hidden actions vanish from the history and from the animations.
// A hidden action therefore leaves the other side's view exactly as it was.

import { ABILITY_DEFS } from './abilities';
import { CELLS } from './coords';
import type { MatchFx } from './fx';
import type { HistoryEntry, MatchState } from './match';
import { clonePosition, emptyHidden } from './position';
import type { Color, Piece } from './types';

/** Replaces a real piece id with an opaque one (stable for the same id). */
export type OpaqueId = (id: string) => string;

/** The text of a history entry for `viewer` (null: hidden from them). */
export function historyText(h: HistoryEntry, viewer: Color | null): string | null {
  return h.color === viewer ? (h.ownText ?? h.text) : h.text;
}

/** No client ever needs the real id counter (it would count hidden illusions). */
const CLIENT_NEXT_ID = 1_000_000;

export function secureState(state: MatchState, viewer: Color | null, opaque: OpaqueId): MatchState {
  const hidden = (c: Color) => c !== viewer;
  const pos = clonePosition(state);

  // Who owns each id the maps may refer to.
  const owner = new Map<string, Color>();
  const note = (p: Piece | null | undefined) => p && owner.set(p.id, p.color);
  state.board.forEach(note);
  for (const pc of state.pending) note(pc.piece);
  for (const p of Object.values(state.passengers)) note(p);
  for (const c of ['w', 'b'] as Color[]) for (const ill of state.hiddenState[c].illusions) owner.set(ill.id, c);

  const idFor = (id: string) => (hidden(owner.get(id) ?? viewer ?? 'w') ? opaque(id) : id);
  const cardOf = new Map<string, string>();
  for (const p of state.board) if (p) cardOf.set(p.id, p.cardId);
  const secretButton = (id: string) => !!ABILITY_DEFS[cardOf.get(id) ?? '']?.hidden;

  /** Keys of the viewer's pieces stay; others' are re-keyed; unknown (dead) ones are dropped. */
  function rekey<T>(map: Record<string, T>, keep: (id: string) => boolean = () => true): Record<string, T> {
    const out: Record<string, T> = {};
    for (const [id, v] of Object.entries(map)) {
      const c = owner.get(id);
      if (c === undefined) continue;
      if (!hidden(c)) out[id] = v;
      else if (keep(id)) out[opaque(id)] = v;
    }
    return out;
  }
  const rename = (p: Piece): Piece => (hidden(p.color) ? { ...p, id: opaque(p.id) } : p);

  pos.cooldowns = rekey(state.cooldowns, (id) => !secretButton(id));
  pos.onceUsed = rekey(state.onceUsed);
  pos.frozenUntil = rekey(state.frozenUntil);
  pos.noPromote = rekey(state.noPromote);
  pos.lastWasSwap = rekey(state.lastWasSwap);
  pos.castlingLost = rekey(state.castlingLost);
  pos.passengers = {};
  for (const [id, pawn] of Object.entries(state.passengers)) {
    if (owner.has(id)) pos.passengers[idFor(id)] = rename(pawn);
  }
  pos.board = state.board.map((p) => (p ? rename(p) : null));
  pos.platforms = state.platforms.map((pl) => ({ ...pl, pieceId: idFor(pl.pieceId) }));
  pos.pending = state.pending.map((pc) => ({ ...pc, piece: rename(pc.piece) }));

  for (const c of ['w', 'b'] as Color[]) {
    if (!hidden(c)) continue;
    // Others' illusions are pieces like any other, with the real piece's flags.
    for (const ill of state.hiddenState[c].illusions) {
      if (pos.board[ill.square]) continue;
      const src = state.board.find((p) => p?.id === ill.sourceId);
      const id = opaque(ill.id);
      pos.board[ill.square] = {
        id,
        color: c,
        type: ill.type,
        cardId: ill.cardId,
        moveCount: src?.moveCount ?? 1,
        homeSquare: src?.homeSquare ?? ill.square,
      };
      if (!src) continue;
      const from = opaque(src.id);
      for (const map of [pos.cooldowns, pos.onceUsed, pos.frozenUntil, pos.noPromote, pos.lastWasSwap, pos.castlingLost] as Record<string, unknown>[]) {
        if (from in map) map[id] = map[from];
      }
    }
    pos.hiddenState[c] = emptyHidden();
  }
  pos.nextId = CLIENT_NEXT_ID;

  const history: HistoryEntry[] = [];
  for (const h of state.history) {
    const text = historyText(h, viewer);
    if (text !== null) history.push({ ply: h.ply, color: h.color, text });
  }
  // The last action hidden from this viewer must not show either: they see
  // the animation of the last action they were allowed to see.
  const last = state.history[state.history.length - 1];
  const fxSource = last && historyText(last, viewer) === null ? (state.fxPublic ?? null) : state.fx;
  const fx: MatchFx | null = fxSource && {
    ...fxSource,
    id: history.length,
    sprites: fxSource.sprites.filter((x) => !x.owner || x.owner === viewer),
  };

  const out: MatchState = { ...state, ...pos, history, fx, repetition: {} };
  delete out.fxPublic;
  return out;
}

/** True when no board square holds an id that gives an illusion away (tests). */
export function noIllusionIds(state: MatchState): boolean {
  for (let s = 0; s < CELLS; s++) if (state.board[s]?.id.startsWith('ill-')) return false;
  return true;
}
