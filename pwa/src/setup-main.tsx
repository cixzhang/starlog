// Standalone setup page entry. Rendered as a separate HTML page via Vite
// multi-page build. Saves config to localStorage and redirects to the app.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Theme } from '@astryxdesign/core/theme';
import { starlogTheme } from './studio/starlog.js';
import Setup from './views/Setup';
import { consumeLinkConfig } from './lib/supabase';
import './studio/starlog.css';

function SetupPage() {
  // Parse setup link from URL if present
  const link = consumeLinkConfig();
  const initialUrl = link.url || '';

  function handleDone() {
    // Config is already saved by the Setup component via saveConfig.
    // Redirect to the main app.
    window.location.href = '/';
  }

  return (
    <StrictMode>
      <Theme theme={starlogTheme} mode="light">
        <Setup onDone={handleDone} initialUrl={initialUrl} />
      </Theme>
    </StrictMode>
  );
}

const rootEl = document.getElementById('root');
if (rootEl) {
  createRoot(rootEl).render(<SetupPage />);
}
