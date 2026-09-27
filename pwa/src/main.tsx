import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import './studio/fonts.css';
import '@astryxdesign/core/reset.css';
import './studio/starlog.css';
import App from './App.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Minimal service worker: cache-first for same-origin app assets so the
// installed PWA opens offline. API calls go to the Supabase host and are
// never cached.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* offline support is best-effort */
    });
  });
}
