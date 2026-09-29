// Daily quests: three small goals a day with gold or shard rewards.

export type QuestEvent = 'play' | 'win' | 'winRanked' | 'openPack' | 'friendGame';

export interface QuestDef {
  id: string;
  text: string;
  event: QuestEvent;
  target: number;
  reward: { gold?: number; shards?: number };
}

export const QUEST_POOL: QuestDef[] = [
  { id: 'play3', text: 'Зіграйте 3 партії', event: 'play', target: 3, reward: { gold: 60 } },
  { id: 'win1', text: 'Здобудьте перемогу', event: 'win', target: 1, reward: { gold: 40 } },
  { id: 'ranked2', text: 'Виграйте 2 бої в лігах', event: 'winRanked', target: 2, reward: { shards: 40 } },
  { id: 'packs2', text: 'Відкрийте 2 паки', event: 'openPack', target: 2, reward: { gold: 50 } },
  { id: 'friend1', text: 'Зіграйте партію з другом', event: 'friendGame', target: 1, reward: { shards: 30 } },
];

export interface QuestState {
  day: string;
  progress: Record<string, number>;
  claimed: string[];
}

export interface QuestView extends QuestDef {
  progress: number;
  claimed: boolean;
}

/** Today's three quests: always "play 3", plus two that rotate by day. */
export function questsFor(day: string): QuestDef[] {
  const n = Math.floor(Date.parse(`${day}T00:00:00Z`) / 864e5);
  const rest = QUEST_POOL.slice(1);
  const a = rest[n % rest.length];
  const b = rest[(n + 2) % rest.length];
  return [QUEST_POOL[0], a, b];
}

export function parseQuests(raw: string | null | undefined, day: string): QuestState {
  try {
    const q = JSON.parse(raw || '{}') as QuestState;
    if (q.day === day) return { day, progress: q.progress ?? {}, claimed: q.claimed ?? [] };
  } catch {
    // Start the day fresh.
  }
  return { day, progress: {}, claimed: [] };
}

export function addProgress(state: QuestState, events: QuestEvent[]): QuestState {
  const progress = { ...state.progress };
  for (const q of questsFor(state.day)) {
    const hits = events.filter((e) => e === q.event).length;
    if (hits) progress[q.id] = Math.min(q.target, (progress[q.id] ?? 0) + hits);
  }
  return { ...state, progress };
}

export function questViews(state: QuestState): QuestView[] {
  return questsFor(state.day).map((q) => ({ ...q, progress: state.progress[q.id] ?? 0, claimed: state.claimed.includes(q.id) }));
}
