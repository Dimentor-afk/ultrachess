// Bot against bot on the same random decks, each pair of games with colours swapped.
//   npx tsx scripts/bot/duel.ts '<A json>' '<B json>' <first seed> <pairs>
// A side: {"engine":"new"|"baseline","depth":5,"timeMs":300,"noise":3}. Prints one JSON line.
import { createMatch, performAction, type MatchState } from '../../src/engine/match';
import { material } from '../../src/engine/bot/evaluate';
import { opposite } from '../../src/engine/coords';
import type { Color } from '../../src/engine/types';
import * as fresh from '../../src/engine/bot/search';
import * as base from './baseline/search';
import { randomDeck, rng } from './common';

interface Side {
  engine: 'new' | 'baseline';
  depth: number;
  timeMs: number;
  noise?: number;
  blunder?: number;
  quiescence?: boolean;
}

const A: Side = JSON.parse(process.argv[2]);
const B: Side = JSON.parse(process.argv[3]);
const seed0 = Number(process.argv[4] ?? 1);
const pairs = Number(process.argv[5] ?? 2);
const MAX_PLY = 200;

function turn(side: Side, s: MatchState, c: Color) {
  const opts = { depth: side.depth, timeMs: side.timeMs, noise: side.noise, blunder: side.blunder, quiescence: side.quiescence };
  return (side.engine === 'baseline' ? base : fresh).chooseTurn(s, c, opts);
}

/** 1: white won, 0: black won, 0.5: draw. Long games are judged on material. */
function play(white: Side, black: Side, seed: number): number {
  const r = rng(seed);
  let s = createMatch(randomDeck(r), randomDeck(r));
  while (!s.result && s.ply < MAX_PLY) {
    const c = s.turn;
    const t = turn(c === 'w' ? white : black, s, c);
    if (!t.actions.length) break;
    for (const a of t.actions) {
      if (s.result) break;
      s = performAction(s, a);
    }
  }
  if (s.result) return s.result.winner === null ? 0.5 : s.result.winner === 'w' ? 1 : 0;
  const d = material(s, 'w') - material(s, opposite('w'));
  return d >= 400 ? 1 : d <= -400 ? 0 : 0.5;
}

let score = 0;
let games = 0;
for (let i = 0; i < pairs; i++) {
  const seed = seed0 + i;
  score += play(A, B, seed);
  score += 1 - play(B, A, seed);
  games += 2;
}
console.log(JSON.stringify({ score, games }));
