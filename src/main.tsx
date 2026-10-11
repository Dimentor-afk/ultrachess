import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { loadLang } from './i18n';
import { localizeData } from './i18n/data';
import { embedded } from './ui/router';
import { applySettings } from './ui/settings';
import './ui/styles.css';

// The demo's test clock (admin page, demo only): every Date.now() runs that far ahead.
try {
  const shift = Number(localStorage.getItem('uc.demo.clockShift'));
  if (shift) {
    const real = Date.now;
    Date.now = () => real() + shift;
  }
} catch {
  // no storage: the real clock
}

applySettings();
// The claude.ai frame already pads the page by the phone's safe areas.
if (embedded) document.documentElement.classList.add('embedded');

// iOS Safari can keep the page as short as it was with the keyboard open, leaving
// an empty band under the tab bar. A scroll on the spot after the keyboard goes
// makes it measure the page again. Only then: at any other time that scroll would
// stop a smooth scroll on its way (the deck's "Використати" scrolling to the board).
const typing = (el: EventTarget | null) => el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
let keyboardClosedAt = 0;
const remeasure = () => window.scrollTo(window.scrollX, window.scrollY);
window.visualViewport?.addEventListener('resize', () => {
  if (typing(document.activeElement) || Date.now() - keyboardClosedAt > 1500) return;
  setTimeout(remeasure, 60);
});
document.addEventListener('focusout', (e) => {
  if (!typing(e.target)) return;
  keyboardClosedAt = Date.now();
  setTimeout(remeasure, 120);
});

// The language loads first: screens translate some texts as their modules load.
void loadLang()
  .catch(() => undefined)
  .then(async () => {
    localizeData();
    const [{ App }, { ErrorBoundary }] = await Promise.all([import('./ui/App'), import('./ui/ErrorBoundary')]);
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <ErrorBoundary full>
          <App />
        </ErrorBoundary>
      </StrictMode>,
    );
  });
