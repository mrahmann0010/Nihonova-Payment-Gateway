# sakura-pay

The server-side Python client for the Nihonova payment gateway. It claims a bKash / Nagad / Rocket
payment for an order, **exactly once across every business that shares the receiving number**.

- Python 3.10+. Sync and asyncio clients. Fully typed (`py.typed`, mypy strict).
- `claim()` never raises. Every answer, including "the gateway is down", is a typed outcome.
- Retries network failures safely, under a time budget a checkout can afford.
- The Python twin of the npm package [`@project-sakura/pay`](https://www.npmjs.com/package/@project-sakura/pay):
  the same rules, outcomes, messages and helpers, held to the same shared test vectors.

---

## Install

```sh
pip install sakura-pay        # or: uv add sakura-pay / poetry add sakura-pay
```

Use it in your **server** code only. The secret is a payment credential.

---

## Setup

Register the app in the gateway dashboard (**Businesses → Add business**) and put three values in
its server environment:

```env
SAKURA_PAYMENT_GATEWAY_URL=https://<gateway-api-host>
SAKURA_PAYMENT_GATEWAY_CLIENT_ID=<client id>
SAKURA_PAYMENT_GATEWAY_SECRET=<secret>
```

Create one client at boot and share it:

```python
import logging
import os

from sakura_pay import create_gateway_client

gateway = create_gateway_client(
    base_url=os.environ.get("SAKURA_PAYMENT_GATEWAY_URL"),
    client_id=os.environ.get("SAKURA_PAYMENT_GATEWAY_CLIENT_ID"),
    secret=os.environ.get("SAKURA_PAYMENT_GATEWAY_SECRET"),
    logger=logging.getLogger("payments"),  # optional
)
```

For asyncio apps (FastAPI, Starlette, aiohttp), use `create_async_gateway_client` with the same
arguments and `await gateway.claims.claim(...)`. Close it on shutdown with `await gateway.aclose()`
(or `gateway.close()` for the sync client).

- **All three or none.** With none set (local dev without a gateway), `gateway.enabled` is False and
  every claim is `Unavailable`, never a grant. Half a config raises `GatewayConfigError` at boot.
- HTTPS is required, except for `http://localhost` / `127.0.0.1`.
- Optional: `timeout_ms` (5000 per attempt), `total_budget_ms` (8000 per call), `max_retries` (1),
  `http_client` (your own `httpx.Client` / `httpx.AsyncClient`, for proxies or mTLS).

---

## Claiming

```python
from sakura_pay import (
    AlreadyClaimed, Claimed, Misconfigured, PendingArrival, Rejected, Released,
    Unavailable, Underpaid, claim_key_for, next_claim_key,
)

key = claim_key_for(order.number, order.payment_claim_key)  # "SB-10482:1"
save_claim_key(order, key)  # persist BEFORE the first call

outcome = gateway.claims.claim(
    trx_id=form.trx_id,                 # as the customer typed it
    expected_poisha=order.total_poisha,  # integer poisha: ৳1250.50 → 125050
    idempotency_key=key,
    order_ref=order.number,             # optional, shown in the gateway's ledger
    platform=form.wallet,               # optional hint: "bkash" | "nagad" | "rocket"
    sender_phone=form.payer_phone,      # required if the client has "require sender match"
)

match outcome:
    case Claimed():
        # The only answer that means grant. `replay` is True when this was our own earlier claim.
        grant(order, outcome)
        if outcome.overpaid_poisha > 0:
            flag_for_refund(order, outcome.overpaid_poisha)
    case PendingArrival() | Unavailable():
        # The SMS hasn't arrived yet (normal), or we couldn't ask. Keep pending, retry later.
        keep_pending(order)
        schedule_retry(order, outcome)  # see "Retrying" below
    case Released():
        # A gateway admin released our claim: the next try needs a NEW key.
        save_claim_key(order, next_claim_key(order.number, key))
    case Underpaid() | AlreadyClaimed() | Rejected():
        # Rejected.rejection: "TOO_OLD" | "OVER_LIMIT" | "SENDER_MISMATCH" | "AMBIGUOUS"
        refuse_or_review(order, outcome)
    case Misconfigured():
        # A bug or a bad credential. Alert someone; don't retry.
        alert_ops(outcome.reason)
```

`if outcome.outcome == "CLAIMED":` works too, and type checkers narrow on it. `outcome.to_json()`
gives the same JSON the TypeScript SDK's outcome serialises to, if you store or log it.

### Accepting a short payment

`Underpaid` leaves the payment unclaimed, because an automatic checkout must never grant on less
money. When a person on your side looks at it and decides to take it anyway, claim again with the
**same key** and `accept_shortfall=True`:

```python
outcome = gateway.claims.claim(**same_request_as_before, accept_shortfall=True)

if isinstance(outcome, Claimed) and outcome.underpaid_poisha > 0:
    record_amount_due(order, outcome.underpaid_poisha)  # what the customer still owes
```

Keep `expected_poisha` at the real order total, so the gateway records the shortfall too (it shows
on the gateway's Claims page). Only `True` counts. Never set it on an automatic path.

Rules that matter:

1. **Only `Claimed` grants.** Every other outcome means "don't ship".
2. **Reuse the key on every retry** (timeouts, polling, worker restarts). A new key for the same
   payment comes back `AlreadyClaimed` against your own claim. Use `next_claim_key` only after
   `Released` or when the order gets a different trxId.
3. **Don't build an "is it paid?" check first.** Claiming is checking.
4. **Every path that grants must claim**, including staff confirming by hand. Otherwise another
   business can still spend the payment.
5. **Refunds and cancellations:** only a gateway admin can release a claim (dashboard → Claims).

---

## Retrying

The customer usually taps "I've paid" before the SMS reaches the gateway. Don't block the request.
Answer "confirming…" and retry in the background with the **same key**:

```python
from sakura_pay import Unavailable, is_retryable, next_retry_delay_seconds

if is_retryable(outcome):
    delay = next_retry_delay_seconds(
        order.claim_attempts,      # attempts under this key, including this one
        order.granted_by_staff,    # granted orders keep retrying slowly for 8h
        outcome.retry_after_seconds if isinstance(outcome, Unavailable) else None,
    )
    if delay is None:
        send_to_review(order)
    else:
        reclaim.apply_async((order.id,), countdown=delay)  # Celery, RQ, APScheduler…
```

The schedule is 5s, 10s, 20s, then every 30s (about 4 minutes). After that it stops, or switches to
every 10 minutes for 8 hours if staff already granted the order.

Inside a single `claim()` call, the SDK retries network errors, timeouts and 5xx once on its own,
with the same key, so a dropped connection rarely reaches your code.

---

## Helpers

| Export | Purpose |
|---|---|
| `normalise_trx_id(s)` | The gateway's comparison form (`" 8f3k-2m9x 01"` → `"8F3K2M9X01"`), for your own "already used in our orders" check |
| `first_claim_key`, `claim_key_for`, `next_claim_key` | `<orderRef>:<attempt>` keys |
| `next_retry_delay_seconds`, `is_retryable` | The background retry schedule |
| `taka_to_poisha`, `poisha_to_taka` | Float-safe conversion |
| `PLATFORMS`, `is_platform` | `"bkash" \| "nagad" \| "rocket"` |

---

## Testing your app

```python
from sakura_pay import PendingArrival
from sakura_pay.testing import claimed_outcome, create_fake_gateway_client

gateway = create_fake_gateway_client([PendingArrival(), claimed_outcome(paid_poisha=125_000)])
# ...inject `gateway` where the real client would go...
assert gateway.calls[0].idempotency_key == "SB-10482:1"
```

You can also pass a function `(request, call_number) -> outcome`, or `enabled=False` to test the
unconfigured path. `create_fake_async_gateway_client` is the asyncio version (its function may be
async).

---

## Developing the SDK

This package lives in the gateway repo next to the TypeScript SDK, and both are generated from and
tested against `packages/sdk-spec`. See that folder's README for how a change is made: in short, a
behaviour change starts as a new test vector, and both SDKs are changed until `npm run check` in
`packages/sdk-spec` passes.

```sh
cd packages/sdk-python
uv sync
uv run pytest                 # unit tests: the shared vectors, sync and async
uv run pytest tests/contract  # against the real gateway: needs `docker compose up -d`
uv run mypy && uv run ruff check src tests
```
