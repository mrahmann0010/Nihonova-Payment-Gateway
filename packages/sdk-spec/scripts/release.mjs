#!/usr/bin/env node
/* --------------------------------------------------------------------------
   Publish both SDKs at the version in spec.json:

     @project-sakura/pay  → npm   (packages/sdk)
     sakura-pay           → PyPI  (packages/sdk-python)

     npm run release                    check, contract-test, publish
     npm run release -- --skip-contract when Docker isn't available (not advised)
     npm run release -- --dry-run       everything except the two uploads

   A published version can never be reused on either registry, so the script
   does every check before the first upload, and is safe to re-run: a registry
   that already has this version is skipped. If one upload fails after the
   other succeeded, fix the cause and run it again to publish the missing one.

   PyPI needs a token: UV_PUBLISH_TOKEN=pypi-… (or a trusted publisher in CI).
   npm uses your `npm login` session.
   -------------------------------------------------------------------------- */

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SPEC_DIR = resolve(HERE, "..");
const TS_DIR = resolve(SPEC_DIR, "../sdk");
const PY_DIR = resolve(SPEC_DIR, "../sdk-python");

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const { version } = JSON.parse(readFileSync(resolve(SPEC_DIR, "spec.json"), "utf8"));
const NPM_NAME = JSON.parse(readFileSync(resolve(TS_DIR, "package.json"), "utf8")).name;
const PYPI_NAME = "sakura-pay";

const run = (command, cwd = SPEC_DIR) => execSync(command, { cwd, stdio: "inherit" });
const quiet = (command, cwd = SPEC_DIR) => execSync(command, { cwd, encoding: "utf8" }).trim();

function step(text) {
  console.log(`\n▸ ${text}`);
}

async function onPypi() {
  const res = await fetch(`https://pypi.org/pypi/${PYPI_NAME}/${version}/json`);
  return res.status === 200;
}

function onNpm() {
  try {
    return quiet(`npm view ${NPM_NAME}@${version} version`) === version;
  } catch {
    return false;
  }
}

step(`Releasing ${version}: ${NPM_NAME} (npm) and ${PYPI_NAME} (PyPI)`);

if (quiet("git status --porcelain")) {
  console.error("The working tree has uncommitted changes. Commit first, so the release matches a commit.");
  process.exit(1);
}

const needNpm = !onNpm();
const needPypi = !(await onPypi());
if (!needNpm && !needPypi) {
  console.log(`${version} is already on both registries. Bump "version" in spec.json for a new release.`);
  process.exit(0);
}

step("Shared check: spec, server trxId rule, TypeScript SDK, Python SDK");
run("npm run check");

if (!args.has("--skip-contract")) {
  step("Contract suites against a real gateway (needs `docker compose up -d`)");
  run("npm run test:contract");
}

step("Building the Python distribution");
run("rm -rf dist && uv build", PY_DIR);

if (dryRun) {
  step(`Dry run: would publish ${[needNpm && "npm", needPypi && "PyPI"].filter(Boolean).join(" and ")}.`);
  process.exit(0);
}

if (needNpm) {
  step(`npm publish ${NPM_NAME}@${version}`);
  run("npm publish", TS_DIR);
} else {
  step(`npm already has ${version}; skipped.`);
}

if (needPypi) {
  step(`uv publish ${PYPI_NAME}==${version}`);
  run("uv publish", PY_DIR);
} else {
  step(`PyPI already has ${version}; skipped.`);
}

step(`Released ${version}. Tag it: git tag sdk-v${version} && git push --tags`);
