import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { astryxStylex } from '@astryxdesign/build/vite';
import { execSync } from 'node:child_process';

// Short commit hash, exposed for any future version indicator.
let commitHash = 'dev';
try {
  commitHash = execSync('git rev-parse --short HEAD').toString().trim();
} catch {
  // ignore
}

export default defineConfig({
  plugins: [
    ...astryxStylex(),
    react(),
    // Emit version.json so the running app can detect a newer deploy:
    // it fetches /version.json (cache-busted) and compares `commit`
    // against its embedded __COMMIT_HASH__.
    {
      name: 'starlog-version-json',
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'version.json',
          source: JSON.stringify({ commit: commitHash }),
        });
      },
    },
  ],
  define: {
    __COMMIT_HASH__: JSON.stringify(commitHash),
  },
  // Fonts are served as separate files from /fonts/ (see public/fonts/),
  // preloaded in index.html. No inlining.
});
