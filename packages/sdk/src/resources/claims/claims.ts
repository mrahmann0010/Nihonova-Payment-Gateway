import { message } from "../../helpers/format";
import type { GatewayLogger } from "../../logger";
import type { HttpResult } from "../../transport/http";
import { type RetryDeps, type RetryPolicy, withRetry } from "../../transport/retry";
import { interpretClaimResponse, toClaimBody } from "./interpret";
import type { ClaimOutcome, ClaimRequest } from "./types";
import { requestProblem } from "./validate";

export type ClaimsResource = {
  /**
   * "Let me spend this payment for this order."
   *
   * Claiming *is* checking: there is no "is it paid?" read to call first, and
   * no app should build one — a read-then-decide check is the race the gateway
   * exists to remove.
   *
   * Never throws and never rejects. Gateway trouble is UNAVAILABLE; the app's
   * own bugs and config mistakes are MISCONFIGURED. Only CLAIMED means grant.
   */
  claim(request: ClaimRequest): Promise<ClaimOutcome>;
};

export type ClaimsContext =
  | { enabled: false; logger: GatewayLogger }
  | {
      enabled: true;
      logger: GatewayLogger;
      policy: RetryPolicy;
      retryDeps: RetryDeps;
      post: (body: unknown, timeoutMs: number) => Promise<HttpResult>;
    };

export function createClaimsResource(ctx: ClaimsContext): ClaimsResource {
  async function claim(request: ClaimRequest): Promise<ClaimOutcome> {
    if (!ctx.enabled) {
      return { outcome: "UNAVAILABLE", reason: message("notConfigured") };
    }

    try {
      const problem = requestProblem(request);
      if (problem) {
        ctx.logger.error(
          message("refusingBadClaimLog", { orderRef: request?.orderRef ?? "?", problem }),
        );
        return { outcome: "MISCONFIGURED", reason: problem };
      }

      // Asked without the wallet first. The customer picks a wallet on the
      // form and can pick the wrong one; naming it up front would turn that
      // slip into a payment that is "not found" forever. Only when the gateway
      // says the ID exists on two wallets is the customer's choice used.
      let outcome = await send({ ...request, platform: undefined });

      if (outcome.outcome === "REJECTED" && outcome.rejection === "AMBIGUOUS" && request.platform != null) {
        outcome = await send(request);
      }

      return outcome;
    } catch (error) {
      // Every path above already returns an outcome; this keeps the promise
      // ("never throws") even against a bug in the SDK itself.
      ctx.logger.error(message("unexpectedErrorLog", { error: String(error) }));
      return { outcome: "UNAVAILABLE", reason: message("unexpectedError", { error: String(error) }) };
    }
  }

  async function send(request: ClaimRequest): Promise<ClaimOutcome> {
    if (!ctx.enabled) throw new Error("unreachable");
    const { post, policy, retryDeps, logger } = ctx;
    const body = toClaimBody(request);

    return withRetry(
      policy,
      async (timeoutMs) => {
        const http = await post(body, timeoutMs);

        if (http.kind === "failure") {
          return {
            transient: true,
            value: {
              outcome: "UNAVAILABLE",
              reason: http.timedOut
                ? message("timedOut", { timeoutMs })
                : message("unreachable", { message: http.message }),
            },
          };
        }

        const outcome = interpretClaimResponse(http.status, http.body, request.expectedPoisha, {
          ...(http.retryAfterSeconds !== undefined
            ? { retryAfterSeconds: http.retryAfterSeconds }
            : {}),
          acceptShortfall: request.acceptShortfall === true,
          onUnexpected: (message) => logger.error(message),
        });

        // A 5xx or an unreadable success is worth one more try with the same
        // key. A rate limit is not: hammering it is what got us limited, and
        // the app's schedule honours its Retry-After instead.
        const transient = outcome.outcome === "UNAVAILABLE" && http.status !== 429;
        return { transient, value: outcome };
      },
      retryDeps,
    );
  }

  return { claim };
}
