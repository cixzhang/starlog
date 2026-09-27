import { defineTheme } from '@astryxdesign/core/theme';
import { neutralTheme } from '@astryxdesign/theme-neutral';

/**
 * Starlog theme: neutral extended with the journal's typography.
 *
 * Two type roles:
 *   body/heading -> Manrope (quiet, warm sans for UI + prose)
 *   code         -> IBM Plex Mono (dates, keys, code blocks)
 *
 * The font FILES are shipped by the app itself (src/studio/fonts.css
 * @font-face, bundled + inlined at build); the theme only names them.
 *
 * Domain colors (--sl-*) live in src/index.css, not here: they are
 * Starlog's lunar palette (ink, paper, coral, gold), not Astryx tokens.
 *
 * Built with the Astryx CLI — do not edit the generated starlog.css /
 * starlog.js by hand. Re-run after every edit:
 *   npm run theme
 */
export const starlogTheme = defineTheme({
  name: 'starlog',
  extends: neutralTheme,
  typography: {
    body: {
      family: 'Manrope',
      fallbacks: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    },
    heading: {
      family: 'Manrope',
      fallbacks: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    },
    code: {
      family: 'IBM Plex Mono',
      fallbacks: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    },
  },
});
