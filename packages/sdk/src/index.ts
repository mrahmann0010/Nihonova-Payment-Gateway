// @project-sakura/pay — the public surface. Anything not exported here is internal and
// may change in any release; anything exported here follows semver.

export { VERSION } from "./contract/spec.generated";
export { createGatewayClient } from "./client";
export type { GatewayClient } from "./client";
export type { GatewayClientConfig } from "./config";
export { GatewayConfigError } from "./errors";
export type { GatewayLogger } from "./logger";
export type { FetchLike } from "./transport/http";

export type { ClaimsResource } from "./resources/claims/claims";
export type {
  ClaimOutcome,
  ClaimOutcomeName,
  ClaimRejection,
  ClaimRequest,
} from "./resources/claims/types";

export { PLATFORMS, isPlatform } from "./contract/wire";
export type { Platform } from "./contract/wire";

export { normaliseTrxId } from "./helpers/trxId";
export { claimKeyFor, firstClaimKey, nextClaimKey } from "./helpers/keys";
export {
  FAST_RETRY_DELAYS_SECONDS,
  LATE_RETRY_ATTEMPTS,
  LATE_RETRY_INTERVAL_SECONDS,
  isRetryable,
  nextRetryDelaySeconds,
} from "./helpers/retrySchedule";
export { poishaToTaka, takaToPoisha } from "./helpers/money";
