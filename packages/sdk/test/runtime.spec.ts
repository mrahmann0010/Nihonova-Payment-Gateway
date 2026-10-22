import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type ClaimRequest, createGatewayClient, GatewayConfigError, VERSION } from "../src";
import { WHITESPACE } from "../src/contract/spec.generated";
import { claimedOutcome, createFakeGatewayClient } from "../src/testing";
import { loadSpecFile } from "./vectors/load";

/* --------------------------------------------------------------------------
   What only exists in JavaScript. Everything shared is in vectors.spec.ts.
   -------------------------------------------------------------------------- */

const SECRET = "s3cret.with.dots";
const good = { baseUrl: "https://gateway.example", clientId: "sakura-book", secret: SECRET };
const request = loadSpecFile<{ baseRequest: ClaimRequest }>("vectors/claims.json").baseRequest;

describe("the shared spec matches JavaScript", () => {
  it("spec.whitespace is exactly what String.prototype.trim removes", () => {
    const trimmed: string[] = [];
    for (let code = 0; code <= 0xffff; code++) {
      const c = String.fromCharCode(code);
      if (`${c}x${c}`.trim() === "x") trimmed.push(c);
    }
    expect(trimmed.join("")).toBe(WHITESPACE);
  });

  it("the package version is the spec version", () => {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    expect(pkg.version).toBe(VERSION);
  });
});

describe("createGatewayClient", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("refuses to run in a browser", () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("document", {});
    expect(() => createGatewayClient({ ...good, fetch: vi.fn() })).toThrow(/server-side only/);
  });

  it("needs a fetch", () => {
    vi.stubGlobal("fetch", undefined);
    expect(() => createGatewayClient(good)).toThrow(/No fetch available/);
  });

  it("needs a config object", () => {
    expect(() => createGatewayClient(undefined as never)).toThrow(GatewayConfigError);
  });

  it("never exposes the secret on the client object", () => {
    const client = createGatewayClient({ ...good, fetch: vi.fn() });
    expect(JSON.stringify(client)).not.toContain(SECRET);
    expect(Object.isFrozen(client)).toBe(true);
  });

  it("does not put the secret in an error message", () => {
    expect(() => createGatewayClient({ ...good, baseUrl: "http://gateway.example", fetch: vi.fn() })).toThrow(
      expect.objectContaining({ message: expect.not.stringContaining("s3cret") }),
    );
  });
});

describe("claims.claim", () => {
  it("keeps its never-throws promise against a bug inside the SDK", async () => {
    const logger = { error: vi.fn() };
    const client = createGatewayClient(
      { ...good, logger, fetch: async () => new Response("{}", { status: 503 }) },
      {
        retryDeps: {
          now: () => 0,
          random: () => 0.5,
          sleep: async () => {
            throw new Error("boom");
          },
        },
      },
    );
    await expect(client.claims.claim(request)).resolves.toEqual({
      outcome: "UNAVAILABLE",
      reason: "Unexpected error: Error: boom",
    });
    expect(logger.error).toHaveBeenCalledWith("Payment gateway claim failed unexpectedly: Error: boom");
  });
});

describe("the request", () => {
  it("does not follow redirects", async () => {
    const fetch = vi.fn(async (_url: string, _init: RequestInit) => new Response("{}", { status: 404 }));
    await createGatewayClient({ ...good, fetch }).claims.claim(request);
    expect(fetch.mock.calls[0]![1]).toMatchObject({ method: "POST", redirect: "manual" });
  });
});

describe("createFakeGatewayClient", () => {
  it("answers per request when given a function", async () => {
    const gateway = createFakeGatewayClient((req, call) =>
      req.trxId === "USED" ? { outcome: "ALREADY_CLAIMED", claimedAt: null } : claimedOutcome({ replay: call > 1 }),
    );
    expect((await gateway.claims.claim({ ...request, trxId: "USED" })).outcome).toBe("ALREADY_CLAIMED");
    expect(await gateway.claims.claim(request)).toMatchObject({ outcome: "CLAIMED", replay: true });
    expect(gateway.calls.map((c) => c.trxId)).toEqual(["USED", "8F3K2M9X01"]);
  });
});
