import type { ClaimRequest } from "../src";

export const request: ClaimRequest = {
  trxId: "8F3K2M9X01",
  expectedPoisha: 125_000,
  idempotencyKey: "SB-10482:1",
  orderRef: "SB-10482",
};

/** A 201 body exactly as routes/v1.js serializeClaim() writes it. */
export const claimedBody = {
  claimed: true,
  trxId: "8F3K2M9X01",
  platform: "bkash",
  amount: 1300,
  expectedAmount: 1250,
  overpaidBy: 50,
  orderRef: "SB-10482",
  idempotencyKey: "SB-10482:1",
  claimedAt: "2026-10-21T08:14:02.000Z",
  state: "claimed",
};

export const refusal = (reason: string, extra: Record<string, unknown> = {}) => ({
  claimed: false,
  reason,
  ...extra,
});

export function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}
