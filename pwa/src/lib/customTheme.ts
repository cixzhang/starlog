import { useEffect, useMemo, useState } from 'react';
import { defineTheme, type DefinedTheme } from '@astryxdesign/core/theme';
import { starlogTheme } from '../studio/starlog.js';

// Custom themes via the Astryx Theme provider: a user-supplied token map
// becomes a real DefinedTheme (extends starlogTheme) passed to <Theme>.
// Installed via ?theme=<base64url-json> URL param, pasted JSON in Settings,
// and persisted in localStorage.
//
// Format: {"name": "Dusk", "tokens": {"--color-...": "#..."}}
// Only --color-* tokens are accepted; values must look like colors.

const THEME_KEY = 'starlog.customTheme';

export interface CustomTheme {
  name: string;
  tokens: Record<string, string>;
  fonts?: {
    body?: string;
    heading?: string;
    code?: string;
  };
}

function sanitizeTokens(source: unknown): Record<string, string> | null {
  if (typeof source !== 'object' || !source) return null;
  const tokens: Record<string, string> = {};
  for (const [k, v] of Object.entries(source as Record<string, unknown>)) {
    if (typeof k === 'string' && k.startsWith('--color-') && typeof v === 'string') {
      if (/^(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)|hsla?\([^)]+\)|[a-z]+)$/.test(v.trim())) {
        tokens[k] = v.trim();
      }
    }
  }
  return Object.keys(tokens).length > 0 ? tokens : null;
}

function sanitizeFonts(source: unknown): CustomTheme['fonts'] | undefined {
  if (typeof source !== 'object' || !source) return undefined;
  const fonts: Record<string, string> = {};
  for (const role of ['body', 'heading', 'code'] as const) {
    const v = (source as Record<string, unknown>)[role];
    // Google Font names: letters, numbers, spaces, hyphens
    if (typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9 \-]{0,40}$/.test(v.trim())) {
      fonts[role] = v.trim();
    }
  }
  return Object.keys(fonts).length > 0 ? (fonts as CustomTheme['fonts']) : undefined;
}

function decodeThemeParam(param: string): CustomTheme | null {
  try {
    const b64 = param.replace(/-/g, '+').replace(/_/g, '/');
    const data = JSON.parse(atob(b64));
    if (typeof data !== 'object' || !data) return null;
    const tokens = sanitizeTokens(data.tokens ?? data);
    const fonts = sanitizeFonts(data.fonts);
    if (!tokens && !fonts) return null;
    return {
      name: typeof data.name === 'string' ? data.name : 'Custom',
      tokens: tokens ?? {},
      fonts,
    };
  } catch {
    return null;
  }
}

function loadStored(): CustomTheme | null {
  try {
    const stored = window.localStorage.getItem(THEME_KEY);
    if (stored) {
      const data = JSON.parse(stored);
      const tokens = sanitizeTokens(data?.tokens);
      if (tokens) {
        return {
          name: typeof data.name === 'string' ? data.name : 'Custom',
          tokens,
          fonts: sanitizeFonts(data?.fonts),
        };
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function useCustomTheme(active: boolean) {
  const [customTheme, setCustomTheme] = useState<CustomTheme | null>(() => {
    // URL param wins (and gets persisted + stripped from the URL)
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

  // Build a real Astryx theme extending starlogTheme when active.
  // defineTheme generates + injects the CSS at runtime (unbuilt mode).
  const appliedTheme: DefinedTheme = useMemo(() => {
    if (!active || !customTheme) return starlogTheme;
    return defineTheme({
      name: `starlog-custom-${customTheme.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      extends: starlogTheme,
      tokens: customTheme.tokens,
      ...(customTheme.fonts && {
        typography: {
          ...(customTheme.fonts.body && {
            body: { family: customTheme.fonts.body },
          }),
          ...(customTheme.fonts.heading && {
            heading: { family: customTheme.fonts.heading },
          }),
          ...(customTheme.fonts.code && {
            code: { family: customTheme.fonts.code },
          }),
        },
      }),
    });
  }, [active, customTheme]);

  // Load Google Fonts for the custom theme's font families.
  useEffect(() => {
    if (!active || !customTheme?.fonts) return;
    const families = Object.values(customTheme.fonts);
    if (families.length === 0) return;
    const id = 'starlog-custom-fonts';
    let link = document.getElementById(id) as HTMLLinkElement | null;
    const href =
      'https://fonts.googleapis.com/css2?' +
      families
        .map((f) => `family=${encodeURIComponent(f)}:wght@400;500;600;700`)
        .join('&') +
      '&display=swap';
    if (!link) {
      link = document.createElement('link');
      link.id = id;
      link.rel = 'stylesheet';
      document.head.appendChild(link);
    }
    link.href = href;
    return () => {
      document.getElementById(id)?.remove();
    };
  }, [active, customTheme]);

  const removeCustomTheme = () => {
    try {
      window.localStorage.removeItem(THEME_KEY);
    } catch {
      /* ignore */
    }
    setCustomTheme(null);
  };

  // Install from pasted JSON or a ?theme= code. Returns error or null.
  const installCustomTheme = (input: string): string | null => {
    const trimmed = input.trim();
    if (!trimmed) return 'Paste a theme first.';
    let theme: CustomTheme | null = null;
    if (trimmed.startsWith('{')) {
      try {
        const data = JSON.parse(trimmed);
        const tokens = sanitizeTokens(data.tokens ?? data);
        const fonts = sanitizeFonts(data.fonts);
        if (!tokens && !fonts) return 'No usable --color-* tokens or fonts found.';
        theme = {
          name: typeof data.name === 'string' ? data.name : 'Custom',
          tokens: tokens ?? {},
          fonts,
        };
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

  // Re-apply if the stored theme changes in another tab.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === THEME_KEY) setCustomTheme(loadStored());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  return { customTheme, appliedTheme, removeCustomTheme, installCustomTheme };
}

// Encode a theme for sharing via URL: returns the ?theme= param value.
export function encodeThemeParam(theme: CustomTheme): string {
  const json = JSON.stringify(theme);
  return btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
