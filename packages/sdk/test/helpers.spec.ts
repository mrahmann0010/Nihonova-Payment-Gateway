import { describe, expect, it } from "vitest";
import {
  FAST_RETRY_DELAYS_SECONDS,
  LATE_RETRY_ATTEMPTS,
  LATE_RETRY_INTERVAL_SECONDS,
  claimKeyFor,
  firstClaimKey,
  isRetryable,
  nextClaimKey,
  nextRetryDelaySeconds,
  normaliseTrxId,
  poishaToTaka,
  takaToPoisha,
} from "../src";
import { parseRetryAfter } from "../src/transport/http";
import { backoffMs } from "../src/transport/retry";

describe("normaliseTrxId (mirrors apps/server/src/services/trxId.js)", () => {
  it.each([
    ["8f3k2m9x01", "8F3K2M9X01"],
    ["8F3K 2M9X01", "8F3K2M9X01"],
    ["pay-123", "PAY123"],
    ["PAY_123", "PAY123"],
    [" abc​", "ABC"],
    [null, ""],
    [undefined, ""],
  ])("%j → %j", (input, expected) => {
    expect(normaliseTrxId(input)).toBe(expected);
  });
});

describe("claim keys", () => {
  it("starts at attempt 1", () => {
    expect(firstClaimKey("SB-10482")).toBe("SB-10482:1");
  });

  it("gives an order with no stored key the first one", () => {
    expect(claimKeyFor("SB-1", null)).toBe("SB-1:1");
    expect(claimKeyFor("SB-1", "SB-1:3")).toBe("SB-1:3");
  });

  it("moves to the next attempt", () => {
    expect(nextClaimKey("SB-10482", "SB-10482:1")).toBe("SB-10482:2");
    expect(nextClaimKey("SB-10482", "SB-10482:9")).toBe("SB-10482:10");
    expect(nextClaimKey("SB-10482", null)).toBe("SB-10482:2");
    // An order ref that itself contains a colon still parses.
    expect(nextClaimKey("A:B", "A:B:4")).toBe("A:B:5");
  });

  it("refuses a key the gateway would reject", () => {
    expect(() => firstClaimKey("x".repeat(199))).toThrow(/200/);
    expect(() => firstClaimKey(" ")).toThrow();
  });
});

describe("retry schedule", () => {
  it("runs the fast schedule, then stops for an ungranted order", () => {
    const delays = FAST_RETRY_DELAYS_SECONDS.map((_, i) => nextRetryDelaySeconds(i + 1, false));
    expect(delays).toEqual([...FAST_RETRY_DELAYS_SECONDS]);
    expect(nextRetryDelaySeconds(FAST_RETRY_DELAYS_SECONDS.length + 1, false)).toBeNull();
  });

  it("keeps going slowly for a granted order, then stops", () => {
    const after = FAST_RETRY_DELAYS_SECONDS.length + 1;
    expect(nextRetryDelaySeconds(after, true)).toBe(LATE_RETRY_INTERVAL_SECONDS);
    expect(
      nextRetryDelaySeconds(FAST_RETRY_DELAYS_SECONDS.length + LATE_RETRY_ATTEMPTS + 1, true),
    ).toBeNull();
  });

  it("waits at least as long as the gateway asked", () => {
    expect(nextRetryDelaySeconds(1, false, 12.2)).toBe(13);
    expect(nextRetryDelaySeconds(4, false, 2)).toBe(30);
  });

  it("returns null before any attempt", () => {
    expect(nextRetryDelaySeconds(0, false)).toBeNull();
  });

  it("only retries the two 'could not tell yet' outcomes", () => {
    expect(isRetryable({ outcome: "PENDING_ARRIVAL" })).toBe(true);
    expect(isRetryable({ outcome: "UNAVAILABLE", reason: "x" })).toBe(true);
    expect(isRetryable({ outcome: "RELEASED", releasedAt: null })).toBe(false);
    expect(isRetryable({ outcome: "ALREADY_CLAIMED", claimedAt: null })).toBe(false);
  });
});

describe("money", () => {
  it("round-trips without float drift", () => {
    expect(takaToPoisha(12.34)).toBe(1234);
    expect(takaToPoisha(0.1 + 0.2)).toBe(30);
    expect(poishaToTaka(125_050)).toBe(1250.5);
  });
});

describe("transport helpers", () => {
  it("reads Retry-After as seconds or as a date", () => {
    expect(parseRetryAfter("12")).toBe(12);
    expect(parseRetryAfter(null)).toBeUndefined();
    expect(parseRetryAfter("soon")).toBeUndefined();
    const now = Date.parse("2026-10-22T00:00:00Z");
    expect(parseRetryAfter("Thu, 22 Oct 2026 00:00:30 GMT", now)).toBe(30);
  });

  it("backs off 250ms, 750ms, 2250ms around a jittered centre", () => {
    expect([0, 1, 2].map((n) => backoffMs(n, () => 0.5))).toEqual([250, 750, 2250]);
    expect(backoffMs(0, () => 0)).toBe(188);
    expect(backoffMs(0, () => 1)).toBe(313);
  });
});
