#!/usr/bin/env node
/* --------------------------------------------------------------------------
   spec.json → the constants file of every SDK.

     node scripts/generate.mjs           write the generated files
     node scripts/generate.mjs --check   fail if any of them is stale

   Generated (never edit by hand):
     packages/sdk/src/contract/spec.generated.ts
     packages/sdk-python/src/sakura_pay/_spec.py
   Synced:
     the "version" field of packages/sdk/package.json
       (the Python package reads its version from _spec.py)

   --check also insists that the shared CHANGELOG has an entry for the version,
   so neither package can be released with an undocumented version.
   -------------------------------------------------------------------------- */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SPEC_DIR = resolve(HERE, "..");
const PACKAGES = resolve(SPEC_DIR, "..");
const REPO = resolve(PACKAGES, "..");

const spec = JSON.parse(readFileSync(resolve(SPEC_DIR, "spec.json"), "utf8"));
const check = process.argv.includes("--check");

const TS_OUT = resolve(PACKAGES, "sdk/src/contract/spec.generated.ts");
const PY_OUT = resolve(PACKAGES, "sdk-python/src/sakura_pay/_spec.py");
const PACKAGE_JSON = resolve(PACKAGES, "sdk/package.json");
const CHANGELOG = resolve(PACKAGES, "sdk/CHANGELOG.md");

const BANNER = "GENERATED from packages/sdk-spec/spec.json by `npm run generate` in packages/sdk-spec. Do not edit.";

// --- literals ---

/** A JSON string with every non-ASCII character escaped, so invisible whitespace stays visible. */
const asciiString = (s) => JSON.stringify(s).replace(/[\u007f-￿]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);

const ts = (value) => JSON.stringify(value, null, 2);

function py(value, indent = 0) {
  const pad = " ".repeat(indent + 4);
  const end = " ".repeat(indent);
  if (value === null) return "None";
  if (value === true) return "True";
  if (value === false) return "False";
  if (typeof value === "number" || typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    if (value.every((v) => typeof v !== "object" || v === null)) {
      return `(${value.map((v) => py(v)).join(", ")}${value.length === 1 ? "," : ""})`;
    }
    return `(\n${value.map((v) => `${pad}${py(v, indent + 4)},`).join("\n")}\n${end})`;
  }
  const entries = Object.entries(value);
  return `{\n${entries.map(([k, v]) => `${pad}${JSON.stringify(k)}: ${py(v, indent + 4)},`).join("\n")}\n${end}}`;
}

const literal = (values) => values.map((v) => JSON.stringify(v)).join(", ");

// --- TypeScript ---

const tsSource = `// ${BANNER}

export const VERSION = ${ts(spec.version)};

export const PLATFORMS = ${ts(spec.platforms)} as const;
export const REASONS = ${ts(spec.reasons)} as const;
export const OUTCOMES = ${ts(spec.outcomes)} as const;
export const RETRYABLE_OUTCOMES = ${ts(spec.retryableOutcomes)} as const;
export const REJECTIONS = ${ts(spec.rejections)} as const;

export const MAX_IDEMPOTENCY_KEY_LENGTH = ${spec.limits.maxIdempotencyKeyLength};
export const MAX_ORDER_REF_LENGTH = ${spec.limits.maxOrderRefLength};

export const DEFAULTS = ${ts(spec.defaults)} as const;
export const BACKOFF = ${ts(stripComments(spec.backoff))} as const;

export const FAST_RETRY_DELAYS_SECONDS = ${ts(spec.retrySchedule.fastDelaysSeconds)} as const;
export const LATE_RETRY_INTERVAL_SECONDS = ${spec.retrySchedule.lateIntervalSeconds};
export const LATE_RETRY_ATTEMPTS = ${spec.retrySchedule.lateAttempts};

export const LOCAL_HOSTS = ${ts(spec.localHosts)} as const;

/** Exactly what String.prototype.trim removes; the other SDKs trim this set. */
export const WHITESPACE = ${asciiString(spec.whitespace)};

export const CLAIMED_OUTCOME_DEFAULTS = ${ts(spec.testing.claimedOutcomeDefaults)} as const;

export const MESSAGES = ${ts(spec.messages)} as const;
`;

// --- Python ---

const pySource = `# ${BANNER}
# ruff: noqa: E501

from __future__ import annotations

from typing import Final, Literal

VERSION = ${JSON.stringify(spec.version)}

Platform = Literal[${literal(spec.platforms)}]
Reason = Literal[${literal(spec.reasons)}]
OutcomeName = Literal[${literal(spec.outcomes)}]
Rejection = Literal[${literal(spec.rejections)}]

PLATFORMS: Final[tuple[Platform, ...]] = ${py(spec.platforms)}
REASONS: Final[tuple[Reason, ...]] = ${py(spec.reasons)}
OUTCOMES: Final[tuple[OutcomeName, ...]] = ${py(spec.outcomes)}
RETRYABLE_OUTCOMES: Final[tuple[OutcomeName, ...]] = ${py(spec.retryableOutcomes)}
REJECTIONS: Final[tuple[Rejection, ...]] = ${py(spec.rejections)}

MAX_IDEMPOTENCY_KEY_LENGTH: Final = ${spec.limits.maxIdempotencyKeyLength}
MAX_ORDER_REF_LENGTH: Final = ${spec.limits.maxOrderRefLength}

DEFAULT_TIMEOUT_MS: Final = ${spec.defaults.timeoutMs}
DEFAULT_TOTAL_BUDGET_MS: Final = ${spec.defaults.totalBudgetMs}
DEFAULT_MAX_RETRIES: Final = ${spec.defaults.maxRetries}

BACKOFF_BASE_MS: Final = ${spec.backoff.baseMs}
BACKOFF_FACTOR: Final = ${spec.backoff.factor}
BACKOFF_JITTER: Final = ${spec.backoff.jitter}
MIN_ATTEMPT_MS: Final = ${spec.backoff.minAttemptMs}

FAST_RETRY_DELAYS_SECONDS: Final[tuple[int, ...]] = ${py(spec.retrySchedule.fastDelaysSeconds)}
LATE_RETRY_INTERVAL_SECONDS: Final = ${spec.retrySchedule.lateIntervalSeconds}
LATE_RETRY_ATTEMPTS: Final = ${spec.retrySchedule.lateAttempts}

LOCAL_HOSTS: Final[frozenset[str]] = frozenset(${py(spec.localHosts)})

# Exactly what JavaScript's String.prototype.trim removes. str.strip() removes a
# different set, so the SDK trims with this one instead.
WHITESPACE: Final = ${asciiString(spec.whitespace)}

# camelCase option name → this SDK's keyword argument, for messages.
CONFIG_FIELDS: Final[dict[str, str]] = ${py(spec.configFields)}

CLAIMED_OUTCOME_DEFAULTS: Final[dict[str, object]] = ${py(spec.testing.claimedOutcomeDefaults)}

MESSAGES: Final[dict[str, str]] = ${py(spec.messages)}
`;

function stripComments(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([k]) => !k.startsWith("$")));
}

// --- write or check ---

const stale = [];

function emit(path, content) {
  let current = null;
  try {
    current = readFileSync(path, "utf8");
  } catch {
    // missing
  }
  if (current === content) return;
  if (check) stale.push(relative(REPO, path));
  else {
    writeFileSync(path, content);
    console.log(`wrote ${relative(REPO, path)}`);
  }
}

emit(TS_OUT, tsSource);
emit(PY_OUT, pySource);

const pkg = readFileSync(PACKAGE_JSON, "utf8");
emit(PACKAGE_JSON, pkg.replace(/"version": "[^"]*"/, `"version": "${spec.version}"`));

if (check) {
  const changelog = readFileSync(CHANGELOG, "utf8");
  if (!new RegExp(`^## ${spec.version.replace(/\./g, "\\.")}\\b`, "m").test(changelog)) {
    console.error(`${relative(REPO, CHANGELOG)} has no "## ${spec.version}" entry.`);
    process.exit(1);
  }
  if (stale.length) {
    console.error(`Stale generated files (run \`npm run generate\` in packages/sdk-spec):\n  ${stale.join("\n  ")}`);
    process.exit(1);
  }
  console.log(`spec ${spec.version}: generated files are current.`);
}
