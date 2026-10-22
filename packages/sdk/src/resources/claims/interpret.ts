import {
  isPlatform,
  type ClaimRequestBody,
  type ClaimedBody,
  type RefusedBody,
} from "../../contract/wire";
import { parseIsoDate } from "../../helpers/dates";
import { message, shown } from "../../helpers/format";
import { poishaToTaka, takaToPoisha } from "../../helpers/money";
import { normaliseTrxId } from "../../helpers/trxId";
import { trim } from "../../helpers/text";
import type { ClaimOutcome, ClaimRequest } from "./types";

/* --------------------------------------------------------------------------
   Request → wire, and wire → ClaimOutcome. Pure, so every reason code is
   testable without a server.

   Ported from sakura-book's gateway-http.client.ts, where it has run in
   production. Every SDK implements this file to the same vectors
   (packages/sdk-spec/vectors/claims.json); a change here is a change there.
   -------------------------------------------------------------------------- */

/** The body the gateway expects, with poisha turned into taka. */
export function toClaimBody(request: ClaimRequest): ClaimRequestBody {
  const orderRef = typeof request.orderRef === "string" ? trim(request.orderRef) : "";
  const senderPhone = typeof request.senderPhone === "string" ? trim(request.senderPhone) : "";

  return {
    trxId: normaliseTrxId(request.trxId),
    expectedAmount: poishaToTaka(request.expectedPoisha),
    idempotencyKey: trim(request.idempotencyKey),
    ...(orderRef ? { orderRef } : {}),
    ...(request.platform ? { platform: request.platform } : {}),
    ...(senderPhone ? { senderPhone } : {}),
    // Strictly `true`: a JS caller's "yes" must not quietly accept less money.
    ...(request.acceptShortfall === true ? { acceptShortfall: true as const } : {}),
  };
}

export type InterpretOptions = {
  /** From the Retry-After header; the body's `retryAfter` wins when present. */
  retryAfterSeconds?: number;
  /** The request accepted a shortfall, so a short grant is a grant. */
  acceptShortfall?: boolean;
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
  const unexpected = (text: string) => options.onUnexpected?.(text);

  if (status >= 500) {
    return { outcome: "UNAVAILABLE", reason: message("gatewayAnswered", { status }) };
  }

  if ((status === 200 || status === 201) && isRecord(body) && body.claimed === true) {
    const claimed = readClaimedBody(body);

    if (typeof claimed === "string") {
      // The gateway says yes but the answer is incomplete. Asking again with
      // the same key replays the claim, so "try again" is safe here.
      unexpected(message("unreadableSuccessLog", { problem: claimed }));
      return { outcome: "UNAVAILABLE", reason: message("unreadableSuccess") };
    }

    const paidPoisha = takaToPoisha(claimed.amount);

    // The gateway has already compared amounts. A second look on our side,
    // because a grant is the one answer that ships goods — unless the caller
    // said a short payment is acceptable.
    if (paidPoisha < expectedPoisha && options.acceptShortfall !== true) {
      unexpected(message("underpaidGrantLog", { trxId: claimed.trxId, paidPoisha, expectedPoisha }));
      return { outcome: "UNDERPAID", expectedPoisha, paidPoisha };
    }

    return {
      outcome: "CLAIMED",
      trxId: claimed.trxId,
      platform: claimed.platform,
      paidPoisha,
      overpaidPoisha: takaToPoisha(claimed.overpaidBy),
      // Our own sum, in exact poisha, rather than the body's float taka.
      underpaidPoisha: Math.max(0, expectedPoisha - paidPoisha),
      claimedAt: parseIsoDate(claimed.claimedAt)!,
      replay: status === 200,
    };
  }

  const fields: RefusedBody = isRecord(body) ? (body as RefusedBody) : {};
  const reason = typeof fields.reason === "string" ? fields.reason : undefined;

  switch (reason) {
    case "not_found":
      return { outcome: "PENDING_ARRIVAL" };

    case "already_claimed":
      return { outcome: "ALREADY_CLAIMED", claimedAt: parseIsoDate(fields.claimedAt) };

    case "claim_released":
      return { outcome: "RELEASED", releasedAt: parseIsoDate(fields.releasedAt) };

    case "amount_mismatch":
      return {
        outcome: "UNDERPAID",
        expectedPoisha: isNumber(fields.expected) ? takaToPoisha(fields.expected) : expectedPoisha,
        paidPoisha: isNumber(fields.actual) ? takaToPoisha(fields.actual) : null,
      };

    case "ambiguous_trx":
      return { outcome: "REJECTED", rejection: "AMBIGUOUS", reason: message("rejectedAmbiguous") };

    case "outside_claim_window":
      return { outcome: "REJECTED", rejection: "TOO_OLD", reason: message("rejectedTooOld") };

    case "exceeds_max_claim":
      return { outcome: "REJECTED", rejection: "OVER_LIMIT", reason: message("rejectedOverLimit") };

    case "sender_mismatch":
      return {
        outcome: "REJECTED",
        rejection: "SENDER_MISMATCH",
        reason: message("rejectedSenderMismatch"),
      };

    case "rate_limited":
      return rateLimited(isNumber(fields.retryAfter) ? fields.retryAfter : options.retryAfterSeconds);

    case "idempotency_key_reused":
      unexpected(message("keyReusedLog"));
      return { outcome: "MISCONFIGURED", reason: message("keyReused") };

    case "invalid_request": {
      const detail = describe(fields, "detail");
      unexpected(message("invalidRequestLog", { detail }));
      return { outcome: "MISCONFIGURED", reason: message("invalidRequest", { detail }) };
    }

    case "unauthenticated":
    case "client_inactive":
      unexpected(message("credentialRefusedLog", { reason }));
      return {
        outcome: "MISCONFIGURED",
        reason: message(reason === "unauthenticated" ? "unauthenticated" : "clientInactive"),
      };
  }

  if (status === 429) return rateLimited(options.retryAfterSeconds);

  // Includes a wrong base URL: the host's own 404 page, with no reason code.
  unexpected(message("outsideContractLog", { status, reason: reason ?? message("noReason") }));

  return {
    outcome: "MISCONFIGURED",
    reason: message("unexpectedAnswer", { detail: reason ? `${status}, ${reason}` : status }),
  };
}

function rateLimited(retryAfterSeconds: number | undefined): ClaimOutcome {
  return {
    outcome: "UNAVAILABLE",
    reason: message("rateLimited"),
    ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}),
  };
}

/** The fields a grant depends on, checked by hand (no runtime dependencies). */
function readClaimedBody(body: Record<string, unknown>): ClaimedBody | string {
  if (typeof body.trxId !== "string" || !body.trxId) return message("bodyTrxIdMissing");
  if (!isPlatform(body.platform)) return message("bodyPlatformInvalid", { value: shown(body.platform) });
  if (!isNumber(body.amount) || body.amount < 0) return message("bodyAmountInvalid");
  if ("overpaidBy" in body && (!isNumber(body.overpaidBy) || body.overpaidBy < 0)) {
    return message("bodyOverpaidInvalid");
  }
  if (parseIsoDate(body.claimedAt) === null) return message("bodyClaimedAtInvalid");

  return { ...(body as ClaimedBody), overpaidBy: (body.overpaidBy as number | undefined) ?? 0 };
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** A refusal's `detail`, as text: a string as is, anything else as JSON. */
function describe(fields: RefusedBody, key: "detail"): string {
  if (!(key in fields)) return message("noDetail");
  const detail = fields[key];
  return typeof detail === "string" ? detail : shown(detail);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
