// Reactions players send each other during a game with people: a fixed set
// of emoji, no chat (nothing to moderate). They are not stored anywhere.

export const EMOTES = ['👍', '😮', '😂', '🔥', '😭', '🤝'] as const;
export type Emote = (typeof EMOTES)[number];

/** One emote per player per this long. */
export const EMOTE_GAP_MS = 2000;

export function isEmote(e: unknown): e is Emote {
  return typeof e === 'string' && (EMOTES as readonly string[]).includes(e);
}
