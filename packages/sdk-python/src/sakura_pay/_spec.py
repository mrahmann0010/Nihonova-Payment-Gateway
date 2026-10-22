# GENERATED from packages/sdk-spec/spec.json by `npm run generate` in packages/sdk-spec. Do not edit.
# ruff: noqa: E501

from __future__ import annotations

from typing import Final, Literal

VERSION = "0.2.0"

Platform = Literal["bkash", "nagad", "rocket"]
Reason = Literal["not_found", "already_claimed", "claim_released", "idempotency_key_reused", "ambiguous_trx", "outside_claim_window", "amount_mismatch", "exceeds_max_claim", "sender_mismatch", "rate_limited", "invalid_request", "unauthenticated", "client_inactive"]
OutcomeName = Literal["CLAIMED", "PENDING_ARRIVAL", "UNDERPAID", "ALREADY_CLAIMED", "RELEASED", "REJECTED", "MISCONFIGURED", "UNAVAILABLE"]
Rejection = Literal["TOO_OLD", "OVER_LIMIT", "SENDER_MISMATCH", "AMBIGUOUS"]

PLATFORMS: Final[tuple[Platform, ...]] = ("bkash", "nagad", "rocket")
REASONS: Final[tuple[Reason, ...]] = ("not_found", "already_claimed", "claim_released", "idempotency_key_reused", "ambiguous_trx", "outside_claim_window", "amount_mismatch", "exceeds_max_claim", "sender_mismatch", "rate_limited", "invalid_request", "unauthenticated", "client_inactive")
OUTCOMES: Final[tuple[OutcomeName, ...]] = ("CLAIMED", "PENDING_ARRIVAL", "UNDERPAID", "ALREADY_CLAIMED", "RELEASED", "REJECTED", "MISCONFIGURED", "UNAVAILABLE")
RETRYABLE_OUTCOMES: Final[tuple[OutcomeName, ...]] = ("PENDING_ARRIVAL", "UNAVAILABLE")
REJECTIONS: Final[tuple[Rejection, ...]] = ("TOO_OLD", "OVER_LIMIT", "SENDER_MISMATCH", "AMBIGUOUS")

MAX_IDEMPOTENCY_KEY_LENGTH: Final = 200
MAX_ORDER_REF_LENGTH: Final = 200

DEFAULT_TIMEOUT_MS: Final = 5000
DEFAULT_TOTAL_BUDGET_MS: Final = 8000
DEFAULT_MAX_RETRIES: Final = 1

BACKOFF_BASE_MS: Final = 250
BACKOFF_FACTOR: Final = 3
BACKOFF_JITTER: Final = 0.25
MIN_ATTEMPT_MS: Final = 250

FAST_RETRY_DELAYS_SECONDS: Final[tuple[int, ...]] = (5, 10, 20, 30, 30, 30, 30, 30, 30, 30)
LATE_RETRY_INTERVAL_SECONDS: Final = 600
LATE_RETRY_ATTEMPTS: Final = 48

LOCAL_HOSTS: Final[frozenset[str]] = frozenset(("localhost", "127.0.0.1", "[::1]", "::1"))

# Exactly what JavaScript's String.prototype.trim removes. str.strip() removes a
# different set, so the SDK trims with this one instead.
WHITESPACE: Final = "\t\n\u000b\f\r \u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff"

# camelCase option name → this SDK's keyword argument, for messages.
CONFIG_FIELDS: Final[dict[str, str]] = {
    "baseUrl": "base_url",
    "clientId": "client_id",
    "secret": "secret",
    "timeoutMs": "timeout_ms",
    "totalBudgetMs": "total_budget_ms",
    "maxRetries": "max_retries",
}

CLAIMED_OUTCOME_DEFAULTS: Final[dict[str, object]] = {
    "outcome": "CLAIMED",
    "trxId": "8F3K2M9X01",
    "platform": "bkash",
    "paidPoisha": 125000,
    "overpaidPoisha": 0,
    "underpaidPoisha": 0,
    "claimedAt": "2026-01-01T00:00:00.000Z",
    "replay": False,
}

MESSAGES: Final[dict[str, str]] = {
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
    "bodyClaimedAtInvalid": "claimedAt is not a date",
}
