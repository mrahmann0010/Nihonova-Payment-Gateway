import {
  FAST_RETRY_DELAYS_SECONDS,
  LATE_RETRY_ATTEMPTS,
  LATE_RETRY_INTERVAL_SECONDS,
  RETRYABLE_OUTCOMES,
} from "../contract/spec.generated";
import type { ClaimOutcome } from "../resources/claims/types";

// The schedule itself lives in spec.json, shared with every other SDK.
export { FAST_RETRY_DELAYS_SECONDS, LATE_RETRY_ATTEMPTS, LATE_RETRY_INTERVAL_SECONDS };

/* --------------------------------------------------------------------------
   When an app should ask the gateway again.

   The customer usually taps "I've paid" a few seconds before the payment SMS
   reaches the gateway, so the first claim at checkout is often
   PENDING_ARRIVAL. That is normal. Retry quickly at first, then stop and leave
   the order for a person.

   An order staff have already confirmed by hand (the SMS had not arrived)
   keeps being retried for longer, at a slower pace: the payment still needs to
   be marked spent at the gateway once it turns up, or another business sharing
   the number could claim it.

   The SDK only computes the schedule. The app runs it with its own job runner
   (cron, a queue, a Nest scheduler) — blocking a checkout for minutes is never
   the answer.
   -------------------------------------------------------------------------- */

// FAST_RETRY_DELAYS_SECONDS: 5s, 10s, 20s, then every 30s — about four minutes.
// LATE_RETRY_INTERVAL_SECONDS × LATE_RETRY_ATTEMPTS: every 10 minutes for eight
// hours, after the fast schedule, for orders staff have already granted.

/**
 * Seconds until the next try, or null to stop.
 *
 * @param attempts claims made so far under the current key, including the one
 *   that just failed.
 * @param granted whether the order was already granted (a staff override).
 * @param retryAfterSeconds the gateway's own "wait this long", on a rate limit.
 */
export function nextRetryDelaySeconds(
  attempts: number,
  granted: boolean,
  retryAfterSeconds?: number,
): number | null {
  let delay: number | null = null;

  if (attempts >= 1 && attempts <= FAST_RETRY_DELAYS_SECONDS.length) {
    delay = FAST_RETRY_DELAYS_SECONDS[attempts - 1] ?? null;
  } else if (granted && attempts <= FAST_RETRY_DELAYS_SECONDS.length + LATE_RETRY_ATTEMPTS) {
    delay = LATE_RETRY_INTERVAL_SECONDS;
  }

  if (delay === null) return null;

  return retryAfterSeconds && retryAfterSeconds > delay ? Math.ceil(retryAfterSeconds) : delay;
}

/**
 * Whether asking again with the same key could change the answer. Only the two
 * "could not tell yet" outcomes are worth retrying; everything else is final
 * for this key. (RELEASED is final for the key — the next attempt needs a new
 * one from `nextClaimKey`.)
 */
export function isRetryable(outcome: ClaimOutcome): boolean {
  return (RETRYABLE_OUTCOMES as readonly string[]).includes(outcome.outcome);
}
