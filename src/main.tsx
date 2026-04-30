import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App, { ErrorBoundary } from './App';
import './index.css';

if (typeof window !== 'undefined') {
  // @ts-ignore
  window.process = window.process || {};
  // @ts-ignore
  window.process.env = window.process.env || {};
  // @ts-ignore
  window.global = window.global || window;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
