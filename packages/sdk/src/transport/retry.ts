/* --------------------------------------------------------------------------
   Retrying inside one call, under a time budget.

   Only for answers that say nothing about the payment — a dropped connection,
   a timeout, a 5xx. Safe solely because the retry carries the same
   idempotency key: the gateway replays our own claim instead of making a
   second one. The budget exists because a checkout is waiting.
   -------------------------------------------------------------------------- */

import { BACKOFF } from "../contract/spec.generated";

export type RetryPolicy = {
  /** Extra attempts after the first. 0 turns in-call retries off. */
  maxRetries: number;
  /** Ceiling for one call, retries included. */
  totalBudgetMs: number;
  /** Ceiling for one attempt. Clipped to what is left of the budget. */
  timeoutMs: number;
};

export type Attempt<T> = { value: T; transient: boolean };

export type RetryDeps = {
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  random: () => number;
};

export const defaultRetryDeps: RetryDeps = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  random: Math.random,
};

/** 250ms, 750ms, 2250ms… with ±25% jitter, so callers don't retry in step. */
export function backoffMs(retry: number, random: () => number): number {
  const base = BACKOFF.baseMs * BACKOFF.factor ** retry;
  return Math.round(base * (1 - BACKOFF.jitter + random() * 2 * BACKOFF.jitter));
}

export async function withRetry<T>(
  policy: RetryPolicy,
  run: (timeoutMs: number) => Promise<Attempt<T>>,
  deps: RetryDeps = defaultRetryDeps,
): Promise<T> {
  const deadline = deps.now() + policy.totalBudgetMs;
  let result = await run(Math.min(policy.timeoutMs, policy.totalBudgetMs));

  for (let retry = 0; retry < policy.maxRetries && result.transient; retry++) {
    const wait = backoffMs(retry, deps.random);
    const left = deadline - deps.now() - wait;
    // Shortest attempt worth starting; below it, it would time out on arrival.
    if (left < BACKOFF.minAttemptMs) break;

    await deps.sleep(wait);
    result = await run(Math.min(policy.timeoutMs, left));
  }

  return result.value;
}
