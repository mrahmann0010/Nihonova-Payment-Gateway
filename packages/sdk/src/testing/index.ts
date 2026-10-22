import type { GatewayClient } from "../client";
import type { ClaimOutcome, ClaimRequest } from "../resources/claims/types";

/* --------------------------------------------------------------------------
   A stand-in GatewayClient for an app's own tests: same shape, no network.

     import { createFakeGatewayClient } from "@sakura/pay/testing";

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
          return { outcome: "UNAVAILABLE", reason: "The payment gateway is not configured." };
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
    outcome: "CLAIMED",
    trxId: "8F3K2M9X01",
    platform: "bkash",
    paidPoisha: 125_000,
    overpaidPoisha: 0,
    claimedAt: new Date("2026-01-01T00:00:00.000Z"),
    replay: false,
    ...overrides,
  };
}
