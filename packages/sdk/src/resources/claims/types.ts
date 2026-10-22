import type { OUTCOMES, REJECTIONS } from "../../contract/spec.generated";
import type { Platform } from "../../contract/wire";

/* --------------------------------------------------------------------------
   The SDK's words for what the gateway said.

   The gateway answers a claim with one of a dozen `reason` codes. None of
   them reach the app: each is translated into one of the outcomes below, so a
   change to the gateway's contract touches the SDK and not every app.

   Every amount here is integer POISHA (1 taka = 100 poisha), the way a shop
   stores money. The gateway speaks taka; the conversion happens at the edge.
   -------------------------------------------------------------------------- */

export type ClaimRequest = {
  /** As the customer typed it. Case, spaces and dashes don't matter. */
  trxId: string;
  /** The order total, in integer poisha. Sent to the gateway as taka. */
  expectedPoisha: number;
  /**
   * One key per attempt to pay for one order — `<orderRef>:<attempt>`, see
   * `firstClaimKey` / `nextClaimKey`. Store it on the order before the first
   * call and reuse it on every retry, so a retry gets back our own earlier
   * success instead of colliding with it.
   */
  idempotencyKey: string;
  /** The app's order number, shown in the gateway's ledger. */
  orderRef?: string;
  /**
   * The wallet the customer says they paid with. A hint, not a filter: the
   * first claim is sent without it, and it is only used to settle an
   * `ambiguous_trx` answer. See ClaimsResource.claim.
   */
  platform?: Platform;
  /**
   * The number the customer says they paid from. Required by clients with
   * "require sender match" switched on; the gateway compares the last digits.
   */
  senderPhone?: string;
  /**
   * Claim the payment even if it is short of `expectedPoisha`, and report
   * what is still owed as `underpaidPoisha`. For a person who has looked at a
   * short payment and decided to take it, never for an automatic checkout.
   * Only `true` counts; anything else leaves an underpayment UNDERPAID.
   */
  acceptShortfall?: boolean;
};

/** Why the gateway refused a payment that does exist. */
export type ClaimRejection =
  /** Older than this client's claim window. */
  | "TOO_OLD"
  /** Above this client's per-claim ceiling. */
  | "OVER_LIMIT"
  /** The payer's phone did not match. */
  | "SENDER_MISMATCH"
  /** The ID exists on more than one wallet, and no wallet was named. */
  | "AMBIGUOUS";

export type ClaimOutcome =
  /**
   * We own this payment. `replay` is true when it was our own earlier claim.
   * `underpaidPoisha` is above 0 only when the request accepted a shortfall.
   */
  | {
      outcome: "CLAIMED";
      trxId: string;
      platform: Platform;
      paidPoisha: number;
      overpaidPoisha: number;
      underpaidPoisha: number;
      claimedAt: Date;
      replay: boolean;
    }
  /** The SMS has not reached the gateway yet. Retry later with the same key. */
  | { outcome: "PENDING_ARRIVAL" }
  /**
   * The payment exists and is short. It stays unclaimed so the customer can
   * top up, or a person can claim it again with `acceptShortfall: true`.
   */
  | { outcome: "UNDERPAID"; expectedPoisha: number; paidPoisha: number | null }
  /** Another order or business has already spent this payment. */
  | { outcome: "ALREADY_CLAIMED"; claimedAt: Date | null }
  /** A gateway admin released our earlier claim. Trying again needs a new key. */
  | { outcome: "RELEASED"; releasedAt: Date | null }
  /** The payment exists but this client may not spend it. */
  | { outcome: "REJECTED"; rejection: ClaimRejection; reason: string }
  /** Our request or our credentials are wrong. A bug or a config problem, never retried. */
  | { outcome: "MISCONFIGURED"; reason: string }
  /** We could not ask: network, timeout, 5xx, rate limit, or not configured. */
  | { outcome: "UNAVAILABLE"; reason: string; retryAfterSeconds?: number };

export type ClaimOutcomeName = ClaimOutcome["outcome"];

// The unions above are written out for their doc comments; these lines fail
// the build if they ever drift from the lists in spec.json.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Assert<T extends true> = T;
export type _OutcomesMatchSpec = Assert<Same<ClaimOutcomeName, (typeof OUTCOMES)[number]>>;
export type _RejectionsMatchSpec = Assert<Same<ClaimRejection, (typeof REJECTIONS)[number]>>;
