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

Database (repo root) — **start this first; the server exits without a database**:
- `docker compose up -d` — local MongoDB 8 on `127.0.0.1:27017`, data in a named volume
- `docker compose down` — stop it, keeping the data. `-v` also deletes the data.

Server (`cd apps/server`):
- `npm run db:copy` — replace the local database with a fresh copy of Atlas (read-only on Atlas)
- `npm run dev` — nodemon
- `npm start` — node
- `npm run seed-admin` — create the initial admin user from `DEFAULT_ADMIN_USER` / `DEFAULT_ADMIN_PASS`
- `npm run sync-indexes` — build schema indexes and drop stale ones. Mongoose only ever *adds*
  indexes at startup, so run this after changing any `schema.index` / `index:` option.
- No test runner is configured (`npm test` is a stub). Verify server changes with `node --check <file>`.

Web (`cd apps/web`):
- `npm run dev` / `npm run build` / `npm run preview`
- `npm run check` — `svelte-kit sync && svelte-check`. **Run this after any web change**; it's the
  type/lint gate and should report 0 errors, 0 warnings.

## Environments

Development runs against a **local Docker MongoDB holding a copy of the real data**, never against
Atlas. The live cluster carries real payment records, and `sync-indexes` *drops* indexes it doesn't
recognise — that is not a command to point at production casually.

- `apps/server/.env` — the local setup, and the only file `dotenv` loads. Points at
  `mongodb://127.0.0.1:27017/primary-data`. Every secret in it is a throwaway.
- `apps/server/.env.atlas` — the real Atlas URI and the live webhook/admin secrets. **Gitignored**,
  and nothing loads it automatically; `npm run db:copy` reads `MONGO_URI` out of it and nothing
  else. Running the server against production is therefore a deliberate act, not a default.
- The root `.gitignore` ignores `.env` and `.env.*` and re-includes the `*.example` files by name,
  so a new env variant is ignored the moment it is created. Don't loosen this.
- **The API listens on `:3001`, not `:3000`** — the unrelated `sakura-book-web` container publishes
  `0.0.0.0:3000` on this machine and silently wins those connections, so requests to `:3000` come
  back as that app's HTML. `PORT` in `apps/server/.env` and `PUBLIC_API_BASE_URL` in
  `apps/web/.env` have to agree.
- `npm run db:copy` streams `mongodump | mongorestore` through a container — no dump directory of
  real payment data is ever written to disk. The destination is the compose service `mongo` and
  cannot be overridden by an argument.

## Auth

- **Dashboard** session is an httpOnly **JWT cookie** set by `/admin/auth/login` (see
  `apps/server/src/services/jwt.js`, `routes/auth.js`). JS never sees the token. `/admin/api/*` is
  gated by `middleware/requireAdmin.js`, which reads the cookie and falls back to the legacy shared
  `ADMIN_TOKEN` for scripts. Cross-origin calls need credentialed CORS, so the exact request origin
  is echoed (never `*`) — configured via `CORS_ORIGIN`.
- **Every state-changing admin route also needs `middleware/csrfGuard.js`.** The session cookie is
  `SameSite=None` in production (it has to be — the dashboard is a separate origin), so a cross-site
  request arrives *with* the cookie. CORS blocks reading the response, not the write. The guard
  demands `X-Requested-With: nihonova-admin`, which forces a preflight the origin allowlist rejects.
  `api.ts`'s `write()` helper sends it; a new write route that skips the guard is a CSRF hole.
- **Webhook** (`/webhooks/sms`) is gated by `middleware/verifySignature.js` using `WEBHOOK_SECRET`.
- **Consuming apps** (businesses that verify payments) authenticate with
  `Authorization: Bearer <clientId>.<secret>` via `services/clientAuth.js` and
  `middleware/requireClient.js` — separate from the admin session, and deliberately not an admin
  credential. It gates `/v1` only, which has no list, search or read route at all.
- On the web side, session state lives in `apps/web/src/lib/stores/auth.svelte.ts` (session only —
  no data). A dropped session (any query 401) triggers a global logout.

## Clients (registered businesses)

The gateway receives payments for several businesses on **one** MFS number, so an SMS alone can't
say which business the money was for. `models/Client.js` is the missing identity — one row per
consuming app, managed from the dashboard's Businesses page (`routes/clients.js` +
`routes/(app)/clients/`). It exists so a claim can record *who* spent a payment.

- **A plaintext secret never crosses the wire in either direction.** The admin types it, or the
  browser generates it (`$lib/secret.ts`, `crypto.getRandomValues`); the server hashes on arrival
  and no response shape contains a secret. There is no reveal endpoint — a lost secret is rotated,
  never recovered. Don't add one.
- Hashing is **SHA-256, not bcrypt** — on purpose. bcrypt's slowness buys nothing against a secret
  held to the entropy floor in `services/clientSecret.js`, and this hash is checked on every
  checkout. If that floor is ever relaxed, the hash choice has to be revisited with it.
- Rotation keeps **two valid secrets** (`secretHash` + `previousSecretHash` until
  `previousExpiresAt`) so an app can be redeployed without a window where checkout is down.
  `services/clientAuth.js` is the only place that rule lives.
- Clients are **never deleted** — `active: false` instead. Claim records reference the row.

## Claims (single-use payments)

One receiving number serves several businesses, so verification-as-a-read let the same payment be
redeemed by both, repeatedly. `models/Claim.js` is the redemption ledger that fixes it; the full
design is in [docs/payment-claims.md](docs/payment-claims.md).

- **`POST /v1/claims` is the only route a consuming app calls** (`routes/v1.js`, mounted at `/v1`,
  not under `/admin`). No csrfGuard there — it authenticates with a Bearer header, not a cookie, so
  a browser has nothing to attach.
- **The insert is the lock.** `{ trxId: 1 }` unique, partial on `state: 'claimed'`, *is* the
  single-use rule. Never read-then-decide: a bare insert, `err.code === 11000` → `409`. Adding an
  "is it claimed?" check first reintroduces the exact race the design removes.
- **Claims are released, never deleted** — a delete makes the payment silently re-claimable and
  destroys the audit trail. The partial index is what lets a released claim free the payment.
- `{ clientId: 1, idempotencyKey: 1 }` unique makes a caller's own retry replay its original
  response instead of colliding with itself. Without it an app's timeout-retry looks like theft.
- Policy: underpayment is refused, overpayment claims and records `overpaidBy`, and sender binding
  is the per-client `requireSenderMatch` flag (default off). The `reason` strings in the error
  taxonomy are a published contract — consuming apps switch on them, so don't rename one.

## Data conventions

- Three payment collections, one per platform: `models/Bkash.js`, `Nagad.js`, `Rocket.js`, built by
  `models/createPaymentModel.js`. `admin.js` fans out across all three via the `MODELS` map and
  merges results. Sender identity is the phone string, treated as shared across platforms.
- **Timezone:** dates are stored in UTC. All "per day"/period grouping shifts to Bangladesh time
  (`BD_TZ = '+06:00'`, `BD_OFFSET_MS`). Use the `bdNow()` / date helpers in `admin.js` rather than
  raw `new Date()` when bucketing by calendar day, or buckets will straddle the wrong day.
- Parsers live in `apps/server/src/services/*Parser.js` (one per platform) behind `parsePayment.js`.
- **Query cost must not grow with history.** `/admin/api/payments` is keyset-paged (`cursor` =
  `dateReceived_id`, index `{dateReceived:-1,_id:-1}`) — never reintroduce skip/offset. Search is
  anchored-prefix only so it stays on an index. The only unbounded aggregation (all-time totals) is
  cached in `services/totalsCache.js` and invalidated by the webhook on save.
  `webhook_events` has a 90-day TTL.

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
- Transactions list uses `createInfiniteQuery` over the server's `nextCursor` and de-dupes flattened
  pages by `platform+trxId`.

## Styling — Tailwind v4 + the Nihonova design system

- **Tailwind v4** via `@tailwindcss/vite`. There is no `tailwind.config.js`: all tokens live in the
  `@theme` block of `apps/web/src/lib/app.css`, so classes read `bg-panel`, `text-ink-mid`,
  `border-line`, `text-money`, `rounded-panel`, `shadow-lifted` — never raw hex.
- `app.css` holds **globals only**: font imports, `@theme` tokens, base resets, `body`, default `a`
  colors, the `shimmer`/`indet`/`spin` keyframes, and the `.mono` helper. Nothing else. There are no
  `<style>` blocks in any `.svelte` file and no per-component CSS.
- Everything component- and page-level is Tailwind utilities on the element. Repeated visuals live
  in `apps/web/src/lib/components/` (`Button`, `Input`, `Panel`, `StatCard`, `PlatformPill`,
  `StatusBadge`, `Modal`, `Toast`, `Skeleton`, `EmptyState`, `ErrorState`, `LoadError`, …) — reuse
  those rather than re-typing utility strings.
- **Mono everywhere it matters:** every identifier, phone number, timestamp, count and taka amount
  gets `.mono` (JetBrains Mono, tabular figures) so admins can compare against student screenshots.
  Format them through `$lib/format` (`money`, `taka`, `fmtDateTime`, `fmtAgo`, `fmtAgeShort`).
- **Empty ≠ broken.** `EmptyState` is the neutral gray "nothing here yet"; `ErrorState` is the red
  "the forwarder stopped"; `LoadError` is the neutral panel boundary for a failed request. Never
  render one in place of another.
- Platform brand colors (`bkash`/`nagad`/`rocket`) are fixed and never re-mapped — including in
  chart series, which pull them from `COLORS` in `$lib/format`.
- Charts: Chart.js draws no x-axis labels; `ChartPanel` renders the sparse mono axis strip beneath
  the plot instead (`axisStrip()` in `chartOpts.ts`). Plot heights are 230px (daily) / 170px (peak).
- The desktop ledger collapses to stacked cards below the custom `tab:` breakpoint (720px).

## Typed API client

`apps/web/src/lib/api.ts` is the single typed client for the server. When you add or change a
server response shape, update its interface here **and** consuming components in the same change.

## Conventions

- Match the existing comment style: short "why" comments above non-obvious blocks, not narration.
- Commit/push only when asked. History commits directly to `main`.
