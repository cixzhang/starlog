# Starlog Theming

Generate and install custom color themes for the Starlog PWA without a rebuild.

## How it works

The PWA reads a `?theme=` URL parameter containing a base64url-encoded JSON
theme. On first load it applies the theme's CSS variable overrides, persists
to localStorage, and strips the param from the URL. The user can remove the
theme from Settings (Theme section).

Only `--color-*` variables are accepted — everything else is ignored. Values
must look like colors (hex, rgb()/hsl(), or named colors).

## Theme format

```json
{
  "name": "Dusk",
  "tokens": {
    "--color-background-body": "#1e1b2e",
    "--color-background-surface": "#2a2540",
    "--color-text-primary": "#f0e6d2",
    "--color-text-secondary": "#a89bb8",
    "--color-coral": "#ff8a7a",
    "--color-border": "#3d3654"
  },
  "fonts": {
    "body": "Inter",
    "heading": "Playfair Display",
    "code": "JetBrains Mono"
  }
}
```

The optional `fonts` block names Google Fonts per Astryx typography role.
The PWA loads them from Google Fonts automatically and applies them through
the theme provider. Any Google Font name works (letters, numbers, spaces,
hyphens). Omit a role to keep the default (Manrope / IBM Plex Mono).

Encode for sharing:

```python
import json, base64
b64 = base64.urlsafe_b64encode(json.dumps(theme).encode()).decode().rstrip("=")
url = f"https://starlog-journal.vercel.app/?theme={b64}"
```

## Available tokens

### Astryx semantic tokens (146 total)

The most useful for theming:

**Surfaces:**
`--color-background-body`, `--color-background-surface`,
`--color-background-card`, `--color-background-popover`,
`--color-background-muted`

**Text:**
`--color-text-primary`, `--color-text-secondary`, `--color-text-disabled`,
`--color-text-accent`

**Icons:**
`--color-icon-primary`, `--color-icon-secondary`, `--color-icon-accent`,
`--color-icon-disabled`

**Borders:**
`--color-border`, `--color-border-emphasized`

**Accent & status:**
`--color-accent`, `--color-accent-muted`, `--color-on-accent`,
`--color-success`, `--color-success-muted`, `--color-warning`,
`--color-warning-muted`, `--color-error`, `--color-error-muted`

**Colored variants** (each has background/text/icon/border):
`blue`, `cyan`, `green`, `orange`, `pink`, `purple`, `red`, `teal`, `yellow`, `gray`
e.g. `--color-text-red`, `--color-background-blue`, `--color-icon-green`

**Data viz** (`--color-data-*`) and **syntax** (`--color-syntax-*`) tokens
exist but are rarely needed for app theming.

### Retired: Starlog domain tokens (`--sl-*`)

The old `--sl-*` lunar palette (`--sl-ink`, `--sl-paper`, `--sl-coral`,
etc.) was removed when the app moved to Astryx semantic tokens. Do not
reference `--sl-*` in new themes, decorations, or docs — they resolve to
nothing. Use the `--color-*` tokens above instead.

## Guidelines

- A minimal theme needs 5–7 tokens: body background, surface, primary
  text, secondary text, border, and one accent.
- Test in both light and dark OS modes — overrides apply on top of
  whichever mode is active, so pick values that work in the target mode
  or instruct the user to switch modes.
- Keep text contrast readable: primary text on body background should be
  at least 4.5:1.
- Don't override `--color-data-*` or `--color-syntax-*` unless the theme
  is specifically for charts or code.
- Name themes evocatively (Dusk, Paper, Ocean) — the name shows in Settings.

## Applying a theme (agent workflow)

1. Design the token map following the guidelines above.
2. Encode with the Python snippet and produce the share URL.
3. Send the URL to the user — opening it installs the theme.
4. The theme persists until removed in Settings → Theme.
