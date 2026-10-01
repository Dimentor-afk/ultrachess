import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { embedded } from './ui/router';
import { applySettings } from './ui/settings';
import './ui/styles.css';

applySettings();
// The claude.ai frame already pads the page by the phone's safe areas.
if (embedded) document.documentElement.classList.add('embedded');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary full>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
