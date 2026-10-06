import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { loadLang } from './i18n';
import { localizeData } from './i18n/data';
import { embedded } from './ui/router';
import { applySettings } from './ui/settings';
import './ui/styles.css';

applySettings();
// The claude.ai frame already pads the page by the phone's safe areas.
if (embedded) document.documentElement.classList.add('embedded');

// iOS Safari can keep the page as short as it was with the keyboard open, leaving
// an empty band under the tab bar. A scroll on the spot after the keyboard goes
// makes it measure the page again.
window.visualViewport?.addEventListener('resize', () => {
  const el = document.activeElement;
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;
  setTimeout(() => window.scrollTo(window.scrollX, window.scrollY), 60);
});
document.addEventListener('focusout', () => setTimeout(() => window.scrollTo(window.scrollX, window.scrollY), 120));

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
