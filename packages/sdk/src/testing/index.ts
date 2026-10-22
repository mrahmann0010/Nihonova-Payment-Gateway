import type { GatewayClient } from "../client";
import { CLAIMED_OUTCOME_DEFAULTS } from "../contract/spec.generated";
import { message } from "../helpers/format";
import type { ClaimOutcome, ClaimRequest } from "../resources/claims/types";

/* --------------------------------------------------------------------------
   A stand-in GatewayClient for an app's own tests: same shape, no network.

     import { createFakeGatewayClient } from "@project-sakura/pay/testing";

     const gateway = createFakeGatewayClient([
       { outcome: "PENDING_ARRIVAL" },
       claimedOutcome({ paidPoisha: 125_000 }),
     ]);

   Imported from a separate entry point so it never lands in a production
   bundle.
   -------------------------------------------------------------------------- */

export type FakeResponder =
  | ClaimOutcome[]
  | ((request: ClaimRequest, call: number) => ClaimOutcome | Promise<ClaimOutcome>);

export type FakeGatewayClient = GatewayClient & {
  /** Every request `claim()` received, in order. */
  readonly calls: ClaimRequest[];
};

/**
 * @param respond outcomes to hand out in order (the last one repeats), or a
 *   function deciding per request. Defaults to PENDING_ARRIVAL.
 */
export function createFakeGatewayClient(
  respond: FakeResponder = [],
  options: { enabled?: boolean; clientId?: string } = {},
): FakeGatewayClient {
  const enabled = options.enabled ?? true;
  const calls: ClaimRequest[] = [];
  const queue = Array.isArray(respond) ? [...respond] : null;

  return {
    enabled,
    clientId: enabled ? (options.clientId ?? "test-client") : undefined,
    calls,
    claims: {
      async claim(request) {
        calls.push(request);
        if (!enabled) {
          return { outcome: "UNAVAILABLE", reason: message("notConfigured") };
        }
        if (typeof respond === "function") return respond(request, calls.length);
        const next = queue!.length > 1 ? queue!.shift()! : queue![0];
        return next ?? { outcome: "PENDING_ARRIVAL" };
      },
    },
  };
}

/** A CLAIMED outcome with sensible defaults, for building fixtures. */
export function claimedOutcome(
  overrides: Partial<Extract<ClaimOutcome, { outcome: "CLAIMED" }>> = {},
): Extract<ClaimOutcome, { outcome: "CLAIMED" }> {
  return {
    ...CLAIMED_OUTCOME_DEFAULTS,
    claimedAt: new Date(CLAIMED_OUTCOME_DEFAULTS.claimedAt),
    ...overrides,
  };
}
