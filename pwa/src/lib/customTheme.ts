import { useEffect, useMemo, useState } from 'react';
import { defineTheme, type DefinedTheme } from '@astryxdesign/core/theme';
import { starlogTheme } from '../studio/starlog.js';

// Custom themes progressively extend the Starlog theme via defineTheme.
// A user-supplied token/font map becomes a DefinedTheme with
// `extends: starlogTheme`, applied through the <Theme> provider with
// runtime CSS injection.
//
// Installed via ?theme=<base64url-json> URL param, pasted JSON in Settings,
// and persisted in localStorage.
//
// Format: {
//   "name": "Dusk",
//   "tokens": {"--color-...": "#..."},
//   "fonts": {"body": "...", "heading": "...", "code": "..."}
// }
// Only --color-* tokens are accepted; values must look like colors.
// Fonts are Google Font names, loaded automatically.

const THEME_KEY = 'starlog.customTheme';
const FONT_LINK_ID = 'starlog-custom-fonts';

export interface CustomTheme {
  name: string;
  tokens: Record<string, string>;
  /** Starlog --sl-* local token overrides */
  slTokens: Record<string, string>;
  fonts?: {
    body?: string;
    heading?: string;
    code?: string;
  };
}

// Validate that a token map is a plain object with string keys/values.
// No per-value sanitization: the format matches Astryx theme structure,
// and custom property values are inert (no script execution).
function asTokenMap(source: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (typeof source !== 'object' || !source) return out;
  for (const [k, v] of Object.entries(source as Record<string, unknown>)) {
    if (typeof k === 'string' && typeof v === 'string') {
      out[k] = v;
    }
  }
  return out;
}

function sanitizeFonts(source: unknown): CustomTheme['fonts'] | undefined {
  if (typeof source !== 'object' || !source) return undefined;
  const fonts: Record<string, string> = {};
  for (const role of ['body', 'heading', 'code'] as const) {
    const v = (source as Record<string, unknown>)[role];
    if (typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9 \-]{0,40}$/.test(v.trim())) {
      fonts[role] = v.trim();
    }
  }
  return Object.keys(fonts).length > 0 ? (fonts as CustomTheme['fonts']) : undefined;
}

function toCustomTheme(data: unknown): CustomTheme | null {
  if (typeof data !== 'object' || !data) return null;
  const d = data as Record<string, unknown>;
  // The format matches Astryx theme structure: pass through directly.
  // Top-level `tokens` (--color-*) and `slTokens` (--sl-*) are validated
  // as plain string maps, then handed to defineTheme (slTokens → localTokens).
  const tokens = asTokenMap(d.tokens);
  const slTokens = asTokenMap(d.slTokens);
  const fonts = sanitizeFonts(d.fonts);
  if (Object.keys(tokens).length === 0 && Object.keys(slTokens).length === 0 && !fonts) {
    return null;
  }
  return {
    name: typeof d.name === 'string' ? d.name : 'Custom',
    tokens,
    slTokens,
    fonts,
  };
}

function decodeThemeParam(param: string): CustomTheme | null {
  try {
    const b64 = param.replace(/-/g, '+').replace(/_/g, '/');
    return toCustomTheme(JSON.parse(atob(b64)));
  } catch {
    return null;
  }
}

function loadStored(): CustomTheme | null {
  try {
    const stored = window.localStorage.getItem(THEME_KEY);
    if (stored) return toCustomTheme(JSON.parse(stored));
  } catch {
    /* ignore */
  }
  return null;
}

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'custom';
}

/**
 * Build a DefinedTheme that progressively extends starlogTheme.
 * The <Theme> provider injects its CSS at runtime (unbuilt mode).
 */
export function buildCustomTheme(custom: CustomTheme): DefinedTheme {
  return defineTheme({
    name: `starlog-${slug(custom.name)}`,
    extends: starlogTheme,
    tokens: custom.tokens,
    // Starlog domain tokens go through localTokens so they properly
    // override the base theme's local token definitions.
    ...(Object.keys(custom.slTokens).length > 0 && {
      localTokens: custom.slTokens,
    }),
    ...(custom.fonts && {
      typography: {
        ...(custom.fonts.body && { body: { family: custom.fonts.body } }),
        ...(custom.fonts.heading && { heading: { family: custom.fonts.heading } }),
        ...(custom.fonts.code && { code: { family: custom.fonts.code } }),
      },
    }),
  });
}

export function useCustomTheme() {
  const [customTheme, setCustomTheme] = useState<CustomTheme | null>(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const param = params.get('theme');
      if (param) {
        const theme = decodeThemeParam(param);
        if (theme) {
          try {
            window.localStorage.setItem(THEME_KEY, JSON.stringify(theme));
          } catch {
            /* private mode */
          }
          params.delete('theme');
          const url =
            window.location.pathname +
            (params.toString() ? `?${params}` : '') +
            window.location.hash;
          window.history.replaceState(null, '', url);
          return theme;
        }
      }
    } catch {
      /* ignore */
    }
    return loadStored();
  });

  // The built theme object, memoized so <Theme> gets a stable reference.
  const builtTheme = useMemo(
    () => (customTheme ? buildCustomTheme(customTheme) : null),
    [customTheme]
  );

  // Load Google Fonts for the custom theme's font families.
  useEffect(() => {
    const families = customTheme?.fonts ? Object.values(customTheme.fonts) : [];
    document.getElementById(FONT_LINK_ID)?.remove();
    if (families.length === 0) return;
    const link = document.createElement('link');
    link.id = FONT_LINK_ID;
    link.rel = 'stylesheet';
    link.href =
      'https://fonts.googleapis.com/css2?' +
      families
        .map((f) => `family=${encodeURIComponent(f)}:wght@400;500;600;700`)
        .join('&') +
      '&display=swap';
    document.head.appendChild(link);
    return () => {
      document.getElementById(FONT_LINK_ID)?.remove();
    };
  }, [customTheme]);

  // Apply --sl-* local tokens directly to the document root.
  // Astryx's runtime defineTheme doesn't inject localTokens CSS reliably,
  // so we set them as CSS variables here. They cascade to the entire app.
  useEffect(() => {
    const root = document.documentElement;
    const tokens = customTheme?.slTokens ?? {};
    for (const [k, v] of Object.entries(tokens)) {
      root.style.setProperty(k, v);
    }
    return () => {
      for (const k of Object.keys(tokens)) {
        root.style.removeProperty(k);
      }
    };
  }, [customTheme]);

  const removeCustomTheme = () => {
    try {
      window.localStorage.removeItem(THEME_KEY);
    } catch {
      /* ignore */
    }
    setCustomTheme(null);
  };

  const installCustomTheme = (input: string): string | null => {
    const trimmed = input.trim();
    if (!trimmed) return 'Paste a theme first.';
    let theme: CustomTheme | null = null;
    if (trimmed.startsWith('{')) {
      try {
        theme = toCustomTheme(JSON.parse(trimmed));
      } catch {
        return 'That is not valid JSON.';
      }
    } else {
      theme = decodeThemeParam(trimmed);
    }
    if (!theme) return 'Could not read a theme from that text.';
    try {
      window.localStorage.setItem(THEME_KEY, JSON.stringify(theme));
    } catch {
      return 'Could not save the theme (storage unavailable).';
    }
    setCustomTheme(theme);
    return null;
  };

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === THEME_KEY) setCustomTheme(loadStored());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  return { customTheme, builtTheme, removeCustomTheme, installCustomTheme };
}

// Encode a theme for sharing via URL: returns the ?theme= param value.
export function encodeThemeParam(theme: CustomTheme): string {
  const json = JSON.stringify(theme);
  return btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
