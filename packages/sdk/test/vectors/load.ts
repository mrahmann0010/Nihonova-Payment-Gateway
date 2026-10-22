import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/* --------------------------------------------------------------------------
   Reading packages/sdk-spec: the vectors every SDK must pass, and the small
   vocabulary they're written in. The Python runner implements the same
   vocabulary (tests/vectors.py); keep the two in step.

     "$name"                         a value defined at the top of the file
     {"$repeat": "x", "times": 3}    "xxx"
     {"$concat": [a, b]}             a + b, as strings
     {"$merge": [a, b]}              b's fields over a's
     {"$delete": true}               inside a patch: remove the field
   -------------------------------------------------------------------------- */

const HERE = dirname(fileURLToPath(import.meta.url));
export const SPEC_DIR = resolve(HERE, "../../../sdk-spec");

export function loadSpecFile<T = Record<string, unknown>>(path: string): T {
  return JSON.parse(readFileSync(resolve(SPEC_DIR, path), "utf8")) as T;
}

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

export function expand(value: unknown, refs: Record<string, unknown> = {}): any {
  if (typeof value === "string" && value.startsWith("$") && value.slice(1) in refs) {
    return expand(refs[value.slice(1)], refs);
  }
  if (Array.isArray(value)) return value.map((v) => expand(v, refs));
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if ("$repeat" in obj) return String(obj.$repeat).repeat(Number(obj.times));
    if ("$concat" in obj) return (obj.$concat as unknown[]).map((v) => expand(v, refs)).join("");
    if ("$merge" in obj) {
      return Object.assign({}, ...(obj.$merge as unknown[]).map((v) => expand(v, refs)));
    }
    return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, expand(v, refs)]));
  }
  return value;
}

/** `base` with `patch` laid over it; a {"$delete": true} value removes the field. */
export function patched(base: unknown, patch: unknown, refs: Record<string, unknown> = {}): any {
  const out: Record<string, unknown> = { ...(expand(base, refs) as object) };
  for (const [key, value] of Object.entries((patch ?? {}) as object)) {
    if (value && typeof value === "object" && (value as { $delete?: boolean }).$delete) delete out[key];
    else out[key] = expand(value, refs);
  }
  return out;
}

/** An outcome as the vectors write it: dates as ISO strings, no undefined fields. */
export function asJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}
