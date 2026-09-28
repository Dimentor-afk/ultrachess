import { useEffect, useState } from 'react';
import type { Deck } from '../engine/types';
import { CatalogPage } from './CatalogPage';
import { DeckPage } from './DeckPage';
import { MatchPage } from './MatchPage';
import { Glyph } from './common';
import { CLASSIC_DECK, allDecks, loadActiveDeckId, loadDecks, saveActiveDeckId, saveDecks } from './storage';

type Route = 'cards' | 'deck' | 'match';

const ROUTES: { id: Route; label: string }[] = [
  { id: 'cards', label: 'Колекція' },
  { id: 'deck', label: 'Колода' },
  { id: 'match', label: 'Матч' },
];

function readRoute(): Route {
  const h = window.location.hash.replace(/^#\/?/, '');
  return (ROUTES.find((r) => r.id === h)?.id ?? 'match') as Route;
}

export function App() {
  const [route, setRoute] = useState<Route>(readRoute);
  const [saved, setSaved] = useState<Deck[]>(loadDecks);
  const [activeId, setActiveId] = useState<string>(() => {
    const id = loadActiveDeckId();
    return allDecks(loadDecks()).some((d) => d.id === id) ? id : CLASSIC_DECK.id;
  });

  useEffect(() => {
    const onHash = () => setRoute(readRoute());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const updateSaved = (next: Deck[]) => {
    setSaved(next);
    saveDecks(next);
  };
  const activate = (id: string) => {
    setActiveId(id);
    saveActiveDeckId(id);
  };

  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href="#/match">
          <Glyph type="knight" color="w" /> Ultrachess
        </a>
        <nav>
          {ROUTES.map((r) => (
            <a key={r.id} href={`#/${r.id}`} className={route === r.id ? 'active' : ''}>
              {r.label}
            </a>
          ))}
        </nav>
      </header>
      <main>
        {route === 'cards' && <CatalogPage />}
        {route === 'deck' && (
          <DeckPage
            saved={saved}
            activeId={activeId}
            onActivate={activate}
            onSave={(deck) => {
              const exists = saved.some((d) => d.id === deck.id);
              updateSaved(exists ? saved.map((d) => (d.id === deck.id ? deck : d)) : [...saved, deck]);
            }}
            onDelete={(id) => {
              updateSaved(saved.filter((d) => d.id !== id));
              if (activeId === id) activate(CLASSIC_DECK.id);
            }}
          />
        )}
        {/* Kept mounted so a running game survives visits to other tabs. */}
        <div hidden={route !== 'match'}>
          <MatchPage decks={allDecks(saved)} activeId={activeId} />
        </div>
      </main>
    </div>
  );
}
