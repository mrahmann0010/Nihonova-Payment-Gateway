"""The SDK against the real gateway: packages/sdk-spec/contract/scenarios.json,
which the TypeScript SDK runs too.

Needs Docker MongoDB (``docker compose up -d`` at the repo root) and
``npm install`` in apps/server. Run with ``uv run pytest tests/contract``.

The scenarios share state (a payment claimed in one case stays claimed), so
each client flavour gets its own harness — a fresh server and database — and
the cases run in file order.
"""

from __future__ import annotations

import asyncio
import json
import re
import secrets
import shutil
import subprocess
from collections.abc import Iterator
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from typing import Any

import httpx
import pytest

from sakura_pay import create_async_gateway_client, create_gateway_client
from sakura_pay._dates import parse_iso_date

from ..vectors import SPEC_DIR, load

SCENARIOS = load("contract/scenarios.json")


@dataclass
class Harness:
    process: subprocess.Popen[str]
    base_url: str
    control_url: str
    dead_url: str
    secrets: dict[str, str]

    def control(self, path: str, body: Any) -> Any:
        res = httpx.post(f"{self.control_url}{path}", json=body, timeout=15)
        data = res.json()
        if res.status_code != 200:
            raise RuntimeError(f"harness {path}: {data.get('error')}")
        return data

    def options(self, name: str) -> dict[str, Any]:
        spec = SCENARIOS["connections"][name]
        if spec.get("secret") == "$fresh":
            secret = f"Ct-{secrets.token_urlsafe(24)}9a"
        else:
            secret = self.secrets[spec.get("secretOf", spec["clientId"])]
        base = (
            self.dead_url
            if spec.get("baseUrl") == "$dead"
            else self.base_url + spec.get("pathSuffix", "")
        )
        out: dict[str, Any] = {"base_url": base, "client_id": spec["clientId"], "secret": secret}
        if "timeoutMs" in spec:
            out["timeout_ms"] = spec["timeoutMs"]
        if "totalBudgetMs" in spec:
            out["total_budget_ms"] = spec["totalBudgetMs"]
        return out


def start_harness() -> Harness:
    node = shutil.which("node")
    if not node:
        pytest.skip("node is not installed")
    process = subprocess.Popen(
        [node, str(SPEC_DIR / "contract" / "harness.mjs")],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    assert process.stdout is not None
    line = process.stdout.readline()
    if not line:
        process.wait(5)
        raise RuntimeError(f"harness failed:\n{process.stderr.read() if process.stderr else ''}")
    ready = json.loads(line)
    return Harness(
        process, ready["baseUrl"], ready["controlUrl"], ready["deadUrl"], ready["secrets"]
    )


def stop_harness(harness: Harness) -> None:
    try:
        harness.control("/stop", None)
    except Exception:
        harness.process.terminate()
    harness.process.wait(15)


# --- running steps, sync or async ------------------------------------------------------


def claim_kwargs(step: dict[str, Any]) -> dict[str, Any]:
    out = {
        "trx_id": step["trxId"],
        "expected_poisha": step.get("poisha", step.get("taka", 0) * 100),
        "idempotency_key": step["key"],
        "order_ref": step["key"].split(":")[0],
    }
    if step.get("platform"):
        out["platform"] = step["platform"]
    if step.get("senderPhone"):
        out["sender_phone"] = step["senderPhone"]
    if step.get("acceptShortfall"):
        out["accept_shortfall"] = True
    return out


def many(m: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        {
            "as": m["as"],
            "trxId": f"{m['trxIdPrefix']}{i}",
            "taka": m["taka"],
            "key": f"{m['keyPrefix']}{i}:1",
        }
        for i in range(m["times"])
    ]


def run_sync(harness: Harness, steps: list[dict[str, Any]]) -> None:
    clients = {
        name: create_gateway_client(**harness.options(name)) for name in SCENARIOS["connections"]
    }

    def claim(step: dict[str, Any]) -> dict[str, Any]:
        return clients[step["as"]].claims.claim(**claim_kwargs(step)).to_json()

    try:
        for step in steps:
            if "claim" in step:
                check_claim(step, claim(step["claim"]))
            elif "parallel" in step:
                with ThreadPoolExecutor(len(step["parallel"])) as pool:
                    outcomes = list(pool.map(claim, step["parallel"]))
                assert sorted(o["outcome"] for o in outcomes) == step["expectOutcomes"]
            elif "claimMany" in step:
                last = [claim(s) for s in many(step["claimMany"])][-1]
                assert_matches(last, step["expectLast"])
            else:
                run_control(harness, step)
    finally:
        for client in clients.values():
            client.close()


def run_async(harness: Harness, steps: list[dict[str, Any]]) -> None:
    async def run() -> None:
        clients = {
            name: create_async_gateway_client(**harness.options(name))
            for name in SCENARIOS["connections"]
        }

        async def claim(step: dict[str, Any]) -> dict[str, Any]:
            return (await clients[step["as"]].claims.claim(**claim_kwargs(step))).to_json()

        try:
            for step in steps:
                if "claim" in step:
                    check_claim(step, await claim(step["claim"]))
                elif "parallel" in step:
                    outcomes = await asyncio.gather(*(claim(s) for s in step["parallel"]))
                    assert sorted(o["outcome"] for o in outcomes) == step["expectOutcomes"]
                elif "claimMany" in step:
                    last = [await claim(s) for s in many(step["claimMany"])][-1]
                    assert_matches(last, step["expectLast"])
                else:
                    await asyncio.to_thread(run_control, harness, step)
        finally:
            for client in clients.values():
                await client.aclose()

    asyncio.run(run())


def run_control(harness: Harness, step: dict[str, Any]) -> None:
    if "seedPayments" in step:
        harness.control("/seed/payments", step["seedPayments"])
    elif "release" in step:
        assert harness.control("/release", step["release"])["status"] == step["expectStatus"]
    else:
        raise AssertionError(f"Unknown scenario step: {step}")


def check_claim(step: dict[str, Any], outcome: dict[str, Any]) -> None:
    if "expect" in step:
        assert_matches(outcome, step["expect"])
    if "expectExactly" in step:
        assert outcome == step["expectExactly"]


# --- matching ------------------------------------------------------------------


def mismatches(actual: Any, expected: Any, path: str = "outcome") -> list[str]:
    """Partial match with the scenario matchers; returns what differs."""
    if isinstance(expected, dict):
        if "$isDate" in expected:
            return [] if parse_iso_date(actual) else [f"{path}: {actual!r} is not a date"]
        if "$matches" in expected:
            ok = isinstance(actual, str) and re.search(expected["$matches"], actual)
            return [] if ok else [f"{path}: {actual!r} does not match /{expected['$matches']}/"]
        if "$between" in expected:
            lo, hi = expected["$between"]
            ok = isinstance(actual, (int, float)) and lo <= actual <= hi
            return [] if ok else [f"{path}: {actual!r} not in [{lo}, {hi}]"]
        if not isinstance(actual, dict):
            return [f"{path}: expected an object, got {actual!r}"]
        return [m for k, v in expected.items() for m in mismatches(actual.get(k), v, f"{path}.{k}")]
    return (
        [] if json.dumps(actual) == json.dumps(expected) else [f"{path}: {actual!r} ≠ {expected!r}"]
    )


def assert_matches(actual: Any, expected: Any) -> None:
    problems = mismatches(actual, expected)
    assert not problems, f"{json.dumps(actual)}\n" + "\n".join(problems)


# --- the suite -------------------------------------------------------------------


@pytest.fixture(scope="module", params=["sync", "async"])
def flavour(request: pytest.FixtureRequest) -> Iterator[tuple[str, Harness]]:
    harness = start_harness()
    yield request.param, harness
    stop_harness(harness)


@pytest.mark.parametrize(
    "case", SCENARIOS["cases"], ids=[f"{c['group']}: {c['name']}" for c in SCENARIOS["cases"]]
)
def test_scenario(flavour: tuple[str, Harness], case: dict[str, Any]) -> None:
    kind, harness = flavour
    (run_sync if kind == "sync" else run_async)(harness, case["steps"])
