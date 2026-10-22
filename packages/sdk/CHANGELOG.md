# Changelog

## 0.1.0

First release, ported from sakura-book's `apps/api/src/payment-gateway` module. Published to npm
as `@project-sakura/pay`.

- `createGatewayClient()` with all-or-none config, HTTPS enforcement and a browser guard.
- `claims.claim()` → `ClaimOutcome`. It never throws, retries transport failures once with the
  same key, and resends with the `platform` hint only after `ambiguous_trx`.
- Amounts are integer poisha (sakura-book's "cents").
- Helpers: `normaliseTrxId`, claim keys, retry schedule, taka ⇄ poisha.
- `@project-sakura/pay/testing`: `createFakeGatewayClient`, `claimedOutcome`.
