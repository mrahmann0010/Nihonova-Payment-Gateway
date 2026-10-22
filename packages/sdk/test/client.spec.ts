import { describe, expect, it, vi } from "vitest";
import { createGatewayClient, type GatewayClientConfig } from "../src";
import type { RetryDeps } from "../src/transport/retry";
import { claimedBody, jsonResponse, refusal, request } from "./fixtures";

const SECRET = "s3cret.with.dots";

/** No real waiting: sleeps resolve at once and the clock advances by the wait. */
function instantDeps(): RetryDeps & { slept: number[] } {
  let now = 0;
  const slept: number[] = [];
  return {
    slept,
    now: () => now,
    sleep: async (ms) => {
      slept.push(ms);
      now += ms;
    },
    random: () => 0.5,
  };
}

function clientWith(
  answers: Array<Response | Error>,
  config: Partial<GatewayClientConfig> = {},
  deps = instantDeps(),
) {
  const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => {
    const next = answers.length > 1 ? answers.shift()! : answers[0]!;
    if (next instanceof Error) throw next;
    return next.clone();
  });
  const logger = { error: vi.fn() };
  const client = createGatewayClient(
    {
      baseUrl: "https://gateway.example/",
      clientId: "sakura-book",
      secret: SECRET,
      fetch: fetchMock,
      logger,
      ...config,
    },
    { retryDeps: deps },
  );
  return { client, fetchMock, logger, deps };
}

const bodyOf = (call: unknown[]) => JSON.parse((call[1] as RequestInit).body as string);

describe("claims.claim — the request", () => {
  it("posts to /v1/claims with the bearer credential", async () => {
    const { client, fetchMock } = clientWith([jsonResponse(201, claimedBody)]);

    await expect(client.claims.claim(request)).resolves.toMatchObject({ outcome: "CLAIMED" });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://gateway.example/v1/claims");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      `Bearer sakura-book.${SECRET}`,
    );
    expect(bodyOf(fetchMock.mock.calls[0]!)).toMatchObject({ expectedAmount: 1250 });
  });

  it("keeps a path prefix on the base URL", async () => {
    const { client, fetchMock } = clientWith([jsonResponse(201, claimedBody)], {
      baseUrl: "https://example.com/gateway/",
    });
    await client.claims.claim(request);
    expect(fetchMock.mock.calls[0]![0]).toBe("https://example.com/gateway/v1/claims");
  });

  it("never exposes the secret on the client object", () => {
    const { client } = clientWith([jsonResponse(201, claimedBody)]);
    expect(JSON.stringify(client)).not.toContain(SECRET);
    expect(Object.isFrozen(client)).toBe(true);
  });
});

describe("claims.claim — the wallet hint", () => {
  it("asks without the wallet first, so a wrong pick cannot hide the payment", async () => {
    const { client, fetchMock } = clientWith([jsonResponse(404, refusal("not_found"))]);

    await client.claims.claim({ ...request, platform: "nagad" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(bodyOf(fetchMock.mock.calls[0]!)).not.toHaveProperty("platform");
  });

  it("resends once with the wallet when the ID is ambiguous, with the same key", async () => {
    const { client, fetchMock } = clientWith([
      jsonResponse(409, refusal("ambiguous_trx")),
      jsonResponse(201, { ...claimedBody, platform: "nagad" }),
    ]);

    await expect(client.claims.claim({ ...request, platform: "nagad" })).resolves.toMatchObject({
      outcome: "CLAIMED",
      platform: "nagad",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(bodyOf(fetchMock.mock.calls[1]!)).toMatchObject({
      platform: "nagad",
      idempotencyKey: "SB-10482:1",
    });
  });

  it("stays REJECTED on an ambiguous ID when no wallet was given", async () => {
    const { client, fetchMock } = clientWith([jsonResponse(409, refusal("ambiguous_trx"))]);

    await expect(client.claims.claim(request)).resolves.toMatchObject({
      outcome: "REJECTED",
      rejection: "AMBIGUOUS",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("claims.claim — failures never throw", () => {
  it("turns a network failure into UNAVAILABLE", async () => {
    const { client } = clientWith([new TypeError("fetch failed")], { maxRetries: 0 });
    await expect(client.claims.claim(request)).resolves.toMatchObject({ outcome: "UNAVAILABLE" });
  });

  it("turns a timeout into UNAVAILABLE and says so", async () => {
    const { client } = clientWith(
      [new DOMException("The operation timed out.", "TimeoutError")],
      { maxRetries: 0, timeoutMs: 5000 },
    );
    const outcome = await client.claims.claim(request);
    expect(outcome).toMatchObject({ outcome: "UNAVAILABLE" });
    expect(outcome.outcome === "UNAVAILABLE" && outcome.reason).toMatch(/5000 ms/);
  });

  it("refuses to send a claim with no transaction ID, amount or key", async () => {
    const { client, fetchMock, logger } = clientWith([jsonResponse(201, claimedBody)]);

    for (const bad of [
      { ...request, trxId: " - " },
      { ...request, expectedPoisha: 0 },
      { ...request, expectedPoisha: 12.5 },
      { ...request, expectedPoisha: "1250" as unknown as number },
      { ...request, idempotencyKey: " " },
      { ...request, idempotencyKey: "x".repeat(201) },
      { ...request, platform: "upay" as never },
    ]) {
      await expect(client.claims.claim(bad)).resolves.toMatchObject({ outcome: "MISCONFIGURED" });
    }

    expect(fetchMock).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalled();
  });

  it("survives a fetch that returns garbage", async () => {
    const { client } = clientWith([new Response("<html>oops</html>", { status: 502 })], {
      maxRetries: 0,
    });
    await expect(client.claims.claim(request)).resolves.toMatchObject({ outcome: "UNAVAILABLE" });
  });
});

describe("claims.claim — in-call retries", () => {
  it("retries a 5xx with the same body, then succeeds", async () => {
    const { client, fetchMock } = clientWith([
      jsonResponse(503, {}),
      jsonResponse(200, claimedBody),
    ]);

    await expect(client.claims.claim(request)).resolves.toMatchObject({
      outcome: "CLAIMED",
      replay: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]![1].body).toBe(fetchMock.mock.calls[0]![1].body);
  });

  it("retries a network error up to maxRetries", async () => {
    const { client, fetchMock } = clientWith([new TypeError("fetch failed")], { maxRetries: 2 });
    await expect(client.claims.claim(request)).resolves.toMatchObject({ outcome: "UNAVAILABLE" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not retry a rate limit inside the call", async () => {
    const { client, fetchMock } = clientWith(
      [jsonResponse(429, refusal("rate_limited", { retryAfter: 7 }), { "retry-after": "7" })],
      { maxRetries: 3 },
    );
    await expect(client.claims.claim(request)).resolves.toMatchObject({
      outcome: "UNAVAILABLE",
      retryAfterSeconds: 7,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    [404, refusal("not_found")],
    [409, refusal("already_claimed")],
    [422, refusal("amount_mismatch", { expected: 1250, actual: 900 })],
    [401, refusal("unauthenticated")],
  ])("does not retry a verdict (%i)", async (status, body) => {
    const { client, fetchMock } = clientWith([jsonResponse(status, body)], { maxRetries: 3 });
    await client.claims.claim(request);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("stops retrying when the time budget is spent", async () => {
    const { client, fetchMock } = clientWith([new TypeError("fetch failed")], {
      maxRetries: 10,
      totalBudgetMs: 1_200,
    });
    await client.claims.claim(request);
    // The 250ms wait leaves 950ms for a second attempt; after it, a 750ms
    // wait would leave under the 250ms minimum, so the call gives up.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("createGatewayClient — an environment with no gateway", () => {
  it("claims nothing and answers UNAVAILABLE, never a grant", async () => {
    const fetchMock = vi.fn();
    const client = createGatewayClient({
      baseUrl: undefined,
      clientId: "",
      secret: undefined,
      fetch: fetchMock,
    });

    expect(client.enabled).toBe(false);
    await expect(client.claims.claim(request)).resolves.toMatchObject({ outcome: "UNAVAILABLE" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
