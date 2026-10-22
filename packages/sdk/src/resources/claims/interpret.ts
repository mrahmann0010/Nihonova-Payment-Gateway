import {
  isPlatform,
  type ClaimRequestBody,
  type ClaimedBody,
  type RefusedBody,
} from "../../contract/wire";
import { poishaToTaka, takaToPoisha } from "../../helpers/money";
import { normaliseTrxId } from "../../helpers/trxId";
import type { ClaimOutcome, ClaimRequest } from "./types";

/* --------------------------------------------------------------------------
   Request → wire, and wire → ClaimOutcome. Pure, so every reason code is
   testable without a server.

   Ported from sakura-book's gateway-http.client.ts, where it has run in
   production; behaviour is kept identical apart from units (poisha) and the
   field name `platform`.
   -------------------------------------------------------------------------- */

/** The body the gateway expects, with poisha turned into taka. */
export function toClaimBody(request: ClaimRequest): ClaimRequestBody {
  const orderRef = request.orderRef?.trim();
  const senderPhone = request.senderPhone?.trim();

  return {
    trxId: normaliseTrxId(request.trxId),
    expectedAmount: poishaToTaka(request.expectedPoisha),
    idempotencyKey: request.idempotencyKey.trim(),
    ...(orderRef ? { orderRef } : {}),
    ...(request.platform ? { platform: request.platform } : {}),
    ...(senderPhone ? { senderPhone } : {}),
  };
}

export type InterpretOptions = {
  /** From the Retry-After header; the body's `retryAfter` wins when present. */
  retryAfterSeconds?: number;
  /** Called for answers that mean something is wrong on one side or the other. */
  onUnexpected?: (message: string) => void;
};

/**
 * Turn one gateway answer into a ClaimOutcome.
 *
 * Anything outside the contract never grants: an unknown refusal is
 * MISCONFIGURED (someone needs to look) and a 5xx is UNAVAILABLE (try again).
 */
export function interpretClaimResponse(
  status: number,
  body: unknown,
  expectedPoisha: number,
  options: InterpretOptions = {},
): ClaimOutcome {
  const unexpected = (message: string) => options.onUnexpected?.(message);

  if (status >= 500) {
    return { outcome: "UNAVAILABLE", reason: `The payment gateway answered ${status}.` };
  }

  if ((status === 200 || status === 201) && isRecord(body) && body.claimed === true) {
    const claimed = readClaimedBody(body);

    if (typeof claimed === "string") {
      // The gateway says yes but the answer is incomplete. Asking again with
      // the same key replays the claim, so "try again" is safe here.
      unexpected(`Payment gateway sent an unreadable success body: ${claimed}`);
      return { outcome: "UNAVAILABLE", reason: "The payment gateway's answer could not be read." };
    }

    const paidPoisha = takaToPoisha(claimed.amount);

    // The gateway has already compared amounts. A second look on our side,
    // because a grant is the one answer that ships goods.
    if (paidPoisha < expectedPoisha) {
      unexpected(
        `Payment gateway claimed ${claimed.trxId} for ${paidPoisha} poisha against ${expectedPoisha} expected`,
      );
      return { outcome: "UNDERPAID", expectedPoisha, paidPoisha };
    }

    return {
      outcome: "CLAIMED",
      trxId: claimed.trxId,
      platform: claimed.platform,
      paidPoisha,
      overpaidPoisha: takaToPoisha(claimed.overpaidBy),
      claimedAt: new Date(claimed.claimedAt),
      replay: status === 200,
    };
  }

  const fields: RefusedBody = isRecord(body) ? (body as RefusedBody) : {};
  const reason = typeof fields.reason === "string" ? fields.reason : undefined;

  switch (reason) {
    case "not_found":
      return { outcome: "PENDING_ARRIVAL" };

    case "already_claimed":
      return { outcome: "ALREADY_CLAIMED", claimedAt: toDate(fields.claimedAt) };

    case "claim_released":
      return { outcome: "RELEASED", releasedAt: toDate(fields.releasedAt) };

    case "amount_mismatch":
      return {
        outcome: "UNDERPAID",
        expectedPoisha: isNumber(fields.expected) ? takaToPoisha(fields.expected) : expectedPoisha,
        paidPoisha: isNumber(fields.actual) ? takaToPoisha(fields.actual) : null,
      };

    case "ambiguous_trx":
      return {
        outcome: "REJECTED",
        rejection: "AMBIGUOUS",
        reason: "This transaction ID exists on more than one wallet; the wallet must be named.",
      };

    case "outside_claim_window":
      return {
        outcome: "REJECTED",
        rejection: "TOO_OLD",
        reason: "The payment is older than this shop's claim window.",
      };

    case "exceeds_max_claim":
      return {
        outcome: "REJECTED",
        rejection: "OVER_LIMIT",
        reason: "The payment is above this shop's per-claim limit.",
      };

    case "sender_mismatch":
      return {
        outcome: "REJECTED",
        rejection: "SENDER_MISMATCH",
        reason: "The payer's phone number does not match.",
      };

    case "rate_limited":
      return rateLimited(isNumber(fields.retryAfter) ? fields.retryAfter : options.retryAfterSeconds);

    case "idempotency_key_reused":
      unexpected("Payment gateway refused a reused idempotency key with a different trxId");
      return {
        outcome: "MISCONFIGURED",
        reason: "The claim key was already used with a different transaction ID.",
      };

    case "invalid_request":
      unexpected(`Payment gateway refused the claim as malformed: ${describe(fields.detail)}`);
      return {
        outcome: "MISCONFIGURED",
        reason: `The payment gateway refused the request as malformed: ${describe(fields.detail)}`,
      };

    case "unauthenticated":
    case "client_inactive":
      unexpected(`Payment gateway refused our credential: ${reason}`);
      return {
        outcome: "MISCONFIGURED",
        reason:
          reason === "unauthenticated"
            ? "The payment gateway did not accept this shop's credential."
            : "This shop is deactivated on the payment gateway.",
      };
  }

  if (status === 429) return rateLimited(options.retryAfterSeconds);

  // Includes a wrong base URL: the host's own 404 page, with no reason code.
  unexpected(`Payment gateway sent an answer outside its contract: ${status} ${reason ?? "(no reason)"}`);

  return {
    outcome: "MISCONFIGURED",
    reason: `The payment gateway sent an unexpected answer (${status}${reason ? `, ${reason}` : ""}).`,
  };
}

function rateLimited(retryAfterSeconds: number | undefined): ClaimOutcome {
  return {
    outcome: "UNAVAILABLE",
    reason: "The payment gateway is rate-limiting this shop.",
    ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}),
  };
}

/** The fields a grant depends on, checked by hand (no runtime dependencies). */
function readClaimedBody(body: Record<string, unknown>): ClaimedBody | string {
  if (typeof body.trxId !== "string" || !body.trxId) return "trxId is missing";
  if (!isPlatform(body.platform)) return `platform is ${JSON.stringify(body.platform)}`;
  if (!isNumber(body.amount) || body.amount < 0) return "amount is not a non-negative number";
  if (body.overpaidBy !== undefined && (!isNumber(body.overpaidBy) || body.overpaidBy < 0)) {
    return "overpaidBy is not a non-negative number";
  }
  if (typeof body.claimedAt !== "string" || toDate(body.claimedAt) === null) {
    return "claimedAt is not a date";
  }

  return { ...(body as ClaimedBody), overpaidBy: (body.overpaidBy as number | undefined) ?? 0 };
}

function toDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function describe(detail: unknown): string {
  if (typeof detail === "string") return detail;
  if (detail === undefined) return "no detail given";
  return JSON.stringify(detail);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
