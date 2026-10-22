import { describe, expect, it } from "vitest";
import { claimedOutcome, createFakeGatewayClient } from "../src/testing";
import { request } from "./fixtures";

describe("createFakeGatewayClient", () => {
  it("hands out outcomes in order and repeats the last", async () => {
    const gateway = createFakeGatewayClient([{ outcome: "PENDING_ARRIVAL" }, claimedOutcome()]);

    expect((await gateway.claims.claim(request)).outcome).toBe("PENDING_ARRIVAL");
    expect((await gateway.claims.claim(request)).outcome).toBe("CLAIMED");
    expect((await gateway.claims.claim(request)).outcome).toBe("CLAIMED");
    expect(gateway.calls).toHaveLength(3);
  });

  it("answers per request when given a function", async () => {
    const gateway = createFakeGatewayClient((req) =>
      req.trxId === "USED" ? { outcome: "ALREADY_CLAIMED", claimedAt: null } : claimedOutcome(),
    );
    expect((await gateway.claims.claim({ ...request, trxId: "USED" })).outcome).toBe(
      "ALREADY_CLAIMED",
    );
    expect((await gateway.claims.claim(request)).outcome).toBe("CLAIMED");
  });

  it("behaves like an unconfigured gateway when disabled", async () => {
    const gateway = createFakeGatewayClient([claimedOutcome()], { enabled: false });
    expect(gateway.enabled).toBe(false);
    expect((await gateway.claims.claim(request)).outcome).toBe("UNAVAILABLE");
  });

  it("defaults to PENDING_ARRIVAL", async () => {
    expect((await createFakeGatewayClient().claims.claim(request)).outcome).toBe("PENDING_ARRIVAL");
  });
});
