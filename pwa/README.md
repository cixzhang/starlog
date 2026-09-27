# Starlog PWA

The Starlog journal client: a static, installable web app. It talks
directly to the user's own Supabase project via PostgREST — there is no
Starlog server. **Read-only by design**: the app holds only the anon key,
which has SELECT grants only. All writes are the agent's job.

## Develop

```bash
npm install
npm run dev        # Vite dev server
npm run theme      # rebuild the Astryx theme after editing src/studio/starlog-theme.ts
npm run build      # typecheck + production build -> dist/
```

## Deploy

Static output in `dist/`. On Vercel: import the repo, set **Root Directory**
to `pwa/`, framework preset **Vite**. No environment variables needed —
the Supabase URL + anon key are entered in the app's setup screen and stay
in the browser's localStorage.

## First run

Opening the deployed app shows a setup screen asking for the Supabase
project URL and anon key (dashboard: Project Settings → API). The app
validates them by reading the `capabilities` row, then remembers them on
that device only. A disconnect button in the header forgets them.

## Notes

- Every PostgREST request sends **both** the `apikey` header and
  `Authorization: Bearer`. The `apikey` header is required — Bearer alone
  401s on Supabase projects ("No API key found in request").
- Entry bodies render through a hand-rolled, dependency-free renderer for
  the `starlog-md-1` subset (`src/lib/markdown.tsx`). It builds React
  nodes, so text is escaped by construction; raw HTML never renders.
- Decorations (SVG) are sanitized before render (`src/lib/svg.ts`):
  scripts, event handlers, `foreignObject`, and external refs are stripped.
- The reminder compass (`src/views/Reminders.tsx`) is deliberately
  abstract: shape = urgency, size = proximity. No streaks, no gamification.
- Fonts (Manrope, IBM Plex Mono) are self-hosted and inlined as data URIs.
- Offline: a tiny service worker caches the app shell and same-origin
  assets; the Supabase API is never cached.
