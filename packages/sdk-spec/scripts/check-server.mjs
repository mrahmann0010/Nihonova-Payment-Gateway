#!/usr/bin/env node
/* --------------------------------------------------------------------------
   The gateway's own trxId rule (apps/server/src/services/trxId.js) against the
   same vectors the SDKs run. If the server and the SDKs ever normalise one
   receipt differently, a claim for a payment that exists comes back
   not_found — so the three are pinned to one table.
   -------------------------------------------------------------------------- */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { normaliseTrxId } = require(resolve(HERE, "../../../apps/server/src/services/trxId.js"));
const { normaliseTrxId: cases } = JSON.parse(readFileSync(resolve(HERE, "../vectors/helpers.json"), "utf8"));

const failures = cases.filter(({ input, expected }) => normaliseTrxId(input) !== expected);
for (const { input, expected } of failures) {
  console.error(`server normaliseTrxId(${JSON.stringify(input)}) = ${JSON.stringify(normaliseTrxId(input))}, expected ${JSON.stringify(expected)}`);
}
if (failures.length) process.exit(1);
console.log(`server trxId rule: ${cases.length} vectors pass.`);
