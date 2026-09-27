import { useEffect, useState } from 'react';

// Custom theme overrides: a map of CSS variable names to values.
// Installed via ?theme=<base64url-json> URL param or stored in localStorage.
// Lets agents generate custom themes and apply them without a rebuild.
//
// Format: {"--color-coral": "#FF6B6B", "--color-background-body": "#1a1a1a"}
// Only --color-* variables are accepted; everything else is ignored.

const THEME_KEY = 'starlog.customTheme';

export interface CustomTheme {
  name: string;
  tokens: Record<string, string>;
}

function decodeThemeParam(param: string): CustomTheme | null {
  try {
    // base64url -> base64
    const b64 = param.replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(b64);
    const data = JSON.parse(json);
    if (typeof data !== 'object' || !data) return null;
    const tokens: Record<string, string> = {};
    const source = data.tokens ?? data;
    for (const [k, v] of Object.entries(source)) {
      if (typeof k === 'string' && k.startsWith('--color-') && typeof v === 'string') {
        // Basic sanity: must look like a color
        if (/^(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)|hsla?\([^)]+\)|[a-z]+)$/.test(v.trim())) {
          tokens[k] = v.trim();
        }
      }
    }
    if (Object.keys(tokens).length === 0) return null;
    return {
      name: typeof data.name === 'string' ? data.name : 'Custom',
      tokens,
    };
  } catch {
    return null;
  }
}

function applyTokens(tokens: Record<string, string>) {
  const root = document.documentElement;
  for (const [k, v] of Object.entries(tokens)) {
    root.style.setProperty(k, v);
  }
}

function clearTokens(tokens: Record<string, string>) {
  const root = document.documentElement;
  for (const k of Object.keys(tokens)) {
    root.style.removeProperty(k);
  }
}

export function useCustomTheme() {
  const [customTheme, setCustomTheme] = useState<CustomTheme | null>(() => {
    // 1. URL param wins (and gets persisted)
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
          // Strip the param so it doesn't linger in the URL
          params.delete('theme');
          const url = window.location.pathname + (params.toString() ? `?${params}` : '') + window.location.hash;
          window.history.replaceState(null, '', url);
          return theme;
        }
      }
    } catch {
      /* ignore */
    }
    // 2. Stored theme
    try {
      const stored = window.localStorage.getItem(THEME_KEY);
      if (stored) {
        const theme = JSON.parse(stored) as CustomTheme;
        if (theme?.tokens && typeof theme.tokens === 'object') return theme;
      }
    } catch {
      /* ignore */
    }
    return null;
  });

  // Apply/remove CSS variable overrides
  useEffect(() => {
    if (!customTheme) return;
    applyTokens(customTheme.tokens);
    return () => clearTokens(customTheme.tokens);
  }, [customTheme]);

  const removeCustomTheme = () => {
    try {
      window.localStorage.removeItem(THEME_KEY);
    } catch {
      /* ignore */
    }
    setCustomTheme(null);
  };

  return { customTheme, removeCustomTheme };
}

// Encode a theme for sharing via URL: returns the ?theme= param value.
export function encodeThemeParam(theme: CustomTheme): string {
  const json = JSON.stringify(theme);
  return btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
