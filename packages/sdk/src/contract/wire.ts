/* --------------------------------------------------------------------------
   The gateway's JSON, exactly as apps/server/src/routes/v1.js sends it.

   The only file that describes the wire. Amounts here are TAKA (the gateway's
   unit); everything above this layer is integer poisha. A change to a /v1
   response shape lands here in the same commit as the server change.
   -------------------------------------------------------------------------- */

export const PLATFORMS = ["bkash", "nagad", "rocket"] as const;
export type Platform = (typeof PLATFORMS)[number];

export function isPlatform(value: unknown): value is Platform {
  return typeof value === "string" && (PLATFORMS as readonly string[]).includes(value);
}

/** The gateway's limit on idempotency keys (MAX_IDEM_KEY in v1.js). */
export const MAX_IDEMPOTENCY_KEY_LENGTH = 200;

/** The gateway truncates orderRef past this (MAX_ORDER_REF in v1.js). */
export const MAX_ORDER_REF_LENGTH = 200;

/** POST /v1/claims body. */
export type ClaimRequestBody = {
  trxId: string;
  expectedAmount: number;
  idempotencyKey: string;
  orderRef?: string;
  platform?: Platform;
  senderPhone?: string;
};

/** 201 (new claim) or 200 (replay of our own claim). */
export type ClaimedBody = {
  claimed: true;
  trxId: string;
  platform: Platform;
  amount: number;
  expectedAmount: number;
  overpaidBy: number;
  orderRef: string;
  idempotencyKey: string;
  claimedAt: string;
  state: "claimed";
};

/**
 * Every refusal: `{ claimed: false, reason, ...extra }`. All fields optional —
 * a reverse proxy's error page or a bare 401 may carry none of them.
 */
export type RefusedBody = {
  claimed?: false;
  reason?: string;
  detail?: unknown;
  retryable?: boolean;
  retryAfter?: number;
  expected?: number;
  actual?: number;
  max?: number;
  claimedAt?: string;
  releasedAt?: string;
  dateReceived?: string;
  claimWindowDays?: number;
  platforms?: string[];
};

/**
 * The published reason codes. Frozen: consuming apps switch on them, so the
 * server never renames one (CLAUDE.md, "Claims"). A code the SDK does not
 * know yet is handled as "never grant" — see interpretClaimResponse.
 */
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
  "client_inactive",
] as const;
export type Reason = (typeof REASONS)[number];
