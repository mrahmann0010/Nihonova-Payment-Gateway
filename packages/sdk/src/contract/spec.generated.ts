// GENERATED from packages/sdk-spec/spec.json by `npm run generate` in packages/sdk-spec. Do not edit.

export const VERSION = "0.2.0";

export const PLATFORMS = [
  "bkash",
  "nagad",
  "rocket"
] as const;
export const REASONS = [
  "not_found",
  "already_claimed",
  "claim_released",
  "idempotency_key_reused",
  "ambiguous_trx",
  "outside_claim_window",
  "amount_mismatch",
  "exceeds_max_claim",
  "sender_mismatch",
  "rate_limited",
  "invalid_request",
  "unauthenticated",
  "client_inactive"
] as const;
export const OUTCOMES = [
  "CLAIMED",
  "PENDING_ARRIVAL",
  "UNDERPAID",
  "ALREADY_CLAIMED",
  "RELEASED",
  "REJECTED",
  "MISCONFIGURED",
  "UNAVAILABLE"
] as const;
export const RETRYABLE_OUTCOMES = [
  "PENDING_ARRIVAL",
  "UNAVAILABLE"
] as const;
export const REJECTIONS = [
  "TOO_OLD",
  "OVER_LIMIT",
  "SENDER_MISMATCH",
  "AMBIGUOUS"
] as const;

export const MAX_IDEMPOTENCY_KEY_LENGTH = 200;
export const MAX_ORDER_REF_LENGTH = 200;

export const DEFAULTS = {
  "timeoutMs": 5000,
  "totalBudgetMs": 8000,
  "maxRetries": 1
} as const;
export const BACKOFF = {
  "baseMs": 250,
  "factor": 3,
  "jitter": 0.25,
  "minAttemptMs": 250
} as const;

export const FAST_RETRY_DELAYS_SECONDS = [
  5,
  10,
  20,
  30,
  30,
  30,
  30,
  30,
  30,
  30
] as const;
export const LATE_RETRY_INTERVAL_SECONDS = 600;
export const LATE_RETRY_ATTEMPTS = 48;

export const LOCAL_HOSTS = [
  "localhost",
  "127.0.0.1",
  "[::1]",
  "::1"
] as const;

/** Exactly what String.prototype.trim removes; the other SDKs trim this set. */
export const WHITESPACE = "\t\n\u000b\f\r \u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff";

export const CLAIMED_OUTCOME_DEFAULTS = {
  "outcome": "CLAIMED",
  "trxId": "8F3K2M9X01",
  "platform": "bkash",
  "paidPoisha": 125000,
  "overpaidPoisha": 0,
  "underpaidPoisha": 0,
  "claimedAt": "2026-01-01T00:00:00.000Z",
  "replay": false
} as const;

export const MESSAGES = {
  "configIncomplete": "Payment gateway config is incomplete: missing {missing}. Set all three or none.",
  "baseUrlNotUrl": "Payment gateway baseUrl is not a URL: {raw}",
  "baseUrlNotHttps": "Payment gateway baseUrl must use https (plain http is allowed only for localhost).",
  "baseUrlNotPlain": "Payment gateway baseUrl must be a plain origin/path, without credentials, query or fragment.",
  "clientIdHasDot": "Payment gateway clientId must not contain a dot.",
  "notPositive": "Payment gateway {name} must be a positive number.",
  "notNonNegativeInt": "Payment gateway {name} must be a whole number ≥ 0.",
  "trxIdEmpty": "The transaction ID is empty.",
  "amountNotPositiveInt": "The expected amount ({value} poisha) is not a positive whole number.",
  "keyEmpty": "The claim key is empty.",
  "keyTooLong": "The claim key is longer than {max} characters.",
  "platformInvalid": "The platform {value} is not bkash, nagad or rocket.",
  "keyNeedsOrderRef": "A claim key needs an order reference.",
  "keyWouldBeTooLong": "Claim key for {orderRef} would exceed {max} characters.",
  "notConfigured": "The payment gateway is not configured.",
  "refusingBadClaimLog": "Refusing to send a bad claim for {orderRef}: {problem}",
  "unexpectedErrorLog": "Payment gateway claim failed unexpectedly: {error}",
  "unexpectedError": "Unexpected error: {error}",
  "timedOut": "The payment gateway did not answer within {timeoutMs} ms.",
  "unreachable": "The payment gateway could not be reached: {message}",
  "gatewayAnswered": "The payment gateway answered {status}.",
  "unreadableSuccessLog": "Payment gateway sent an unreadable success body: {problem}",
  "unreadableSuccess": "The payment gateway's answer could not be read.",
  "underpaidGrantLog": "Payment gateway claimed {trxId} for {paidPoisha} poisha against {expectedPoisha} expected",
  "rejectedAmbiguous": "This transaction ID exists on more than one wallet; the wallet must be named.",
  "rejectedTooOld": "The payment is older than this shop's claim window.",
  "rejectedOverLimit": "The payment is above this shop's per-claim limit.",
  "rejectedSenderMismatch": "The payer's phone number does not match.",
  "rateLimited": "The payment gateway is rate-limiting this shop.",
  "keyReusedLog": "Payment gateway refused a reused idempotency key with a different trxId",
  "keyReused": "The claim key was already used with a different transaction ID.",
  "invalidRequestLog": "Payment gateway refused the claim as malformed: {detail}",
  "invalidRequest": "The payment gateway refused the request as malformed: {detail}",
  "noDetail": "no detail given",
  "credentialRefusedLog": "Payment gateway refused our credential: {reason}",
  "unauthenticated": "The payment gateway did not accept this shop's credential.",
  "clientInactive": "This shop is deactivated on the payment gateway.",
  "outsideContractLog": "Payment gateway sent an answer outside its contract: {status} {reason}",
  "noReason": "(no reason)",
  "unexpectedAnswer": "The payment gateway sent an unexpected answer ({detail}).",
  "bodyTrxIdMissing": "trxId is missing",
  "bodyPlatformInvalid": "platform is {value}",
  "bodyAmountInvalid": "amount is not a non-negative number",
  "bodyOverpaidInvalid": "overpaidBy is not a non-negative number",
  "bodyClaimedAtInvalid": "claimedAt is not a date"
} as const;
