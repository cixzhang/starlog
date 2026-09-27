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
  plugins: [...astryxStylex(), react()],
  define: {
    __COMMIT_HASH__: JSON.stringify(commitHash),
  },
  // Fonts are served as separate files from /fonts/ (see public/fonts/),
  // preloaded in index.html. No inlining.
});
