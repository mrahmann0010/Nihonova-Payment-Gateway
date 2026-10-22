# sdk-spec: one definition, every SDK

The gateway has two client SDKs:

| Package | Registry | Folder |
|---|---|---|
| `@project-sakura/pay` | npm | [`packages/sdk`](../sdk) |
| `sakura-pay` | PyPI | [`packages/sdk-python`](../sdk-python) |

They must behave **identically**: same outcomes, same messages, same retries, same helpers, same
version. This folder is what makes that true. Neither SDK owns the rules; this folder does, and
both are checked against it.

```text
sdk-spec/
  spec.json              constants, limits, defaults, retry schedule, every message string, version
  vectors/*.json         ~300 test cases: input → exact expected output, run by BOTH SDKs
  contract/scenarios.json  end-to-end cases against a real gateway, run by BOTH SDKs
  contract/harness.mjs   starts apps/server + a throwaway database for those scenarios
  scripts/generate.mjs   spec.json → each SDK's constants file (+ version sync)
  scripts/check-server.mjs  the gateway's own trxId rule against the same vectors
  scripts/release.mjs    publish both packages, same version, one command
```

## What is shared, and how

| Thing | Where it lives | How each SDK gets it |
|---|---|---|
| Platforms, reason codes, outcome names, rejections | `spec.json` | generated constants |
| Limits, defaults, backoff, retry schedule | `spec.json` | generated constants |
| Every message an outcome or a log line can carry | `spec.json` `messages` | generated; both SDKs fill the same templates |
| The version | `spec.json` `version` | generated into `package.json` and `_spec.py` |
| Logic (validation, interpretation, retries, keys…) | each SDK's code | **pinned by `vectors/`**: a case either SDK fails, fails the check |
| Behaviour against the real server | `contract/scenarios.json` | each SDK's contract suite runs every case |

Code can't be shared between TypeScript and Python, so logic is written twice, each time to the
same vectors. The vectors are exact: they compare the full outcome, the full message text, every
log line, every HTTP request sent, and every backoff wait. If the two SDKs disagree on anything a
vector covers, one of them fails.

Generated files carry a "do not edit" banner:
`packages/sdk/src/contract/spec.generated.ts` and `packages/sdk-python/src/sakura_pay/_spec.py`.

## Making a change

Any change to payment behaviour, in either SDK, goes through here.

1. **Describe it first.** Add or change cases in `vectors/*.json` (and `contract/scenarios.json`
   if the server is involved). Change `spec.json` if a constant or message changes, then run
   `npm run generate`.
2. **Watch both fail.** `npm run check` runs the TypeScript and Python suites; the new cases fail
   in both.
3. **Change both SDKs** until `npm run check` passes.
4. **Run the contract suites**: `npm run test:contract` (needs `docker compose up -d` at the repo
   root, and `npm install` in `apps/server`).
5. **Version it.** Bump `version` in `spec.json`, run `npm run generate`, and add a `## <version>`
   entry to [`packages/sdk/CHANGELOG.md`](../sdk/CHANGELOG.md), the changelog both packages share.
   `npm run check` refuses a version that has no entry.
6. Commit everything in **one commit**: spec, vectors, both SDKs, changelog.

A `/v1` change on the server follows the same path, in the same commit as the server change.

## Commands (run in this folder)

```sh
npm run generate        # spec.json → generated files + package.json version
npm run check           # generated files current + server trxId + TS check + Python check
npm run test:contract   # both SDKs against a real gateway (Docker MongoDB)
npm run release         # check, contract-test, then publish to npm AND PyPI
```

`release` refuses a dirty working tree, does every check before the first upload, and skips a
registry that already has the version, so after a partial failure it can simply be re-run. PyPI
needs `UV_PUBLISH_TOKEN`; npm uses your `npm login` session.

## The vector vocabulary

Values in the vector files can use a few shorthands, implemented by both runners
(`packages/sdk/test/vectors/load.ts`, `packages/sdk-python/tests/vectors.py`):

| Shorthand | Means |
|---|---|
| `"$name"` | a value defined at the top of the same file (`"$claimedBody"`) |
| `{"$repeat": "x", "times": 3}` | `"xxx"` |
| `{"$concat": [a, b]}` | `a + b` as strings |
| `{"$merge": [a, b]}` | `b`'s fields laid over `a`'s |
| `{"$delete": true}` | inside a `patch`: remove that field |

Config option names are camelCase in vectors and messages (`baseUrl`). The Python SDK spells them
the Python way (`base_url`, from `spec.json` `configFields`), in its messages too.

## Where JavaScript and Python differ

Some rules exist only because the two languages disagree, and the vectors pin JavaScript's answer
(the gateway is JavaScript). The Python SDK reproduces them in `sakura_pay/_js.py`:

- **Rounding**: `Math.round` rounds halves up (`12.5 → 13`); Python's `round` rounds to even.
- **Trimming**: the whitespace set is `spec.json` `whitespace`, which is exactly JavaScript's
  `trim()`. The TypeScript suite checks that against the runtime.
- **String length** counts UTF-16 units, as the server's limits do, so an emoji counts as 2.
- **Numbers in messages** print the way `String()` prints them (`1250`, not `1250.0`).
- **JSON**: compact, non-ASCII kept, `NaN` rejected.
- **Dates and `Retry-After`** are parsed strictly (ISO 8601 with a zone; delta-seconds or
  IMF-fixdate), by hand-written rules in both SDKs, not by either language's lenient parser.
