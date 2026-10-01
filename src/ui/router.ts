// In-app navigation. Links keep their "#/..." hrefs, but a click is handled
// here: the page switches first, and the address bar follows when the app
// runs on its own. Inside a frame (the claude.ai demo) the address is left
// alone: such hosts block "#/..." navigation or react to URL changes.

import { useEffect, useState } from 'react';

type Listener = () => void;

const listeners = new Set<Listener>();
let path = readHash();

/** Inside someone else's frame the address bar is not ours: routes stay in memory. */
export const embedded = (() => {
  try {
    return window.top !== window.self;
  } catch {
    return true;
  }
})();

function readHash(): string {
  try {
    return window.location.hash.replace(/^#/, '');
  } catch {
    return '';
  }
}

function notify(): void {
  listeners.forEach((l) => l());
}

/** The current route, e.g. "/deck/style". */
export function currentPath(): string {
  return path;
}

export function navigate(to: string): void {
  const next = to.replace(/^#/, '');
  if (next === path) return;
  path = next;
  if (!embedded) {
    try {
      history.pushState(null, '', `#${next}`);
    } catch {
      // No history access: the route lives in memory only.
    }
  }
  notify();
}

export function onNavigate(fn: Listener): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

/** The current route, re-rendering the component when it changes. */
export function useRoutePath(): string {
  const [p, set] = useState(path);
  useEffect(() => onNavigate(() => set(path)), []);
  return p;
}

if (typeof window !== 'undefined') {
  // Back/forward buttons and addresses typed by hand.
  const sync = () => {
    const p = readHash();
    if (p !== path) {
      path = p;
      notify();
    }
  };
  window.addEventListener('popstate', sync);
  window.addEventListener('hashchange', sync);

  // Every <a href="#/..."> in the app goes through navigate().
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = (e.target as Element | null)?.closest?.('a[href^="#/"]');
    if (!a) return;
    e.preventDefault();
    navigate(a.getAttribute('href')!);
  });
}
