// Animation lab (dev server only): plays a scripted game on the real board so
// effects can be watched and recorded. http://localhost:5173/scripts/fxlab/?s=immortal
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { classicDeck } from '../../src/engine/deck';
import { type Action, type MatchState, createMatch, performAction } from '../../src/engine/match';
import { legalMoves } from '../../src/engine/legal';
import { abilityOptions } from '../../src/engine/abilities';
import { parseSquare } from '../../src/engine/coords';
import { playerView } from '../../src/engine/view';
import type { Deck } from '../../src/engine/types';
import { Board } from '../../src/ui/Board';
import '../../src/ui/styles.css';

/** "e2e4", "e2e4~label" (a move whose label has this), "!queen-immortal:arm" (an ability). */
type Step = string;
const SCENES: Record<string, { white?: Partial<Deck>; black?: Partial<Deck>; steps: Step[]; watch: number }> = {
  // The struck Безсмертна rises and comes back on d1.
  immortal: { white: { queen: 'queen-immortal' }, steps: ['e2e4', 'g7g6', '!queen-immortal:arm', 'd1h5', 'g6h5'], watch: 3 },
  // Портальний слон out through a6, back in on h3, on to d7.
  portal: { white: { bishop2: 'bishop-portal' }, steps: ['e2e3', 'a7a5', 'f1d7~'], watch: 1 },
  // Берсерк takes twice in one move.
  // Землетрус on the 7th rank: the pieces jump one after another, cracks run along.
  quake: { white: { rook1: 'rook-earthquake' }, steps: ['a2a4', 'h7h6', 'a1a3', 'h6h5', '!rook-earthquake:*'], watch: 1 },
  // Смертник takes the knight that took it.
  kamikaze: { white: { rook1: 'rook-kamikaze' }, steps: ['a2a4', 'b7b5', 'a4b5', 'a7a6', 'a1a6', 'b8a6'], watch: 1 },
  // A won game: fireworks.
  win: { steps: ['e2e4'], watch: 0 },
  berserk: { white: { knight2: 'knight-berserk' }, steps: ['g1f3', 'e7e6', 'f3g5', 'a7a6', 'g5e6~'], watch: 1 },
};

const q = new URLSearchParams(location.search);
const name = q.get('s') ?? 'immortal';
const scene = SCENES[name];
const GAP = Number(q.get('gap') ?? 1600);
const zoom = q.get('zoom');
if (zoom) document.documentElement.style.zoom = zoom;

function step(m: MatchState, s: Step): MatchState {
  if (s.startsWith('!')) {
    const [card, key] = s.slice(1).split(':');
    const piece = m.board.find((p) => p?.cardId === card && p.color === m.turn)!;
    // "*": the first option that moves some pieces (a line with pieces on it).
    const k = key === '*' ? abilityOptions(m, piece.id).filter((o) => o.squares.filter((q) => m.board[q]).length > 2)[0].key : key;
    return performAction(m, { type: 'ability', pieceId: piece.id, key: k } as Action);
  }
  const [uci, label] = s.split('~');
  const from = parseSquare(uci.slice(0, 2));
  const to = parseSquare(uci.slice(2, 4));
  const all = legalMoves(m).filter((x) => x.from === from && (x.target === to || x.to === to));
  const move = (label !== undefined ? all.sort((a, b) => (b.legs?.length ?? 0) - (a.legs?.length ?? 0)) : all)[0];
  if (!move) throw new Error(`no move ${s}: ${legalMoves(m).filter((x) => x.from === from).map((x) => `${x.target}/${x.label}`).join(', ')}`);
  return performAction(m, { type: 'move', move });
}

function Lab() {
  const [states] = useState(() => {
    let m = createMatch({ ...classicDeck(), ...scene.white }, { ...classicDeck(), ...scene.black });
    const out = [m];
    for (const s of scene.steps) out.push((m = step(m, s)));
    return out;
  });
  // Up to `watch` steps before the end are played at once; the rest one by one.
  const first = Math.max(0, states.length - 1 - scene.watch);
  const [i, setI] = useState(first);
  useEffect(() => {
    if (i >= states.length - 1) {
      const t = setTimeout(() => (document.body.dataset.done = '1'), 2600);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setI(i + 1), i === first ? 900 : GAP);
    return () => clearTimeout(t);
  }, [i]);
  const view = playerView(states[i], 'w');
  return (
    <div style={{ width: 432, padding: 12, boxSizing: 'border-box' }}>
      <Board view={view} orientation="w" selected={null} marks={new Map()} lastMove={new Set()} hint={new Set()} preview={new Set()} checkSquare={null} onSquare={() => {}} celebrate={name === 'win' && i === states.length - 1} />
      <p style={{ color: '#fff', font: '14px sans-serif' }}>{view.history.at(-1)?.text ?? ''}</p>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Lab />
  </StrictMode>,
);
