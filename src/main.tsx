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
