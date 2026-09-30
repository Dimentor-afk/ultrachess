import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { applySettings } from './ui/settings';
import './ui/styles.css';

applySettings();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary full>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
