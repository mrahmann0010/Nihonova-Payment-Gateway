#!/usr/bin/env node
/* --------------------------------------------------------------------------
   A real gateway for the contract suites of BOTH SDKs: apps/server, started as
   a child process against a throwaway database on the local Docker MongoDB.

     node packages/sdk-spec/contract/harness.mjs

   It seeds the clients and payments from scenarios.json, then prints ONE line
   of JSON on stdout and waits:

     {"baseUrl": "...", "controlUrl": "...", "deadUrl": "...", "secrets": {...}}

   A test runner in any language reads that line, runs scenarios.json through
   its SDK, and drives the rest over plain HTTP on `controlUrl` (loopback only):

     POST /seed/payments  [{platform, trxId, amount, sender?, daysAgo?}]
     POST /release        {trxId, reason}  →  {status}
     POST /stop           drops the database and exits

   The harness also stops if stdin closes, so a crashed runner can't leave a
   server behind.

   Seeding goes through the server's OWN mongoose models, so the indexes the
   single-use rule depends on (claims.trxId partial-unique, the idempotency key
   index) are exactly the production ones — a hand-rolled seed could pass with
   an index that isn't there.

   The database is dropped before and after every run, so the guard below
   refuses any database but this one, on any host but loopback. The local
   `primary-data` copy of real payments is never touched.
   -------------------------------------------------------------------------- */

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer as createHttpServer } from "node:http";
import { createRequire } from "node:module";
import { createServer as createNetServer } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = resolve(HERE, "../../../apps/server");
const SCENARIOS = JSON.parse(readFileSync(resolve(HERE, "scenarios.json"), "utf8"));

const CONTRACT_DB = "sakura-pay-contract";
const MONGO_HOST = process.env.CONTRACT_MONGO_HOST ?? "127.0.0.1:27017";
const MONGO_URI = `mongodb://${MONGO_HOST}/${CONTRACT_DB}`;
const ADMIN_TOKEN = `contract-admin-${randomBytes(8).toString("hex")}`;

// Server modules, loaded with the server's own dependencies (CommonJS).
const serverRequire = createRequire(resolve(SERVER_DIR, "package.json"));
const mongoose = serverRequire("mongoose");
const models = {
  Client: serverRequire("./src/models/Client.js"),
  Claim: serverRequire("./src/models/Claim.js"),
  bkash: serverRequire("./src/models/Bkash.js"),
  nagad: serverRequire("./src/models/Nagad.js"),
  rocket: serverRequire("./src/models/Rocket.js"),
};
const { hashSecret } = serverRequire("./src/services/clientSecret.js");

/** A secret that clears the server's entropy floor (services/clientSecret.js). */
function makeSecret() {
  return `Ct-${randomBytes(24).toString("base64url")}9a`;
}

// --- database ---

async function connectDb() {
  await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 3_000 });
  await dropContractDb();
  // Build every index before the first claim; the single-use rule IS an index.
  await Promise.all(Object.values(models).map((m) => m.init()));
}

async function dropContractDb() {
  const db = mongoose.connection.db;
  if (!db || db.databaseName !== CONTRACT_DB || !/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(MONGO_HOST)) {
    throw new Error(`Refusing to drop ${db?.databaseName ?? "?"} on ${MONGO_HOST}`);
  }
  await db.dropDatabase();
}

async function seedClients(clients) {
  const secrets = {};
  for (const c of clients) {
    const secret = makeSecret();
    secrets[c.clientId] = secret;
    await models.Client.create({
      clientId: c.clientId,
      name: `Contract ${c.clientId}`,
      active: c.active ?? true,
      requireSenderMatch: c.requireSenderMatch ?? false,
      maxClaimAmount: c.maxClaimAmount ?? null,
      claimWindowDays: c.claimWindowDays ?? null,
      secretHash: hashSecret(secret),
      createdBy: "contract-test",
    });
  }
  return secrets;
}

async function seedPayments(payments) {
  for (const p of payments) {
    await models[p.platform].create({
      trxId: p.trxId,
      amount: p.amount,
      sender: p.sender ?? "01700000000",
      balance: 100_000,
      dateReceived: new Date(Date.now() - (p.daysAgo ?? 0) * 86_400_000),
      rawMessage: "contract-test",
    });
  }
}

/** Release a claim the way an admin does: the real route, behind requireAdmin + csrfGuard. */
async function adminRelease(baseUrl, trxId, reason) {
  const claim = await models.Claim.findOne({ trxId, state: "claimed" }).lean();
  if (!claim) throw new Error(`No live claim for ${trxId}`);
  const res = await fetch(`${baseUrl}/admin/api/claims/${String(claim._id)}/release`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-admin-token": ADMIN_TOKEN,
      "X-Requested-With": "nihonova-admin",
    },
    body: JSON.stringify({ reason }),
  });
  return res.status;
}

// --- the gateway process ---

function freePort() {
  return new Promise((done, fail) => {
    const srv = createNetServer();
    srv.unref();
    srv.on("error", fail);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => done(port));
    });
  });
}

async function startGateway() {
  const port = await freePort();
  const logs = [];

  const child = spawn(process.execPath, ["src/server.js"], {
    cwd: SERVER_DIR,
    // Set explicitly: dotenv never overrides a variable that is already set, so
    // apps/server/.env (and its MONGO_URI) cannot leak into the test server.
    env: {
      PATH: process.env.PATH ?? "",
      NODE_ENV: "development",
      PORT: String(port),
      MONGO_URI,
      ADMIN_TOKEN,
      WEBHOOK_SECRET: `contract-webhook-${randomBytes(8).toString("hex")}`,
      JWT_SECRET: `contract-jwt-${randomBytes(8).toString("hex")}`,
      CORS_ORIGIN: "http://localhost",
      CLAIM_RATE_LIMIT: String(SCENARIOS.claimRateLimit),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (d) => logs.push(String(d)));
  child.stderr.on("data", (d) => logs.push(String(d)));

  const baseUrl = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Gateway exited with ${child.exitCode}:\n${logs.join("")}`);
    try {
      const res = await fetch(`${baseUrl}/health`);
      if (res.ok && (await res.json()).db === "connected") {
        return {
          baseUrl,
          stop: () =>
            new Promise((done) => {
              if (child.exitCode !== null) return done();
              child.once("exit", () => done());
              child.kill("SIGTERM");
              setTimeout(() => child.kill("SIGKILL"), 5_000).unref();
            }),
        };
      }
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  child.kill("SIGKILL");
  throw new Error(`Gateway did not become healthy:\n${logs.join("")}`);
}

// --- control channel ---

async function main() {
  await connectDb();
  const secrets = await seedClients(SCENARIOS.clients);
  await seedPayments(SCENARIOS.payments);
  const gateway = await startGateway();
  const deadUrl = `http://127.0.0.1:${await freePort()}`;

  let stopping = null;
  const stop = () =>
    (stopping ??= (async () => {
      await gateway.stop();
      try {
        await dropContractDb();
      } finally {
        await mongoose.disconnect();
      }
    })());

  const control = createHttpServer(async (req, res) => {
    const reply = (status, body) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    try {
      let raw = "";
      for await (const chunk of req) raw += chunk;
      const body = raw ? JSON.parse(raw) : null;

      if (req.method === "POST" && req.url === "/seed/payments") {
        await seedPayments(body);
        return reply(200, { ok: true });
      }
      if (req.method === "POST" && req.url === "/release") {
        return reply(200, { status: await adminRelease(gateway.baseUrl, body.trxId, body.reason) });
      }
      if (req.method === "POST" && req.url === "/stop") {
        await stop();
        reply(200, { ok: true });
        res.on("finish", () => process.exit(0));
        return;
      }
      reply(404, { error: `no route ${req.method} ${req.url}` });
    } catch (error) {
      reply(500, { error: String(error?.stack ?? error) });
    }
  });

  await new Promise((done) => control.listen(0, "127.0.0.1", done));
  const controlUrl = `http://127.0.0.1:${control.address().port}`;

  // A runner that dies without calling /stop closes our stdin.
  process.stdin.on("end", async () => {
    await stop();
    process.exit(0);
  });
  process.stdin.resume();
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, async () => {
      await stop();
      process.exit(1);
    });
  }

  process.stdout.write(`${JSON.stringify({ baseUrl: gateway.baseUrl, controlUrl, deadUrl, secrets })}\n`);
}

main().catch(async (error) => {
  process.stderr.write(`${error?.stack ?? error}\n`);
  try {
    await mongoose.disconnect();
  } catch {
    // already gone
  }
  process.exit(1);
});
