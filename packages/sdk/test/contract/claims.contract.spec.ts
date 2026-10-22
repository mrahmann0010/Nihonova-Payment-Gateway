import { type ChildProcess, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { createInterface } from "node:readline";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type ClaimRequest, type GatewayClient, createGatewayClient } from "../../src";
import { SPEC_DIR, asJson, loadSpecFile } from "../vectors/load";

/* --------------------------------------------------------------------------
   The SDK against the real gateway: packages/sdk-spec/contract/scenarios.json,
   which the Python SDK runs too.

   Unit vectors prove the SDK reads the responses it was told about. These
   prove the server still sends them. If a /v1 change and the SDKs drift
   apart, this is the suite that fails.
   -------------------------------------------------------------------------- */

type Json = any;
type Ready = { baseUrl: string; controlUrl: string; deadUrl: string; secrets: Record<string, string> };

const scenarios = loadSpecFile<Json>("contract/scenarios.json");

let harness: ChildProcess;
let ready: Ready;
const clients: Record<string, GatewayClient> = {};

async function control(path: string, body: unknown): Promise<Json> {
  const res = await fetch(`${ready.controlUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`harness ${path}: ${json.error}`);
  return json;
}

function startHarness(): Promise<Ready> {
  harness = spawn(process.execPath, [resolve(SPEC_DIR, "contract/harness.mjs")], {
    stdio: ["pipe", "pipe", "pipe"],
  });
  const errors: string[] = [];
  harness.stderr!.on("data", (d) => errors.push(String(d)));

  return new Promise((done, fail) => {
    const lines = createInterface({ input: harness.stdout! });
    lines.once("line", (line) => done(JSON.parse(line)));
    harness.once("exit", (code) => fail(new Error(`harness exited with ${code}:\n${errors.join("")}`)));
  });
}

function connect(spec: Json): GatewayClient {
  const secret =
    spec.secret === "$fresh"
      ? `Ct-${randomBytes(24).toString("base64url")}9a`
      : ready.secrets[spec.secretOf ?? spec.clientId]!;
  const baseUrl = spec.baseUrl === "$dead" ? ready.deadUrl : `${ready.baseUrl}${spec.pathSuffix ?? ""}`;
  return createGatewayClient({
    baseUrl,
    clientId: spec.clientId,
    secret,
    ...(spec.timeoutMs ? { timeoutMs: spec.timeoutMs } : {}),
    ...(spec.totalBudgetMs ? { totalBudgetMs: spec.totalBudgetMs } : {}),
  });
}

function claimRequest(step: Json): ClaimRequest {
  return {
    trxId: step.trxId,
    expectedPoisha: step.poisha ?? step.taka * 100,
    idempotencyKey: step.key,
    orderRef: step.key.split(":")[0],
    ...(step.platform ? { platform: step.platform } : {}),
    ...(step.senderPhone ? { senderPhone: step.senderPhone } : {}),
    ...(step.acceptShortfall ? { acceptShortfall: true } : {}),
  };
}

const claim = async (step: Json) => asJson(await clients[step.as]!.claims.claim(claimRequest(step)));

/** Partial match with the scenario matchers; returns what differs. */
function mismatches(actual: Json, expected: Json, path = "outcome"): string[] {
  if (expected && typeof expected === "object" && !Array.isArray(expected)) {
    if ("$isDate" in expected) {
      return typeof actual === "string" && !Number.isNaN(Date.parse(actual)) ? [] : [`${path}: ${actual} is not a date`];
    }
    if ("$matches" in expected) {
      return typeof actual === "string" && new RegExp(expected.$matches).test(actual)
        ? []
        : [`${path}: ${JSON.stringify(actual)} does not match /${expected.$matches}/`];
    }
    if ("$between" in expected) {
      const [lo, hi] = expected.$between;
      return typeof actual === "number" && actual >= lo && actual <= hi ? [] : [`${path}: ${actual} not in [${lo}, ${hi}]`];
    }
    if (!actual || typeof actual !== "object") return [`${path}: expected an object, got ${JSON.stringify(actual)}`];
    return Object.entries(expected).flatMap(([k, v]) => mismatches(actual[k], v, `${path}.${k}`));
  }
  return JSON.stringify(actual) === JSON.stringify(expected)
    ? []
    : [`${path}: ${JSON.stringify(actual)} ≠ ${JSON.stringify(expected)}`];
}

const check = (actual: Json, expected: Json) => expect(mismatches(actual, expected), JSON.stringify(actual)).toEqual([]);

async function runStep(step: Json): Promise<void> {
  if (step.claim) {
    const outcome = await claim(step.claim);
    if (step.expect) check(outcome, step.expect);
    if (step.expectExactly) expect(outcome).toEqual(step.expectExactly);
  } else if (step.seedPayments) {
    await control("/seed/payments", step.seedPayments);
  } else if (step.release) {
    expect((await control("/release", step.release)).status).toBe(step.expectStatus);
  } else if (step.parallel) {
    const outcomes = await Promise.all(step.parallel.map(claim));
    expect(outcomes.map((o) => o.outcome).sort()).toEqual(step.expectOutcomes);
  } else if (step.claimMany) {
    const m = step.claimMany;
    let last: Json;
    for (let i = 0; i < m.times; i++) {
      last = await claim({ as: m.as, trxId: `${m.trxIdPrefix}${i}`, taka: m.taka, key: `${m.keyPrefix}${i}:1` });
    }
    check(last, step.expectLast);
  } else {
    throw new Error(`Unknown scenario step: ${JSON.stringify(step)}`);
  }
}

beforeAll(async () => {
  ready = await startHarness();
  for (const [name, spec] of Object.entries(scenarios.connections)) clients[name] = connect(spec);
}, 30_000);

afterAll(async () => {
  if (!harness || harness.exitCode !== null) return;
  const exited = new Promise((done) => harness.once("exit", done));
  await control("/stop", null).catch(() => harness.kill("SIGTERM"));
  await exited;
}, 15_000);

const groups = new Map<string, Json[]>();
for (const c of scenarios.cases as Json[]) groups.set(c.group, [...(groups.get(c.group) ?? []), c]);

for (const [group, cases] of groups) {
  describe(group, () => {
    for (const c of cases) {
      it(c.name, async () => {
        for (const step of c.steps) await runStep(step);
      });
    }
  });
}
