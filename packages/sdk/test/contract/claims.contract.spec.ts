import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type ClaimRequest,
  type GatewayClient,
  createGatewayClient,
  firstClaimKey,
  nextClaimKey,
} from "../../src";
import {
  CLAIM_RATE_LIMIT,
  type RunningServer,
  adminRelease,
  connectDb,
  disconnectDb,
  freePort,
  makeSecret,
  seedClients,
  seedPayments,
  startServer,
} from "./harness";

/* --------------------------------------------------------------------------
   The SDK against the real gateway: every row of DESIGN.md §2, end to end.

   Unit tests prove the SDK reads the responses it was told about. These prove
   the server still sends them. If a /v1 change and the SDK drift apart, this
   is the suite that fails.
   -------------------------------------------------------------------------- */

const secrets = {
  a: makeSecret(),
  b: makeSecret(),
  strict: makeSecret(),
  off: makeSecret(),
  limit: makeSecret(),
};

const SENDER = "01712345678";

let server: RunningServer;
let a: GatewayClient;
let b: GatewayClient;
let strict: GatewayClient;

const client = (clientId: string, secret: string, extra: object = {}) =>
  createGatewayClient({ baseUrl: server.baseUrl, clientId, secret, ...extra });

const req = (trxId: string, taka: number, key: string, extra: Partial<ClaimRequest> = {}): ClaimRequest => ({
  trxId,
  expectedPoisha: taka * 100,
  idempotencyKey: key,
  orderRef: key.split(":")[0],
  ...extra,
});

beforeAll(async () => {
  await connectDb();

  await seedClients([
    { clientId: "contract-a", secret: secrets.a },
    { clientId: "contract-b", secret: secrets.b },
    {
      clientId: "contract-strict",
      secret: secrets.strict,
      requireSenderMatch: true,
      maxClaimAmount: 5000,
      claimWindowDays: 30,
    },
    { clientId: "contract-off", secret: secrets.off, active: false },
    { clientId: "contract-limit", secret: secrets.limit },
  ]);

  await seedPayments([
    { platform: "bkash", trxId: "CTOK1", amount: 1250 },
    { platform: "bkash", trxId: "CTOVER1", amount: 1300 },
    { platform: "bkash", trxId: "CTUNDER1", amount: 900 },
    { platform: "bkash", trxId: "CTFRAC1", amount: 1250.5 },
    { platform: "nagad", trxId: "CTNORM1", amount: 500 },
    { platform: "rocket", trxId: "CTROCKET1", amount: 700 },
    { platform: "bkash", trxId: "CTDUP1", amount: 800 },
    { platform: "nagad", trxId: "CTDUP1", amount: 800 },
    { platform: "bkash", trxId: "CTDUP2", amount: 800 },
    { platform: "nagad", trxId: "CTDUP2", amount: 800 },
    { platform: "bkash", trxId: "CTREL1", amount: 1000 },
    { platform: "bkash", trxId: "CTRACE1", amount: 1000 },
    { platform: "bkash", trxId: "CTKEY1", amount: 1000 },
    { platform: "bkash", trxId: "CTKEY2", amount: 1000 },
    { platform: "bkash", trxId: "CTOLD1", amount: 1000, sender: SENDER, daysAgo: 60 },
    { platform: "bkash", trxId: "CTBIG1", amount: 9000, sender: SENDER },
    { platform: "bkash", trxId: "CTSEND1", amount: 1000, sender: SENDER },
  ]);

  server = await startServer();
  a = client("contract-a", secrets.a);
  b = client("contract-b", secrets.b);
  strict = client("contract-strict", secrets.strict);
}, 30_000);

afterAll(async () => {
  await server?.stop();
  await disconnectDb();
});

describe("CLAIMED", () => {
  it("claims a fresh payment (201), converting taka to poisha", async () => {
    const outcome = await a.claims.claim(req("CTOK1", 1250, "A-1:1"));
    expect(outcome).toMatchObject({
      outcome: "CLAIMED",
      trxId: "CTOK1",
      platform: "bkash",
      paidPoisha: 125_000,
      overpaidPoisha: 0,
      replay: false,
    });
    if (outcome.outcome === "CLAIMED") expect(outcome.claimedAt).toBeInstanceOf(Date);
  });

  it("replays our own claim (200) when the same key is sent again", async () => {
    await expect(a.claims.claim(req("CTOK1", 1250, "A-1:1"))).resolves.toMatchObject({
      outcome: "CLAIMED",
      replay: true,
    });
  });

  it("records an overpayment in poisha", async () => {
    await expect(a.claims.claim(req("CTOVER1", 1250, "A-2:1"))).resolves.toMatchObject({
      outcome: "CLAIMED",
      paidPoisha: 130_000,
      overpaidPoisha: 5_000,
    });
  });

  it("keeps fractional taka exact", async () => {
    await expect(
      a.claims.claim({ ...req("CTFRAC1", 0, "A-3:1"), expectedPoisha: 125_050 }),
    ).resolves.toMatchObject({ outcome: "CLAIMED", paidPoisha: 125_050, overpaidPoisha: 0 });
  });

  it("finds a payment typed in lowercase with spaces and dashes, on another platform", async () => {
    await expect(a.claims.claim(req(" ct-norm 1 ", 500, "A-4:1"))).resolves.toMatchObject({
      outcome: "CLAIMED",
      trxId: "CTNORM1",
      platform: "nagad",
    });
  });

  it("claims a rocket payment", async () => {
    await expect(a.claims.claim(req("CTROCKET1", 700, "A-5:1"))).resolves.toMatchObject({
      outcome: "CLAIMED",
      platform: "rocket",
    });
  });
});

describe("single use across businesses", () => {
  it("refuses another business the same payment", async () => {
    const outcome = await b.claims.claim(req("CTOK1", 1250, "B-1:1"));
    expect(outcome).toMatchObject({ outcome: "ALREADY_CLAIMED" });
    if (outcome.outcome === "ALREADY_CLAIMED") expect(outcome.claimedAt).toBeInstanceOf(Date);
  });

  it("refuses our own payment under a NEW key — which is why keys are reused", async () => {
    await expect(a.claims.claim(req("CTOK1", 1250, "A-1:2"))).resolves.toMatchObject({
      outcome: "ALREADY_CLAIMED",
    });
  });

  it("lets exactly one of two simultaneous claims win", async () => {
    const results = await Promise.all([
      a.claims.claim(req("CTRACE1", 1000, "A-RACE:1")),
      b.claims.claim(req("CTRACE1", 1000, "B-RACE:1")),
    ]);
    const outcomes = results.map((r) => r.outcome).sort();
    expect(outcomes).toEqual(["ALREADY_CLAIMED", "CLAIMED"]);
  });
});

describe("PENDING_ARRIVAL", () => {
  it("is not_found until the SMS lands, then the same key claims it", async () => {
    const key = firstClaimKey("A-LATE");
    await expect(a.claims.claim(req("CTLATE1", 600, key))).resolves.toEqual({
      outcome: "PENDING_ARRIVAL",
    });

    await seedPayments([{ platform: "bkash", trxId: "CTLATE1", amount: 600 }]);

    await expect(a.claims.claim(req("CTLATE1", 600, key))).resolves.toMatchObject({
      outcome: "CLAIMED",
      replay: false,
    });
  });
});

describe("UNDERPAID", () => {
  it("refuses a short payment and leaves it claimable", async () => {
    await expect(a.claims.claim(req("CTUNDER1", 1250, "A-6:1"))).resolves.toEqual({
      outcome: "UNDERPAID",
      expectedPoisha: 125_000,
      paidPoisha: 90_000,
    });
    // Still claimable for the right amount — e.g. after the order is corrected.
    await expect(a.claims.claim(req("CTUNDER1", 900, "A-6:2"))).resolves.toMatchObject({
      outcome: "CLAIMED",
    });
  });
});

describe("RELEASED", () => {
  it("replays a released claim as RELEASED, and a new key claims it again", async () => {
    const key = firstClaimKey("A-REL");
    await expect(a.claims.claim(req("CTREL1", 1000, key))).resolves.toMatchObject({
      outcome: "CLAIMED",
    });

    expect(await adminRelease(server.baseUrl, "CTREL1", "contract test refund")).toBe(200);

    const replay = await a.claims.claim(req("CTREL1", 1000, key));
    expect(replay).toMatchObject({ outcome: "RELEASED" });
    if (replay.outcome === "RELEASED") expect(replay.releasedAt).toBeInstanceOf(Date);

    await expect(
      a.claims.claim(req("CTREL1", 1000, nextClaimKey("A-REL", key))),
    ).resolves.toMatchObject({ outcome: "CLAIMED", replay: false });
  });

  it("lets another business claim a released payment", async () => {
    await expect(a.claims.claim(req("CTREL1", 1000, "A-REL:2"))).resolves.toMatchObject({
      outcome: "CLAIMED",
    });
    expect(await adminRelease(server.baseUrl, "CTREL1", "contract test reassign")).toBe(200);
    await expect(b.claims.claim(req("CTREL1", 1000, "B-REL:1"))).resolves.toMatchObject({
      outcome: "CLAIMED",
    });
  });
});

describe("REJECTED", () => {
  it("is AMBIGUOUS when the ID is on two wallets and no hint is given", async () => {
    await expect(a.claims.claim(req("CTDUP2", 800, "A-7:1"))).resolves.toMatchObject({
      outcome: "REJECTED",
      rejection: "AMBIGUOUS",
    });
  });

  it("settles an ambiguous ID with the wallet hint", async () => {
    await expect(
      a.claims.claim(req("CTDUP1", 800, "A-8:1", { platform: "nagad" })),
    ).resolves.toMatchObject({ outcome: "CLAIMED", platform: "nagad" });
  });

  it("is TOO_OLD outside the client's claim window", async () => {
    await expect(
      strict.claims.claim(req("CTOLD1", 1000, "S-1:1", { senderPhone: SENDER })),
    ).resolves.toMatchObject({ outcome: "REJECTED", rejection: "TOO_OLD" });
  });

  it("is OVER_LIMIT above the client's ceiling", async () => {
    await expect(
      strict.claims.claim(req("CTBIG1", 9000, "S-2:1", { senderPhone: SENDER })),
    ).resolves.toMatchObject({ outcome: "REJECTED", rejection: "OVER_LIMIT" });
  });

  it("is SENDER_MISMATCH for the wrong payer, and CLAIMED for the right one", async () => {
    await expect(
      strict.claims.claim(req("CTSEND1", 1000, "S-3:1", { senderPhone: "01899999999" })),
    ).resolves.toMatchObject({ outcome: "REJECTED", rejection: "SENDER_MISMATCH" });

    // A country-code prefix is fine: the gateway compares the last digits.
    await expect(
      strict.claims.claim(req("CTSEND1", 1000, "S-3:2", { senderPhone: "+8801712345678" })),
    ).resolves.toMatchObject({ outcome: "CLAIMED" });
  });
});

describe("MISCONFIGURED", () => {
  it("when a key is reused for a different transaction", async () => {
    await expect(a.claims.claim(req("CTKEY1", 1000, "A-KEY:1"))).resolves.toMatchObject({
      outcome: "CLAIMED",
    });
    await expect(a.claims.claim(req("CTKEY2", 1000, "A-KEY:1"))).resolves.toMatchObject({
      outcome: "MISCONFIGURED",
      reason: expect.stringMatching(/different transaction/),
    });
  });

  it("when a sender-match client sends no phone (invalid_request)", async () => {
    await expect(strict.claims.claim(req("CTSEND1", 1000, "S-4:1"))).resolves.toMatchObject({
      outcome: "MISCONFIGURED",
      reason: expect.stringMatching(/senderPhone/),
    });
  });

  it("when the secret is wrong", async () => {
    const wrong = client("contract-a", makeSecret());
    await expect(wrong.claims.claim(req("CTOK1", 1250, "A-1:1"))).resolves.toMatchObject({
      outcome: "MISCONFIGURED",
      reason: expect.stringMatching(/credential/),
    });
  });

  it("when the client ID does not exist", async () => {
    const ghost = client("contract-ghost", secrets.a);
    await expect(ghost.claims.claim(req("CTOK1", 1250, "G-1:1"))).resolves.toMatchObject({
      outcome: "MISCONFIGURED",
    });
  });

  it("when the business is deactivated", async () => {
    const off = client("contract-off", secrets.off);
    await expect(off.claims.claim(req("CTOK1", 1250, "O-1:1"))).resolves.toMatchObject({
      outcome: "MISCONFIGURED",
      reason: expect.stringMatching(/deactivated/),
    });
  });

  it("when the base URL points at the wrong path", async () => {
    const lost = client("contract-a", secrets.a, { baseUrl: `${server.baseUrl}/nope` });
    await expect(lost.claims.claim(req("CTOK1", 1250, "A-1:1"))).resolves.toMatchObject({
      outcome: "MISCONFIGURED",
    });
  });
});

describe("UNAVAILABLE", () => {
  it("when the gateway is rate-limiting this client, with a wait", async () => {
    const limited = client("contract-limit", secrets.limit);
    let last;
    for (let i = 0; i <= CLAIM_RATE_LIMIT; i++) {
      last = await limited.claims.claim(req(`CTNONE${i}`, 100, `L-${i}:1`));
    }
    expect(last).toMatchObject({ outcome: "UNAVAILABLE" });
    if (last?.outcome === "UNAVAILABLE") {
      expect(last.retryAfterSeconds).toBeGreaterThan(0);
      expect(last.retryAfterSeconds).toBeLessThanOrEqual(60);
    }
  });

  it("when nothing is listening, without throwing", async () => {
    const port = await freePort();
    const down = createGatewayClient({
      baseUrl: `http://127.0.0.1:${port}`,
      clientId: "contract-a",
      secret: secrets.a,
      timeoutMs: 1_000,
      totalBudgetMs: 2_000,
    });
    await expect(down.claims.claim(req("CTOK1", 1250, "A-1:1"))).resolves.toMatchObject({
      outcome: "UNAVAILABLE",
      reason: expect.stringMatching(/could not be reached/),
    });
  });
});
