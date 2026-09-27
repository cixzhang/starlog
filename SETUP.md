# Starlog setup

Three steps, split between the agent and you.

## 1. Code → GitHub (agent)

The agent commits the PWA source under `pwa/` and pushes it to
`cixzhang/starlog`. Nothing for you to do here.

## 2. GitHub → Vercel (you)

1. In Vercel, **Add New → Project**, and import `cixzhang/starlog`.
2. Set **Root Directory** to `pwa/`.
3. Framework preset: **Vite**. Leave the build command (`npm run build`)
   and output directory (`dist`) as detected.
4. No environment variables are needed. Deploy.

## 3. App → Supabase (you, in the deployed app)

1. Open the deployed app. The first screen asks for two things:
   - **Supabase project URL** — e.g. `https://xyz.supabase.co`
   - **Anon key**
   
   Both are in your Supabase dashboard under **Project Settings → API**.
2. The app checks the connection by reading the backend's capabilities
   row, then remembers the URL + key **on that device only**
   (browser localStorage). They are never sent anywhere except your
   Supabase project.

The app is read-only: it can read your journal, prompts, reminders, and
decorations, but it cannot write. New entries, prompts, and reminders are
added by your assistant, and they show up here on the next visit.

To point the app at a different project later, use the ⎋ button in the
header to disconnect and start over.
