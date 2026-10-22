import { describe, expect, it, vi } from "vitest";
import type { ClaimOutcome } from "../src";
import { REASONS } from "../src/contract/wire";
import { interpretClaimResponse, toClaimBody } from "../src/resources/claims/interpret";
import { claimedBody, refusal, request } from "./fixtures";

/**
 * The translation layer. What's worth pinning: every reason code lands on the
 * right outcome in the right unit, and nothing here grants on an answer it
 * does not understand.
 */

describe("toClaimBody", () => {
  it("sends the total in taka, not poisha", () => {
    expect(toClaimBody(request)).toEqual({
      trxId: "8F3K2M9X01",
      expectedAmount: 1250,
      idempotencyKey: "SB-10482:1",
      orderRef: "SB-10482",
    });
  });

  it("keeps poisha as a fraction of a taka", () => {
    expect(toClaimBody({ ...request, expectedPoisha: 125_050 }).expectedAmount).toBe(1250.5);
  });

  it("normalises the transaction ID the way the server does", () => {
    expect(toClaimBody({ ...request, trxId: " 8f3k-2m9x 01 " }).trxId).toBe("8F3K2M9X01");
  });

  it("names the wallet only when asked to", () => {
    expect(toClaimBody({ ...request, platform: "nagad" }).platform).toBe("nagad");
    expect(toClaimBody(request)).not.toHaveProperty("platform");
  });

  it("sends the payer's phone when there is one", () => {
    expect(toClaimBody({ ...request, senderPhone: "01615951697" }).senderPhone).toBe("01615951697");
    expect(toClaimBody({ ...request, senderPhone: "  " })).not.toHaveProperty("senderPhone");
    expect(toClaimBody(request)).not.toHaveProperty("senderPhone");
  });
});

describe("interpretClaimResponse", () => {
  it("reads a new claim as CLAIMED, converting taka back to poisha", () => {
    expect(interpretClaimResponse(201, claimedBody, 125_000)).toEqual({
      outcome: "CLAIMED",
      trxId: "8F3K2M9X01",
      platform: "bkash",
      paidPoisha: 130_000,
      overpaidPoisha: 5_000,
      claimedAt: new Date("2026-10-21T08:14:02.000Z"),
      replay: false,
    });
  });

  it("marks a 200 as a replay of our own earlier claim", () => {
    expect(interpretClaimResponse(200, claimedBody, 125_000)).toMatchObject({
      outcome: "CLAIMED",
      replay: true,
    });
  });

  it("rounds float taka to the nearest poisha rather than truncating", () => {
    const outcome = interpretClaimResponse(201, { ...claimedBody, amount: 12.34, overpaidBy: 0 }, 1234);
    expect(outcome).toMatchObject({ outcome: "CLAIMED", paidPoisha: 1234 });
  });

  it("treats a missing overpaidBy as zero", () => {
    const { overpaidBy: _o, ...body } = claimedBody;
    expect(interpretClaimResponse(201, { ...body, amount: 1250 }, 125_000)).toMatchObject({
      outcome: "CLAIMED",
      overpaidPoisha: 0,
    });
  });

  it("refuses a 'claimed' answer for less than the total, as a second look", () => {
    const onUnexpected = vi.fn();
    const outcome = interpretClaimResponse(201, { ...claimedBody, amount: 1000 }, 125_000, {
      onUnexpected,
    });

    expect(outcome).toEqual({ outcome: "UNDERPAID", expectedPoisha: 125_000, paidPoisha: 100_000 });
    expect(onUnexpected).toHaveBeenCalled();
  });

  it.each([
    ["platform", { platform: undefined }],
    ["platform", { platform: "upay" }],
    ["trxId", { trxId: "" }],
    ["amount", { amount: "1300" }],
    ["claimedAt", { claimedAt: "not a date" }],
  ])("asks again, rather than granting, when %s is unusable", (_field, patch) => {
    expect(interpretClaimResponse(201, { ...claimedBody, ...patch }, 125_000).outcome).toBe(
      "UNAVAILABLE",
    );
  });

  it.each<[number, string, Record<string, unknown>, Partial<ClaimOutcome>]>([
    [404, "not_found", { retryable: true }, { outcome: "PENDING_ARRIVAL" }],
    [
      409,
      "already_claimed",
      { claimedAt: "2026-10-20T10:00:00.000Z" },
      { outcome: "ALREADY_CLAIMED", claimedAt: new Date("2026-10-20T10:00:00.000Z") },
    ],
    [
      409,
      "claim_released",
      { releasedAt: "2026-10-20T11:00:00.000Z" },
      { outcome: "RELEASED", releasedAt: new Date("2026-10-20T11:00:00.000Z") },
    ],
    [409, "idempotency_key_reused", {}, { outcome: "MISCONFIGURED" }],
    [409, "ambiguous_trx", { platforms: ["bkash", "nagad"] }, { outcome: "REJECTED", rejection: "AMBIGUOUS" }],
    [410, "outside_claim_window", {}, { outcome: "REJECTED", rejection: "TOO_OLD" }],
    [
      422,
      "amount_mismatch",
      { expected: 1250, actual: 900 },
      { outcome: "UNDERPAID", expectedPoisha: 125_000, paidPoisha: 90_000 },
    ],
    [422, "exceeds_max_claim", {}, { outcome: "REJECTED", rejection: "OVER_LIMIT" }],
    [422, "sender_mismatch", {}, { outcome: "REJECTED", rejection: "SENDER_MISMATCH" }],
    [429, "rate_limited", { retryAfter: 12 }, { outcome: "UNAVAILABLE", retryAfterSeconds: 12 }],
    [400, "invalid_request", { detail: "trxId is required" }, { outcome: "MISCONFIGURED" }],
    [401, "unauthenticated", {}, { outcome: "MISCONFIGURED" }],
    [403, "client_inactive", {}, { outcome: "MISCONFIGURED" }],
  ])("%i %s", (status, reason, extra, expected) => {
    expect(interpretClaimResponse(status, refusal(reason, extra), 125_000)).toMatchObject(expected);
  });

  it("covers every published reason code", () => {
    // A reason added to REASONS without a branch would fall through to the
    // "outside the contract" path; this keeps the table and the switch in step.
    const onUnexpected = vi.fn();
    for (const reason of REASONS) {
      interpretClaimResponse(409, refusal(reason), 125_000, { onUnexpected });
    }
    const outsideContract = onUnexpected.mock.calls.filter(([m]) =>
      String(m).includes("outside its contract"),
    );
    expect(outsideContract).toEqual([]);
  });

  it("reads already_claimed without a time as an unknown time, not a crash", () => {
    expect(interpretClaimResponse(409, refusal("already_claimed"), 125_000)).toEqual({
      outcome: "ALREADY_CLAIMED",
      claimedAt: null,
    });
  });

  it("falls back to the order total when amount_mismatch omits it", () => {
    expect(interpretClaimResponse(422, refusal("amount_mismatch"), 125_000)).toEqual({
      outcome: "UNDERPAID",
      expectedPoisha: 125_000,
      paidPoisha: null,
    });
  });

  it("treats every 5xx as unavailable, whatever the body says", () => {
    expect(interpretClaimResponse(503, refusal("not_found"), 125_000).outcome).toBe("UNAVAILABLE");
    expect(interpretClaimResponse(500, "<html>", 125_000).outcome).toBe("UNAVAILABLE");
  });

  it("falls back to the Retry-After header on a bare 429", () => {
    expect(interpretClaimResponse(429, null, 125_000, { retryAfterSeconds: 30 })).toEqual({
      outcome: "UNAVAILABLE",
      reason: expect.any(String),
      retryAfterSeconds: 30,
    });
  });

  it("never grants on an answer outside the contract", () => {
    const onUnexpected = vi.fn();

    expect(interpretClaimResponse(418, refusal("teapot"), 125_000, { onUnexpected }).outcome).toBe(
      "MISCONFIGURED",
    );
    // A wrong URL: the host's own 404 page, no reason code.
    expect(interpretClaimResponse(404, null, 125_000, { onUnexpected }).outcome).toBe("MISCONFIGURED");
    // A 2xx that doesn't say claimed:true is not a grant either.
    expect(interpretClaimResponse(200, { ok: true }, 125_000, { onUnexpected }).outcome).toBe(
      "MISCONFIGURED",
    );
    expect(onUnexpected).toHaveBeenCalledTimes(3);
  });
});
