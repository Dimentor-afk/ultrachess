import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import type { Api, Collection, PackView, Profile } from '../api/client';
import type { Deck } from '../engine/types';

export interface Toast {
  id: number;
  text: string;
  kind: 'ok' | 'error';
}

interface Session {
  api: Api;
  profile: Profile;
  collection: Collection;
  decks: Deck[];
  packs: PackView[];
  setProfile: (p: Profile) => void;
  setDecks: (d: Deck[]) => void;
  setPacks: (p: PackView[]) => void;
  refresh: () => Promise<void>;
  toast: (text: string, kind?: Toast['kind']) => void;
  logout: () => Promise<void>;
}

const Ctx = createContext<Session | null>(null);

export function useSession(): Session {
  const s = useContext(Ctx);
  if (!s) throw new Error('No session');
  return s;
}

export interface Loaded {
  profile: Profile;
  collection: Collection;
  decks: Deck[];
  packs: PackView[];
}

export async function loadAll(api: Api, profile?: Profile): Promise<Loaded> {
  const [p, collection, decks, packs] = await Promise.all([
    profile ? Promise.resolve(profile) : api.me(),
    api.collection(),
    api.decks(),
    api.packs(),
  ]);
  return { profile: p!, collection, decks, packs };
}

export function SessionProvider({
  api,
  initial,
  onLogout,
  toast,
  children,
}: {
  api: Api;
  initial: Loaded;
  onLogout: () => void;
  toast: Session['toast'];
  children: ReactNode;
}) {
  const [data, setData] = useState<Loaded>(initial);
  const refresh = useCallback(async () => setData(await loadAll(api)), [api]);
  const value: Session = {
    api,
    ...data,
    setProfile: (profile) => setData((d) => ({ ...d, profile })),
    setDecks: (decks) => setData((d) => ({ ...d, decks })),
    setPacks: (packs) => setData((d) => ({ ...d, packs })),
    refresh,
    toast,
    logout: async () => {
      await api.logout();
      onLogout();
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
