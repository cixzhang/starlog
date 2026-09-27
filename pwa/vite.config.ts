import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { astryxStylex } from '@astryxdesign/build/vite';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

// Short commit hash, exposed for any future version indicator.
let commitHash = 'dev';
try {
  commitHash = execSync('git rev-parse --short HEAD').toString().trim();
} catch {
  // ignore
}

export default defineConfig({
  plugins: [...astryxStylex(), react()],
  define: {
    __COMMIT_HASH__: JSON.stringify(commitHash),
  },
  // Multi-page: main SPA + standalone Setup and Install pages.
  // Setup/Install are server-rendered React (not part of the SPA bundle).
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        setup: resolve(__dirname, 'setup.html'),
        install: resolve(__dirname, 'install.html'),
      },
    },
  },
  // Fonts are served as separate files from /fonts/ (see public/fonts/),
  // preloaded in index.html. No inlining.
});
