<!-- Copilot instructions for the Zimbeat repo -->
# Zimbeat — Copilot Instructions

This file contains concise, repository-specific guidance to help AI coding agents be immediately productive.

- Big picture:
  - Frontend: a Vite + React SPA (entry: [App.tsx](App.tsx)) using HashRouter and lazy-loaded pages.
  - Wallet integration: app uses TON via `@tonconnect/ui-react`; provider is wired in [index.tsx](index.tsx).
  - Backend/API: Supabase Edge Functions under `supabase/functions/` act as the API gateway. `services/config.ts` points `API_BASE_URL` to those functions.

- Key workflows / commands (use npm):
  - Start dev server: `npm run dev` (Vite on port 3000)
  - Build: `npm run build` and preview: `npm run preview`
  - Tests: `npm run test` (Vitest) — see `vite.config.ts` for test config

- Environment & secrets:
  - Vite expects `VITE_` prefixed env vars (see `vite.config.ts` and `services/config.ts`).
  - Do NOT add sensitive server keys to `services/config.ts`. Backend secrets belong in Supabase Edge Secrets used by functions in `supabase/functions/_shared/`.
  - For wallet manifest override use `VITE_MANIFEST_URL` or edit `tonconnect-manifest.json` in root/public.

- Project-specific patterns and conventions:
  - Centralized `services/` for API and domain logic (e.g. `tonService.ts`, `dataService.ts`, `analyticsService.ts`). Look here first for shared behavior.
  - Feature flags and fallbacks live in `services/config.ts` (e.g. `ENABLE_ANALYTICS`, `DEBUG_LOGGING`). Prefer reading flags from `CONFIG` instead of hardcoding.
  - Lazy-loaded pages (in `App.tsx`) pre-import related services inside the `then` block to warm caches and split bundles.
  - Use `useTelegram` hook for Telegram/TG WebApp back-button behavior (see `App.tsx`).

- Integration points to pay attention to:
  - TON: `@tonconnect/ui-react` + `services/tonService.ts` for blockchain calls.
  - Supabase Edge Functions: every server-side route lives in `supabase/functions/*`.
  - Analytics: `services/analyticsService.ts` is used across pages to track events.

- Code style / small rules to follow when changing code:
  - Preserve lazy-loading patterns; prefer adding preloads where the app already preloads services.
  - When adding config, prefer `services/config.ts` and use `getEnv()` helpers instead of direct `process.env` access.
  - Tests use `vitest` with a `jsdom` environment — mirror that when authoring components/tests.

- Quick navigation examples (files that often matter):
  - App shell & routes: [App.tsx](App.tsx)
  - Root mount + TON provider: [index.tsx](index.tsx)
  - Runtime config: [services/config.ts](services/config.ts)
  - TON helpers: [services/tonService.ts](services/tonService.ts)
  - Supabase backends: `supabase/functions/` (many endpoints)

If anything here is unclear or you want more detail in a specific area (tests, CI, Supabase function patterns), tell me which part to expand.
