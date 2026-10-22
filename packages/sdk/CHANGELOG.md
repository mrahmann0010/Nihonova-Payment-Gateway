# Changelog

One changelog for both SDKs: `@project-sakura/pay` (npm) and `sakura-pay` (PyPI) always share a
version number and behave identically (see `packages/sdk-spec`).

## 0.2.0

- **New: accepting a short payment on purpose.** `claim({ ..., acceptShortfall: true })`
  (`accept_shortfall=True` in Python) claims a payment that is below `expectedPoisha` instead of
  answering `UNDERPAID`. `CLAIMED` gains `underpaidPoisha` (always present, `0` unless a shortfall
  was accepted), worked out from the request's own amounts. For a person who decided to take a
  short payment, never for an automatic checkout. Needs a gateway that knows the flag; an older
  one still answers `UNDERPAID`.
- **New: the Python SDK, `sakura-pay` on PyPI.** Sync and asyncio clients with the same outcomes,
  messages, retries and helpers as this package, held to the same test vectors.
- Every constant, limit, default and message string now comes from
  `packages/sdk-spec/spec.json`, and every behaviour is pinned by the shared vectors and the shared
  contract scenarios.
- Stricter reading of the gateway's answers, so that every SDK reads them the same way:
  - a timestamp must be ISO 8601 with a zone (`claimedAt`, `releasedAt`); anything else is
    unreadable instead of being guessed at;
  - `Retry-After` must be delta-seconds or an IMF-fixdate;
  - redirects are no longer followed. A gateway URL that redirects is a config mistake and comes
    back `MISCONFIGURED`.
- `platform: null` in a claim request now means "no platform", as `undefined` does.
- A non-string `orderRef` or `senderPhone` is dropped from the request instead of failing the call.
- New export: `VERSION`.
- The contract suite's harness moved to `packages/sdk-spec/contract/harness.mjs`, shared by both
  SDKs.

## 0.1.0

First release, ported from sakura-book's `apps/api/src/payment-gateway` module. Published to npm
as `@project-sakura/pay`.

- `createGatewayClient()` with all-or-none config, HTTPS enforcement and a browser guard.
- `claims.claim()` → `ClaimOutcome`. It never throws, retries transport failures once with the
  same key, and resends with the `platform` hint only after `ambiguous_trx`.
- Amounts are integer poisha (sakura-book's "cents").
- Helpers: `normaliseTrxId`, claim keys, retry schedule, taka ⇄ poisha.
- `@project-sakura/pay/testing`: `createFakeGatewayClient`, `claimedOutcome`.
