# @project-sakura/pay

The server-side client for the Nihonova payment gateway. It claims a bKash / Nagad / Rocket payment
for an order, **exactly once across every business that shares the receiving number**.

- No runtime dependencies. Node 18.17+, ESM and CommonJS, fully typed.
- `claim()` never throws. Every answer, including "the gateway is down", is a typed outcome.
- Retries network failures safely, under a time budget a checkout can afford.
- Built from sakura-book's production integration.

Design and rationale: [DESIGN.md](DESIGN.md). The full gateway contract is
`docs/client-integration.md` in the gateway repo.

---

## Install

```sh
npm install @project-sakura/pay
```

Install it in your app's **server** code only. It refuses to load in a browser.

---

## Setup

Register the app in the gateway dashboard (**Businesses → Add business**) and put three values in
its **server** environment. Never use a `PUBLIC_` / `VITE_` / `NEXT_PUBLIC_` prefix.

```env
SAKURA_PAYMENT_GATEWAY_URL=https://<gateway-api-host>
SAKURA_PAYMENT_GATEWAY_CLIENT_ID=<client id>
SAKURA_PAYMENT_GATEWAY_SECRET=<secret>
```

Create one client at boot and share it:

```ts
import { createGatewayClient } from "@project-sakura/pay";

export const gateway = createGatewayClient({
  baseUrl: process.env.SAKURA_PAYMENT_GATEWAY_URL,
  clientId: process.env.SAKURA_PAYMENT_GATEWAY_CLIENT_ID,
  secret: process.env.SAKURA_PAYMENT_GATEWAY_SECRET,
  logger: console, // optional; a NestJS Logger works too
});
```

- **All three or none.** With none set (local dev without a gateway), `gateway.enabled` is false and
  every claim is `UNAVAILABLE`, never a grant. Half a config throws `GatewayConfigError` at boot.
- HTTPS is required, except for `http://localhost` / `127.0.0.1`.
- Optional: `timeoutMs` (5000 per attempt), `totalBudgetMs` (8000 per call), `maxRetries` (1),
  `fetch`.

---

## Claiming

```ts
import { claimKeyFor } from "@project-sakura/pay";

const key = claimKeyFor(order.number, order.paymentClaimKey); // "SB-10482:1"
await saveClaimKey(order.id, key); // persist BEFORE the first call

const outcome = await gateway.claims.claim({
  trxId: form.trxId,               // as the customer typed it
  expectedPoisha: order.totalPoisha, // integer poisha: ৳1250.50 → 125050
  idempotencyKey: key,
  orderRef: order.number,          // optional, shown in the gateway's ledger
  platform: form.wallet,           // optional hint: "bkash" | "nagad" | "rocket"
  senderPhone: form.payerPhone,    // required if the client has "require sender match"
});

switch (outcome.outcome) {
  case "CLAIMED":
    // The only answer that means grant. `replay` is true when this was our own earlier claim.
    grant(order, outcome);
    if (outcome.overpaidPoisha > 0) flagForRefund(order, outcome.overpaidPoisha);
    break;
  case "PENDING_ARRIVAL": // the SMS hasn't arrived yet, which is normal
  case "UNAVAILABLE":     // couldn't ask: network, 5xx, rate limit, not configured
    keepPending(order);
    scheduleRetry(order, outcome); // see "Retrying" below
    break;
  case "RELEASED":        // a gateway admin released our claim: the next try needs a NEW key
    await saveClaimKey(order.id, nextClaimKey(order.number, key));
    break;
  case "UNDERPAID":       // outcome.expectedPoisha / outcome.paidPoisha; the payment stays claimable
  case "ALREADY_CLAIMED": // spent by another order or business
  case "REJECTED":        // outcome.rejection: TOO_OLD | OVER_LIMIT | SENDER_MISMATCH | AMBIGUOUS
    refuseOrReview(order, outcome);
    break;
  case "MISCONFIGURED":   // a bug or a bad credential. Alert someone; don't retry
    alertOps(outcome.reason);
    break;
}
```

Rules that matter:

1. **Only `CLAIMED` grants.** Every other outcome means "don't ship".
2. **Reuse the key on every retry** (timeouts, polling, worker restarts). A new key for the same
   payment comes back `ALREADY_CLAIMED` against your own claim. Use `nextClaimKey` only after
   `RELEASED` or when the order gets a different trxId.
3. **Don't build an "is it paid?" check first.** Claiming is checking.
4. **Every path that grants must claim**, including staff confirming by hand. Otherwise another
   business can still spend the payment.
5. **Refunds and cancellations:** only a gateway admin can release a claim (dashboard → Claims).
   Remind your staff in your own admin UI.

---

## Retrying

The customer usually taps "I've paid" before the SMS reaches the gateway. Don't block the request.
Answer "confirming…" and retry in the background with the **same key**:

```ts
import { isRetryable, nextRetryDelaySeconds } from "@project-sakura/pay";

if (isRetryable(outcome)) {
  const delay = nextRetryDelaySeconds(
    order.claimAttempts,          // attempts under this key, including this one
    order.grantedByStaff,         // granted orders keep retrying slowly for 8h
    outcome.outcome === "UNAVAILABLE" ? outcome.retryAfterSeconds : undefined,
  );
  if (delay === null) sendToReview(order);
  else queue.add("reclaim", order.id, { delay: delay * 1000 });
}
```

The schedule is 5s, 10s, 20s, then every 30s (about 4 minutes). After that it stops, or switches to
every 10 minutes for 8 hours if staff already granted the order.

Inside a single `claim()` call, the SDK retries network errors, timeouts and 5xx once on its own,
with the same key, so a dropped connection rarely reaches your code.

---

## Helpers

| Export | Purpose |
|---|---|
| `normaliseTrxId(s)` | The gateway's comparison form (`" 8f3k-2m9x 01"` → `"8F3K2M9X01"`), for your own "already used in our orders" check |
| `firstClaimKey`, `claimKeyFor`, `nextClaimKey` | `<orderRef>:<attempt>` keys |
| `nextRetryDelaySeconds`, `isRetryable` | The background retry schedule |
| `takaToPoisha`, `poishaToTaka` | Float-safe conversion |
| `PLATFORMS`, `isPlatform` | `"bkash" \| "nagad" \| "rocket"` |

---

## Testing your app

```ts
import { claimedOutcome, createFakeGatewayClient } from "@project-sakura/pay/testing";

const gateway = createFakeGatewayClient([
  { outcome: "PENDING_ARRIVAL" },
  claimedOutcome({ paidPoisha: 125_000 }),
]);
// ...inject `gateway` where the real client would go...
expect(gateway.calls[0].idempotencyKey).toBe("SB-10482:1");
```

You can also pass a function `(request, callNumber) => outcome`, or `{ enabled: false }` to test the
unconfigured path.

---

## Developing the SDK

```sh
cd packages/sdk
npm install
npm run check          # tsc + unit tests + build
npm run test:contract  # against the real gateway: needs `docker compose up -d` at the repo root
```

The contract suite starts `apps/server` (run `npm install` there first) on a free port, against a
throwaway `sakura-pay-contract` database that it creates and drops each run. Your local
`primary-data` copy is never touched.

When the gateway's `/v1` responses change, update `src/contract/wire.ts` and
`src/resources/claims/interpret.ts` **in the same commit**. Add a line to
[CHANGELOG.md](CHANGELOG.md) and bump the version (a new outcome variant is a major version).
