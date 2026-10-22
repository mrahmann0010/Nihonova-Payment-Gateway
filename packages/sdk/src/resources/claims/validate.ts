import { MAX_IDEMPOTENCY_KEY_LENGTH, isPlatform } from "../../contract/wire";
import { message, shown } from "../../helpers/format";
import { trim } from "../../helpers/text";
import type { ClaimRequest } from "./types";

/**
 * A claim the SDK refuses to send, or null. These are bugs in the calling
 * app, caught before they cost a request — and before a JS caller's `"1250"`
 * string or float total reaches the gateway.
 *
 * A null `platform` counts as no platform, as `undefined` does.
 */
export function requestProblem(request: ClaimRequest): string | null {
  if (typeof request.trxId !== "string" || !/[A-Za-z0-9]/.test(request.trxId)) {
    return message("trxIdEmpty");
  }

  if (!Number.isInteger(request.expectedPoisha) || request.expectedPoisha <= 0) {
    return message("amountNotPositiveInt", { value: String(request.expectedPoisha) });
  }

  if (typeof request.idempotencyKey !== "string" || !trim(request.idempotencyKey)) {
    return message("keyEmpty");
  }
  if (trim(request.idempotencyKey).length > MAX_IDEMPOTENCY_KEY_LENGTH) {
    return message("keyTooLong", { max: MAX_IDEMPOTENCY_KEY_LENGTH });
  }

  if (request.platform != null && !isPlatform(request.platform)) {
    return message("platformInvalid", { value: shown(request.platform) });
  }

  return null;
}
