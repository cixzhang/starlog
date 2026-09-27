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
  // Starlog domain tokens: the lunar palette. Theme-local, so custom
  // themes can override them via defineTheme({ extends: starlogTheme }).
  localTokens: {
    '--sl-paper': ['#f5f3ec', '#141a17'],
    '--sl-paper-deep': ['#ece9dd', '#1c2420'],
    '--sl-ink': ['#17231f', '#ece9dd'],
    '--sl-ink-soft': ['#3d4a44', '#c2cabd'],
    '--sl-ink-faint': ['#8a938c', '#7d877e'],
    '--sl-line': ['#ddd8c8', '#2b342f'],
    '--sl-line-strong': ['#c4bda6', '#3d473f'],
    '--sl-coral': ['#f16e56', '#f0856d'],
    '--sl-coral-deep': ['#c24e37', '#f0856d'],
    '--sl-gold': ['#d9a83e', '#d9a83e'],
    '--sl-gold-soft': ['#f2c85b', '#f2c85b'],
    '--sl-band': ['#ece9dd', '#1c2420'],
    '--sl-surface': ['#ece9dd', '#1c2420'],
    '--sl-mark-tile': ['#ece9dd', '#193346'],
  },
  // Astryx surface colors: map Starlog's palette onto Astryx's semantic
  // tokens so the app background, cards, borders, and text use the
  // lunar palette instead of neutral defaults.
  tokens: {
    '--color-background-body': ['#f5f3ec', '#141a17'],
    '--color-background-card': ['#ece9dd', '#1c2420'],
    '--color-background-surface': ['#ece9dd', '#1c2420'],
    '--color-border': ['#ddd8c8', '#2b342f'],
    '--color-text-primary': ['#17231f', '#ece9dd'],
    '--color-text-secondary': ['#3d4a44', '#c2cabd'],
  },
});
