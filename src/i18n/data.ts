import { CAPTURE_FX } from '../economy/captureFx';
import { LADDER_NAMES, LEAGUES, TRIALS } from '../economy/leagues';
import { PACKS, STARTER_PACK } from '../economy/packs';
import { QUEST_POOL } from '../economy/quests';
import { BOARD_THEMES } from '../economy/themes';
import { BOT_LEVELS } from '../engine/bot/levels';
import { CARDS, EFFECT_NAMES, PIECE_NAMES, RARITY_NAMES } from '../engine/cards';
import { getLang, t } from '.';

/**
 * Names and texts of the game's data (cards, leagues, boards, packs) in the
 * chosen language, once, before the app starts. Only display text changes:
 * ids and the engine's move labels (which the server compares) stay as they are.
 */
export function localizeData(): void {
  if (getLang() === 'uk') return;
  const names = <K extends string>(map: Record<K, string>) => {
    for (const k of Object.keys(map) as K[]) map[k] = t(map[k]);
  };
  for (const c of CARDS) {
    c.name = t(c.name);
    c.rulesText = t(c.rulesText);
  }
  names(PIECE_NAMES);
  names(RARITY_NAMES);
  names(EFFECT_NAMES);
  names(LADDER_NAMES);
  for (const list of Object.values(LEAGUES)) for (const l of list) l.name = t(l.name);
  for (const tr of TRIALS) {
    tr.name = t(tr.name);
    tr.description = t(tr.description);
  }
  for (const th of BOARD_THEMES) th.name = t(th.name);
  for (const fx of CAPTURE_FX) fx.name = t(fx.name);
  for (const q of QUEST_POOL) q.text = t(q.text);
  for (const p of [...Object.values(PACKS), STARTER_PACK]) {
    p.name = t(p.name);
    p.description = t(p.description);
  }
  for (const b of BOT_LEVELS) b.name = t(b.name);
}
