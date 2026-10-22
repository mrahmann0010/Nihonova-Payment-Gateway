/* --------------------------------------------------------------------------
   The gateway's JSON, exactly as apps/server/src/routes/v1.js sends it.

   The only file that describes the wire. Amounts here are TAKA (the gateway's
   unit); everything above this layer is integer poisha. A change to a /v1
   response shape lands here in the same commit as the server change.
   -------------------------------------------------------------------------- */

import {
  MAX_IDEMPOTENCY_KEY_LENGTH,
  MAX_ORDER_REF_LENGTH,
  PLATFORMS,
  REASONS,
} from "./spec.generated";

// The lists and limits come from spec.json, shared with every other SDK.
export { MAX_IDEMPOTENCY_KEY_LENGTH, MAX_ORDER_REF_LENGTH, PLATFORMS, REASONS };

export type Platform = (typeof PLATFORMS)[number];

export function isPlatform(value: unknown): value is Platform {
  return typeof value === "string" && (PLATFORMS as readonly string[]).includes(value);
}

/** POST /v1/claims body. */
export type ClaimRequestBody = {
  trxId: string;
  expectedAmount: number;
  idempotencyKey: string;
  orderRef?: string;
  platform?: Platform;
  senderPhone?: string;
  /** Claim a short payment instead of refusing it with amount_mismatch. */
  acceptShortfall?: true;
};

/** 201 (new claim) or 200 (replay of our own claim). */
export type ClaimedBody = {
  claimed: true;
  trxId: string;
  platform: Platform;
  amount: number;
  expectedAmount: number;
  overpaidBy: number;
  /**
   * Above 0 only when the claim accepted a shortfall. Older gateways leave it
   * out. Not read by the SDK, which works the shortfall out from its own
   * numbers, as it does for the underpayment second look.
   */
  underpaidBy?: number;
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
 * The published reason codes (REASONS, from spec.json). Frozen: consuming apps
 * switch on them, so the server never renames one (CLAUDE.md, "Claims"). A
 * code the SDK does not know yet is handled as "never grant" — see
 * interpretClaimResponse.
 */
export type Reason = (typeof REASONS)[number];
