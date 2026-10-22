import { MAX_IDEMPOTENCY_KEY_LENGTH, isPlatform } from "../../contract/wire";
import type { ClaimRequest } from "./types";

/**
 * A claim the SDK refuses to send, or null. These are bugs in the calling
 * app, caught before they cost a request — and before a JS caller's `"1250"`
 * string or float total reaches the gateway.
 */
export function requestProblem(request: ClaimRequest): string | null {
  if (typeof request.trxId !== "string" || !/[A-Za-z0-9]/.test(request.trxId)) {
    return "The transaction ID is empty.";
  }

  if (!Number.isInteger(request.expectedPoisha) || request.expectedPoisha <= 0) {
    return `The expected amount (${String(request.expectedPoisha)} poisha) is not a positive whole number.`;
  }

  if (typeof request.idempotencyKey !== "string" || !request.idempotencyKey.trim()) {
    return "The claim key is empty.";
  }
  if (request.idempotencyKey.trim().length > MAX_IDEMPOTENCY_KEY_LENGTH) {
    return `The claim key is longer than ${MAX_IDEMPOTENCY_KEY_LENGTH} characters.`;
  }

  if (request.platform !== undefined && !isPlatform(request.platform)) {
    return `The platform ${JSON.stringify(request.platform)} is not bkash, nagad or rocket.`;
  }

  return null;
}
