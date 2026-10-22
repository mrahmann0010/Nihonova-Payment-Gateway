import { type ChildProcess, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/* --------------------------------------------------------------------------
   A real gateway for the contract suite: apps/server, started as a child
   process against a throwaway database on the local Docker MongoDB.

   Seeding goes through the server's OWN mongoose models, so the indexes the
   single-use rule depends on (claims.trxId partial-unique, the idempotency
   key index) are exactly the production ones — a hand-rolled seed could
   pass with an index that isn't there.

   The database is dropped before and after every run, so the guard below
   refuses any database but this one, on any host but loopback. The local
   `primary-data` copy of real payments is never touched.
   -------------------------------------------------------------------------- */

const HERE = dirname(fileURLToPath(import.meta.url));
export const SERVER_DIR = resolve(HERE, "../../../../apps/server");

export const CONTRACT_DB = "sakura-pay-contract";
const MONGO_HOST = process.env.CONTRACT_MONGO_HOST ?? "127.0.0.1:27017";
const MONGO_URI = `mongodb://${MONGO_HOST}/${CONTRACT_DB}`;

export const ADMIN_TOKEN = `contract-admin-${randomBytes(8).toString("hex")}`;
/**
 * Per client per minute. Low enough that the rate-limit test is quick, high
 * enough that `contract-a` — which makes ~25 claims in the run — never trips it.
 */
export const CLAIM_RATE_LIMIT = 60;

// Server modules, loaded with the server's own dependencies (CommonJS).
const serverRequire = createRequire(resolve(SERVER_DIR, "package.json"));
type Model = {
  create(doc: unknown): Promise<{ _id: unknown }>;
  insertMany(docs: unknown[]): Promise<unknown>;
  findOne(filter: unknown): { lean(): Promise<Record<string, unknown> | null> };
  init(): Promise<void>;
};
const mongoose = serverRequire("mongoose") as {
  connect(uri: string, opts?: unknown): Promise<unknown>;
  disconnect(): Promise<void>;
  connection: { db?: { databaseName: string; dropDatabase(): Promise<unknown> } };
};
export const models = {
  Client: serverRequire("./src/models/Client.js") as Model,
  Claim: serverRequire("./src/models/Claim.js") as Model,
  bkash: serverRequire("./src/models/Bkash.js") as Model,
  nagad: serverRequire("./src/models/Nagad.js") as Model,
  rocket: serverRequire("./src/models/Rocket.js") as Model,
};
const { hashSecret } = serverRequire("./src/services/clientSecret.js") as {
  hashSecret(secret: string): string;
};

/** A secret that clears the server's entropy floor (services/clientSecret.js). */
export function makeSecret(): string {
  return `Ct-${randomBytes(24).toString("base64url")}9a`;
}

export type SeedClient = {
  clientId: string;
  secret: string;
  active?: boolean;
  requireSenderMatch?: boolean;
  maxClaimAmount?: number | null;
  claimWindowDays?: number | null;
};

export type SeedPayment = {
  platform: "bkash" | "nagad" | "rocket";
  trxId: string;
  amount: number;
  sender?: string;
  daysAgo?: number;
};

export async function connectDb(): Promise<void> {
  await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 3_000 });
  await dropContractDb();
  // Build every index before the first claim; the single-use rule IS an index.
  await Promise.all(Object.values(models).map((m) => m.init()));
}

export async function dropContractDb(): Promise<void> {
  const db = mongoose.connection.db;
  if (!db || db.databaseName !== CONTRACT_DB || !/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(MONGO_HOST)) {
    throw new Error(`Refusing to drop ${db?.databaseName ?? "?"} on ${MONGO_HOST}`);
  }
  await db.dropDatabase();
}

export async function disconnectDb(): Promise<void> {
  try {
    await dropContractDb();
  } finally {
    await mongoose.disconnect();
  }
}

export async function seedClients(clients: SeedClient[]): Promise<void> {
  for (const c of clients) {
    await models.Client.create({
      clientId: c.clientId,
      name: `Contract ${c.clientId}`,
      active: c.active ?? true,
      requireSenderMatch: c.requireSenderMatch ?? false,
      maxClaimAmount: c.maxClaimAmount ?? null,
      claimWindowDays: c.claimWindowDays ?? null,
      secretHash: hashSecret(c.secret),
      createdBy: "contract-test",
    });
  }
}

export async function seedPayments(payments: SeedPayment[]): Promise<void> {
  for (const p of payments) {
    const received = new Date(Date.now() - (p.daysAgo ?? 0) * 86_400_000);
    await models[p.platform].create({
      trxId: p.trxId,
      amount: p.amount,
      sender: p.sender ?? "01700000000",
      balance: 100_000,
      dateReceived: received,
      rawMessage: "contract-test",
    });
  }
}

// --- the server process ---

export type RunningServer = { baseUrl: string; port: number; logs: string[]; stop(): Promise<void> };

export async function startServer(): Promise<RunningServer> {
  const port = await freePort();
  const logs: string[] = [];

  const child: ChildProcess = spawn(process.execPath, ["src/server.js"], {
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
      CLAIM_RATE_LIMIT: String(CLAIM_RATE_LIMIT),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout?.on("data", (d) => logs.push(String(d)));
  child.stderr?.on("data", (d) => logs.push(String(d)));

  const baseUrl = `http://127.0.0.1:${port}`;
  await waitForHealth(baseUrl, child, logs);

  return {
    baseUrl,
    port,
    logs,
    stop: () =>
      new Promise<void>((done) => {
        if (child.exitCode !== null) return done();
        child.once("exit", () => done());
        child.kill("SIGTERM");
        setTimeout(() => child.kill("SIGKILL"), 5_000).unref();
      }),
  };
}

async function waitForHealth(baseUrl: string, child: ChildProcess, logs: string[]): Promise<void> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Gateway exited with ${child.exitCode}:\n${logs.join("")}`);
    }
    try {
      const res = await fetch(`${baseUrl}/health`);
      if (res.ok && ((await res.json()) as { db?: string }).db === "connected") return;
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  child.kill("SIGKILL");
  throw new Error(`Gateway did not become healthy:\n${logs.join("")}`);
}

export function freePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const srv = createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      srv.close(() => resolvePort(port));
    });
  });
}

/** Release a claim the way an admin does: the real route, behind requireAdmin + csrfGuard. */
export async function adminRelease(baseUrl: string, trxId: string, reason: string): Promise<number> {
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
