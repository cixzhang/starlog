// Standalone install guide page entry. Rendered as a separate HTML page via
// Vite multi-page build.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Theme } from '@astryxdesign/core/theme';
import { starlogTheme } from './studio/starlog.js';
import InstallApp from './views/InstallApp';
import './studio/starlog.css';

function InstallPage() {
  // The setup link is the current URL (with params) for the copy button
  const setupLink = window.location.href;

  function handleContinueInBrowser() {
    try {
      localStorage.setItem('starlog.continueInBrowser', '1');
    } catch { /* ignore */ }
    window.location.href = '/setup.html' + window.location.search;
  }

  return (
    <StrictMode>
      <Theme theme={starlogTheme} mode="light">
        <InstallApp setupLink={setupLink} onContinueInBrowser={handleContinueInBrowser} />
      </Theme>
    </StrictMode>
  );
}

const rootEl = document.getElementById('root');
if (rootEl) {
  createRoot(rootEl).render(<InstallPage />);
}
