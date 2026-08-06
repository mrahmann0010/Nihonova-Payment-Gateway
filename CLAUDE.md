# CLAUDE.md

Guidance for working in this repo. For product context and deployment, see [README.md](README.md).

## What this is

A payment-verification gateway for Nihonova Academy. An Android SMS forwarder POSTs mobile-money
payment texts (bKash / Nagad / Rocket) to a webhook; the API parses each into a structured
transaction and stores it in MongoDB, deduplicated by `trxId`. A separate dashboard reads the data
over a credentialed JSON API.

## Layout — two-app monorepo (no root package.json)

- `apps/server` — Express 5 + Mongoose 9 JSON API. Entry `src/server.js`; app wiring in `src/app.js`.
- `apps/web` — SvelteKit 2 / **Svelte 5 (runes)** dashboard SPA, deployed on Vercel (`adapter-vercel`, Node 20).

Each app has its own `package.json`; run commands from inside the app directory.

## Commands

Server (`cd apps/server`):
- `npm run dev` — nodemon
- `npm start` — node
- `npm run seed-admin` — create the initial admin user from `DEFAULT_ADMIN_USER` / `DEFAULT_ADMIN_PASS`
- No test runner is configured (`npm test` is a stub). Verify server changes with `node --check <file>`.

Web (`cd apps/web`):
- `npm run dev` / `npm run build` / `npm run preview`
- `npm run check` — `svelte-kit sync && svelte-check`. **Run this after any web change**; it's the
  type/lint gate and should report 0 errors, 0 warnings.

## Auth

- **Dashboard** session is an httpOnly **JWT cookie** set by `/admin/auth/login` (see
  `apps/server/src/services/jwt.js`, `routes/auth.js`). JS never sees the token. `/admin/api/*` is
  gated by `requireAdmin`, which reads the cookie. Cross-origin calls need credentialed CORS, so the
  exact request origin is echoed (never `*`) — configured via `CORS_ORIGIN`.
  - Note: the header comment atop `routes/admin.js` still describes an older `ADMIN_TOKEN` scheme;
    the live gate is the JWT cookie. Trust the code.
- **Webhook** (`/webhooks/sms`) is gated by `middleware/verifySignature.js` using `WEBHOOK_SECRET`.
- On the web side, session state lives in `apps/web/src/lib/stores/auth.svelte.ts` (session only —
  no data). A dropped session (any query 401) triggers a global logout.

## Data conventions

- Three payment collections, one per platform: `models/Bkash.js`, `Nagad.js`, `Rocket.js`, built by
  `models/createPaymentModel.js`. `admin.js` fans out across all three via the `MODELS` map and
  merges results. Sender identity is the phone string, treated as shared across platforms.
- **Timezone:** dates are stored in UTC. All "per day"/period grouping shifts to Bangladesh time
  (`BD_TZ = '+06:00'`, `BD_OFFSET_MS`). Use the `bdNow()` / date helpers in `admin.js` rather than
  raw `new Date()` when bucketing by calendar day, or buckets will straddle the wrong day.
- Parsers live in `apps/server/src/services/*Parser.js` (one per platform) behind `parsePayment.js`.

## Web data layer — TanStack Query

All dashboard data flows through `@tanstack/svelte-query` v6 (Svelte 5 runes API), **not** manual
fetches. Read `apps/web/src/lib/query.ts` first.

- `createQueryClient()` sets the defaults: background poll `REFRESH_MS` (10 min), refetch on window
  focus, `staleTime` 5s, and a global 401 → `auth.logout()` handler. Focus-refetch is the practical
  "instant refresh" path; the timer is a light fallback.
- Query keys are centralized in `keys` (`query.ts`) — reuse them so invalidation stays consistent.
- v6 API: `createQuery(() => ({ ... }))` takes an **accessor** (a function returning options) and
  returns a runes-reactive result — read `.data`, `.isPending`, `.isFetching`, `.refetch()` directly
  (no `$store` subscription). Gate every query with `enabled: auth.authed`.
- The root `+layout.svelte` owns the single `QueryClientProvider`; its own alert queries pass the
  client explicitly as the second accessor arg (they live outside the provider's child context).
- Transactions list uses `createInfiniteQuery` and de-dupes flattened pages by `platform+trxId`.

## Typed API client

`apps/web/src/lib/api.ts` is the single typed client for the server. When you add or change a
server response shape, update its interface here **and** consuming components in the same change.

## Conventions

- Match the existing comment style: short "why" comments above non-obvious blocks, not narration.
- Commit/push only when asked. History commits directly to `main`.
