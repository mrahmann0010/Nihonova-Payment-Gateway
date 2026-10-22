import { describe, expect, it } from "vitest";
import {
  claimKeyFor,
  createGatewayClient,
  firstClaimKey,
  isRetryable,
  nextClaimKey,
  nextRetryDelaySeconds,
  normaliseTrxId,
  poishaToTaka,
  takaToPoisha,
  type ClaimOutcome,
  type GatewayClientConfig,
} from "../src";
import { resolveConfig } from "../src/config";
import { parseIsoDate } from "../src/helpers/dates";
import { interpretClaimResponse, toClaimBody } from "../src/resources/claims/interpret";
import { requestProblem } from "../src/resources/claims/validate";
import { claimedOutcome, createFakeGatewayClient } from "../src/testing";
import { parseRetryAfter } from "../src/transport/http";
import { backoffMs, type RetryDeps } from "../src/transport/retry";
import { asJson, expand, loadSpecFile, patched } from "./vectors/load";

/* --------------------------------------------------------------------------
   packages/sdk-spec/vectors — the behaviour every SDK shares. Nothing here is
   specific to TypeScript; a case that fails here would fail the Python SDK
   too, or should. TypeScript-only behaviour is in runtime.spec.ts.
   -------------------------------------------------------------------------- */

type Case = Record<string, any>;

const spec = loadSpecFile<Case>("spec.json");
const helpers = loadSpecFile<Case>("vectors/helpers.json");
const claims = loadSpecFile<Case>("vectors/claims.json");
const config = loadSpecFile<Case>("vectors/config.json");
const client = loadSpecFile<Case>("vectors/client.json");
const testing = loadSpecFile<Case>("vectors/testing.json");

/** Rows for it.each: a readable title, then the case. */
const cases = (list: Case[]): Array<[string, Case]> =>
  list.map((c, i) => [c.name ?? `#${i} ${JSON.stringify(c).slice(0, 90)}`, c]);

/** Run `fn`, returning its result or `{ throws: message }`. */
function attempt<T>(fn: () => T): T | { throws: string } {
  try {
    return fn();
  } catch (error) {
    return { throws: (error as Error).message };
  }
}

describe("helpers", () => {
  it.each(cases(helpers.normaliseTrxId))("normaliseTrxId %s", (_, c) => {
    expect(normaliseTrxId(c.input)).toBe(c.expected);
  });

  it.each(cases(helpers.takaToPoisha))("takaToPoisha %s", (_, c) => {
    expect(takaToPoisha(c.input)).toBe(c.expected);
  });

  it.each(cases(helpers.poishaToTaka))("poishaToTaka %s", (_, c) => {
    expect(poishaToTaka(c.input)).toBe(c.expected);
  });

  it.each(cases(helpers.firstClaimKey))("firstClaimKey %s", (_, c) => {
    const got = attempt(() => firstClaimKey(expand(c.orderRef)));
    expect(got).toEqual("throws" in c ? { throws: expand(c.throws) } : expand(c.expected));
  });

  it.each(cases(helpers.claimKeyFor))("claimKeyFor %s", (_, c) => {
    expect(claimKeyFor(c.orderRef, c.stored)).toBe(c.expected);
  });

  it.each(cases(helpers.nextClaimKey))("nextClaimKey %s", (_, c) => {
    const got = attempt(() => nextClaimKey(c.orderRef, c.current));
    expect(got).toEqual("throws" in c ? { throws: c.throws } : c.expected);
  });

  it.each(cases(helpers.nextRetryDelaySeconds))(
    "nextRetryDelaySeconds %s",
    (_, c) => {
      expect(nextRetryDelaySeconds(c.attempts, c.granted, c.retryAfterSeconds)).toBe(c.expected);
    },
  );

  it.each(cases(helpers.isRetryable))("isRetryable %s", (_, c) => {
    expect(isRetryable({ outcome: c.outcome } as ClaimOutcome)).toBe(c.expected);
  });

  it.each(cases(helpers.parseRetryAfter))("parseRetryAfter %s", (_, c) => {
    expect(parseRetryAfter(c.header, c.nowMs) ?? null).toBe(c.expected);
  });

  it.each(cases(helpers.backoffMs))("backoffMs %s", (_, c) => {
    expect(backoffMs(c.retry, () => c.random)).toBe(c.expected);
  });

  it.each(cases(helpers.parseIsoDate))("parseIsoDate %s", (_, c) => {
    expect(parseIsoDate(c.input)?.toISOString() ?? null).toBe(c.expected);
  });
});

describe("claims: request", () => {
  it.each(cases(claims.requestProblem))("requestProblem: %s", (_, c) => {
    expect(requestProblem(patched(claims.baseRequest, c.patch))).toBe(c.expected);
  });

  it.each(cases(claims.toClaimBody))("toClaimBody: %s", (_, c) => {
    const body = toClaimBody(patched(claims.baseRequest, c.patch));
    expect(body).toEqual(c.expected);
    // Same keys in the same order as every other SDK sends them.
    expect(Object.keys(body)).toEqual(Object.keys(c.expected));
  });
});

describe("claims: interpret", () => {
  it.each(cases(claims.interpret))("%s", (_, c) => {
    const body = "bodyPatch" in c ? patched(claims.claimedBody, c.bodyPatch) : c.body;
    const logs: string[] = [];
    const outcome = interpretClaimResponse(c.status, body, c.expectedPoisha, {
      ...(c.retryAfterSeconds !== undefined ? { retryAfterSeconds: c.retryAfterSeconds } : {}),
      ...(c.acceptShortfall !== undefined ? { acceptShortfall: c.acceptShortfall } : {}),
      onUnexpected: (m) => logs.push(m),
    });
    expect(asJson(outcome)).toEqual(c.outcome);
    expect(logs).toEqual(c.logs);
  });

  it("covers every published reason code", () => {
    const covered = new Set(
      claims.interpret
        .filter((c: Case) => c.status < 500 && c.body && typeof c.body.reason === "string")
        .map((c: Case) => c.body.reason),
    );
    expect(spec.reasons.filter((r: string) => !covered.has(r))).toEqual([]);
  });
});

describe("config", () => {
  it.each(cases(config.cases))("%s", (_, c) => {
    const input = { ...patched(config.baseConfig, c.config), fetch: async () => new Response() };
    const got = attempt(() => resolveConfig(input as GatewayClientConfig));

    if ("error" in c) {
      expect(got).toEqual({ throws: c.error });
    } else if ("resolved" in c) {
      const { fetch: _f, logger: _l, ...rest } = got as Record<string, unknown>;
      expect(rest).toEqual(c.resolved);
    } else {
      expect((got as { claimsUrl?: string }).claimsUrl).toBe(c.claimsUrl);
    }
  });
});

describe("claims.claim over a scripted transport", () => {
  const refs = { claimedBody: client.claimedBody, sentBody: client.sentBody };

  it.each(cases(client.scenarios))("%s", async (_, c) => {
    const exchanges = expand(c.exchanges, refs) as Case[];
    let now = 0;
    const sleeps: number[] = [];
    const deps: RetryDeps = {
      now: () => now,
      sleep: async (ms) => {
        sleeps.push(ms);
        now += ms;
      },
      random: () => c.random ?? 0.5,
    };

    const calls: Array<{ url: string; init: RequestInit }> = [];
    let i = 0;
    const fetch = async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      const ex = exchanges[Math.min(i++, exchanges.length - 1)]!;
      now += ex.takesMs ?? 0;
      if (ex.networkError) throw new TypeError(ex.networkError);
      if (ex.timeout) throw new DOMException("The operation timed out.", "TimeoutError");
      return new Response(ex.bodyText ?? JSON.stringify(ex.body), {
        status: ex.status,
        headers: { "content-type": "application/json", ...ex.headers },
      });
    };

    const logs: string[] = [];
    const gateway = createGatewayClient(
      { ...patched(client.baseConfig, c.config), fetch, logger: { error: (m: string) => logs.push(m) } },
      { retryDeps: deps },
    );

    const outcome = await gateway.claims.claim(patched(client.baseRequest, c.request, refs));

    expect(asJson(outcome)).toEqual(c.outcome);
    expect(sleeps).toEqual(c.sleeps);
    expect(logs).toEqual(c.logs);

    if ("callCount" in c) expect(calls).toHaveLength(c.callCount);
    if ("calls" in c) {
      const expected = expand(c.calls, refs) as Case[];
      expect(calls).toHaveLength(expected.length);
      expected.forEach((want, n) => {
        const { url, init } = calls[n]!;
        if (want.url) expect(url).toBe(want.url);
        if (want.method) expect(init.method).toBe(want.method);
        const headers = Object.fromEntries(
          Object.entries(init.headers as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v]),
        );
        for (const [name, value] of Object.entries(want.headers ?? {})) expect(headers[name]).toBe(value);
        expect(JSON.parse(init.body as string)).toEqual(want.body);
      });
    }
  });
});

describe("testing", () => {
  it.each(cases(testing.fakeClient))("fake client: %s", async (_, c) => {
    const respond = expand(c.respond, { claimedOutcome: "@claimed" }).map((o: unknown) =>
      o === "@claimed" ? claimedOutcome() : o,
    );
    const gateway = createFakeGatewayClient(respond, c.options ?? {});
    const base = loadSpecFile<Case>("vectors/claims.json").baseRequest;

    const outcomes = [];
    for (let n = 0; n < c.claims; n++) outcomes.push(asJson(await gateway.claims.claim(base)));

    expect(outcomes).toEqual(c.outcomes);
    expect(gateway.enabled).toBe(c.enabled);
    expect(gateway.clientId ?? null).toBe(c.clientId);
    expect(gateway.calls).toHaveLength(c.claims);
  });

  it.each(cases(testing.claimedOutcome))("claimedOutcome: %s", (_, c) => {
    expect(asJson(claimedOutcome(c.overrides))).toEqual(c.expected);
  });
});
