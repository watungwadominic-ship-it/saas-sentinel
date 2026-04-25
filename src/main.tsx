import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App, { ErrorBoundary } from './App';
import './index.css';

if (typeof window !== 'undefined' && !window.process) {
  // @ts-ignore
  window.process = { env: {} };
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
