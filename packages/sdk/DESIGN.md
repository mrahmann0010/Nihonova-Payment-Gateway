# `@sakura/pay` — design

Why the SDK exists, what it relies on in the gateway, and how it is meant to grow. Usage is in
[README.md](README.md).

---

## 1. Why this exists

The gateway exposes one call, `POST /v1/claims`. Calling it correctly is harder than it looks. An
app has to:

- build the `Bearer <clientId>.<secret>` header and keep the secret server-side;
- generate and **persist** an idempotency key per payment attempt, reuse it on every retry, and
  bump it only on `claim_released` or a new trxId;
- tell "the gateway refused" apart from "the gateway was unreachable", and never fail a paid
  checkout because of the second;
- handle 13 reason codes plus transport failures, two of them retryable and one with `Retry-After`;
- keep retrying for minutes after `not_found`, because the SMS often arrives after the customer
  taps "I've paid";
- convert between taka (the wire) and the app's integer money unit.

sakura-book got this right in `apps/api/src/payment-gateway/` and `apps/api/src/orders/`. A second
or third app writing the same logic from the prose in
[docs/client-integration.md](../../docs/client-integration.md) would get some of it wrong, and
every copy would drift whenever the gateway changed. **The SDK is sakura-book's tested module,
taken out of NestJS and zod and published once.**

### What it is not

- **Not a microservice.** It's a library inside each app's backend process. The gateway is the
  service, and nothing new gets deployed.
- **Not a browser library.** It refuses to run where `window` and `document` exist.
- **Not a checkout UI.** Apps keep their own pages. Hosted checkout is a later phase (§9).
- **Not an order store.** It returns verdicts. The app decides what a verdict means for its order,
  stores the key, and runs the retry schedule.

---

## 2. The gateway, as the SDK sees it

```text
Android SMS forwarder ──► POST /webhooks/sms ──► parse ──► bkash / nagad / rocket collections
                                                                │  (cash received)
consuming app ──(SDK)──► POST /v1/claims ──► claims collection ◄┘  (cash applied, once)
                                               ▲
gateway admin (dashboard) ── release ──────────┘   (only humans can un-spend a payment)
```

- One MFS number collects money for several businesses, so the SMS can't say whose payment it is.
  A **claim** records who spent it.
- **The insert is the lock.** There's no "is it paid?" read, and the SDK must never add one.
- A client credential can **only** claim. There's no list, read or release, on purpose, and the
  SDK's surface reflects that.

### Properties the SDK relies on

1. **A retry with the same key is safe.** `(clientId, idempotencyKey)` is unique and replays the
   original success as `200`. This is what makes in-call retries and background retries safe.
2. **`not_found` means "not yet",** never a verdict.
3. **Underpayment leaves the payment claimable,** so the customer can top up.
4. **A released claim never replays as success** (`409 claim_released`), so the app bumps its key.
5. **Rate limit: 120 claims/min per client** (`CLAIM_RATE_LIMIT`).
6. **Reason strings are frozen** (CLAUDE.md, "Claims"). New ones may be added, and none are renamed.

### Reason → outcome

| HTTP | `reason` | Outcome | In-call retry |
|---|---|---|---|
| 201 / 200 | — | `CLAIMED` (`replay` on 200) | — |
| 404 | `not_found` | `PENDING_ARRIVAL` | no (app schedules) |
| 409 | `already_claimed` | `ALREADY_CLAIMED` | no |
| 409 | `claim_released` | `RELEASED` | no (needs a new key) |
| 409 | `ambiguous_trx` | `REJECTED: AMBIGUOUS`, or re-sent once with the `platform` hint | — |
| 410 | `outside_claim_window` | `REJECTED: TOO_OLD` | no |
| 422 | `amount_mismatch` | `UNDERPAID` | no |
| 422 | `exceeds_max_claim` | `REJECTED: OVER_LIMIT` | no |
| 422 | `sender_mismatch` | `REJECTED: SENDER_MISMATCH` | no |
| 429 | `rate_limited` | `UNAVAILABLE` + `retryAfterSeconds` | no (app honours it) |
| 409 / 400 / 401 / 403 | `idempotency_key_reused` / `invalid_request` / `unauthenticated` / `client_inactive` | `MISCONFIGURED` | no |
| 5xx, network, timeout, unreadable success | — | `UNAVAILABLE` | **yes**, same key, within budget |
| anything else (unknown reason, a host's 404 page, 2xx without `claimed:true`) | — | `MISCONFIGURED` | no |

Two deliberate extras, both inherited from sakura-book:

- **Second look on success.** A `CLAIMED` body whose `amount` is below the order total becomes
  `UNDERPAID`. A grant is the one answer that ships goods.
- **The wallet is a hint.** The first claim leaves `platform` out, because the customer may have
  picked the wrong wallet on the form and naming it would make the payment "not found" forever.
  `platform` is only sent on a second request, after `ambiguous_trx`.

---

## 3. Requirements

| # | Requirement | How it's met |
|---|---|---|
| F1 | `claim()` returns a typed outcome and never throws or rejects | `resources/claims/claims.ts`, with a last-resort catch |
| F2 | One closed outcome union | `resources/claims/types.ts`, the same vocabulary as sakura-book |
| F3 | Transport failures are retried with the same key, within a budget | `transport/retry.ts` |
| F4 | Bad input is caught before it costs a request | `resources/claims/validate.ts` → `MISCONFIGURED` |
| F5 | trxId is normalised like the server | `helpers/trxId.ts` |
| F6 | Key and retry-schedule helpers | `helpers/keys.ts`, `helpers/retrySchedule.ts` |
| F7 | Test double | `@sakura/pay/testing` |
| N1 | Zero runtime dependencies | hand-written checks instead of zod, global `fetch` |
| N2 | ESM + CJS + types | `tsup`. `typesVersions` covers `moduleResolution: node` (sakura-book) |
| N3 | Short timeouts | 5s per attempt, 8s per call |
| N4 | The secret is never exposed | held in a closure, the client object is frozen, never in messages |
| N5 | Bad config fails at boot | `GatewayConfigError` from `createGatewayClient` |
| N6 | Silent by default | optional `logger` (`console` or a Nest `Logger`) |

---

## 4. Architecture

```text
┌──────────────────────────────────────────────────────────────┐
│ Public API   index.ts · client.ts · testing/                 │ what apps import
├──────────────────────────────────────────────────────────────┤
│ Resources    resources/claims/   (later: sessions, webhooks) │ one folder per gateway feature
├──────────────────────────────────────────────────────────────┤
│ Contract     contract/wire.ts                                │ the only file that knows the JSON
├──────────────────────────────────────────────────────────────┤
│ Transport    transport/http.ts · transport/retry.ts          │ HTTP and time, no payments
└──────────────────────────────────────────────────────────────┘
helpers/ — pure functions, no I/O: trxId, keys, retry schedule, money
config.ts — validation, run once at construction
```

A transport change touches one folder. A new reason code touches `wire.ts` and `interpret.ts`. A
new gateway feature is a new `resources/` folder plus one line in `client.ts`.

---

## 5. Decisions

| Decision | Why |
|---|---|
| **Integer poisha** in the API, taka only on the wire | Smallest-unit integers are the payments-industry norm and avoid float drift. sakura-book already stores cents (the same unit) |
| **Never throw after construction** | A gateway outage must never fail a checkout where the customer has already paid. Exceptions get lost, while a union the compiler checks for completeness doesn't |
| **Throw at construction** | A deploy mistake should fail at boot, not on the first customer |
| **All-or-none config** | An environment can run without a gateway (every claim is `UNAVAILABLE`), but half a config is always a mistake |
| **Unknown reason → `MISCONFIGURED`** | Never grant on an unknown answer, and make sure someone looks at it |
| **In-call retry only for transport failures** | Safe because of the same key. A rate limit or `not_found` is the app scheduler's job, so a checkout never blocks for minutes |
| **Default `maxRetries: 1`** | One retry covers a dropped connection. More would eat the checkout's time budget |
| **The SDK doesn't store keys** | A key held only in memory doesn't survive a crash, which is exactly when retries happen. It goes on the order row |
| **Lives in the gateway repo** | Contract and client change in the same commit |

---

## 6. Security

- Refuses to run in a browser. The credential is a payment secret.
- The credential is built once and held in a closure. The client object is frozen and holds only
  `enabled`, `clientId` and `claims`, so `JSON.stringify(client)` can't leak it.
- HTTPS is required, except for `localhost` / `127.0.0.1` during development. A base URL with
  embedded credentials, a query or a fragment is refused.
- A client ID containing `.` is refused, because the server splits the credential on the first dot.
- Fail closed: only `CLAIMED` means grant.
- Rotation needs nothing from the SDK. The gateway accepts both secrets during the grace window,
  so the app redeploys with the new env value.

---

## 7. Keeping the SDK and the gateway in sync

1. **Same-commit rule.** A change to a `/v1` response shape or reason code updates
   `contract/wire.ts` and `resources/claims/interpret.ts` in the same commit (see CLAUDE.md).
2. **Exhaustiveness test.** `interpret.spec.ts` sends every code in `REASONS` through the
   translator and fails if any falls into the "outside the contract" branch.
3. **The normaliser mirrors** `apps/server/src/services/trxId.js`, and `helpers.spec.ts` pins the
   same cases.
4. **Not done yet: live contract tests.** A suite that runs the SDK against a local server and
   Docker MongoDB, covering every row of §2. It needs a seeded test client and payment, and is the
   next piece of test work.

---

## 8. Versioning and distribution

- Semver. **Adding an outcome variant is a major version** (it breaks exhaustive `switch`es). A new
  rejection kind, helper or resource is minor.
- Release: `npm run release` in `packages/sdk` checks, builds and packs `sakura-pay-<v>.tgz`.
  Commit the tarball to the consuming app's `vendor/` and depend on
  `"@sakura/pay": "file:vendor/sakura-pay-<v>.tgz"`. This works in Docker and CI with no registry
  or token.
- Why not GitHub Packages: it requires the npm scope to match the GitHub owner (`@mrahmann0010`), so
  it can't host `@sakura/pay`. Why not a git dependency: npm can't install a package from a
  subdirectory of a repo.
- If a registry becomes worth it later (more apps, CI publishing), the options are an npm org named
  `sakura` (if free), or renaming the scope. Either way, app code only changes its import line.
- Non-JS apps: publish an OpenAPI spec for `/v1` and generate a client from it.

---

## 9. Roadmap

| Phase | Scope | Gateway changes needed |
|---|---|---|
| **1 — Claims** (this release) | `claims.claim`, helpers, test double | none |
| 1b | Live contract tests (§7.4); sakura-book switches to the SDK | none |
| 2 — Credential check | `gateway.verifyCredentials()` at boot | `GET /v1/whoami` |
| 3 — Inbound webhooks | `webhooks.verify(rawBody, signature)` → typed `claim.released` / `payment.received` events, so a release reaches the app without a human relaying it | `callbackUrl` + signing secret on `models/Client.js` (not there yet), delivery log, retry worker |
| 4 — Hosted checkout | `sessions.create({ amountPoisha, orderRef, successUrl })` → redirect URL | `CheckoutSession` model, `/v1/checkout/sessions`, public pay page |
| 5 — Framework adapters | `@sakura/pay/nest`: a module with DI and config | none |

Each phase is a new `resources/` folder and an export, which is a minor version.
