"""packages/sdk-spec/vectors — the behaviour every SDK shares.

Nothing here is specific to Python; a case that fails here would fail the
TypeScript SDK too, or should. Python-only behaviour is in test_python.py.
The claim scenarios run twice: through the sync client and the async one.
"""

from __future__ import annotations

import asyncio
import json
from types import SimpleNamespace
from typing import Any

import httpx
import pytest

from sakura_pay import (
    claim_key_for,
    create_async_gateway_client,
    create_gateway_client,
    first_claim_key,
    is_retryable,
    next_claim_key,
    next_retry_delay_seconds,
    normalise_trx_id,
    poisha_to_taka,
    taka_to_poisha,
)
from sakura_pay._config import Resolved, resolve_config
from sakura_pay._dates import parse_iso_date
from sakura_pay._flow import RetryDeps, backoff_ms
from sakura_pay._format import python_names
from sakura_pay._interpret import interpret_claim_response, request_problem, to_claim_body
from sakura_pay._transport import parse_retry_after
from sakura_pay.outcomes import ClaimRequest, _iso
from sakura_pay.testing import (
    claimed_outcome,
    create_fake_async_gateway_client,
    create_fake_gateway_client,
)

from .vectors import expand, load, outcome_from_json, patched, request_kwargs, snake

SPEC = load("spec.json")
HELPERS = load("vectors/helpers.json")
CLAIMS = load("vectors/claims.json")
CONFIG = load("vectors/config.json")
CLIENT = load("vectors/client.json")
TESTING = load("vectors/testing.json")


def cases(rows: list[dict[str, Any]]) -> Any:
    return pytest.mark.parametrize(
        "case",
        rows,
        ids=[
            row.get("name") or f"#{i} {json.dumps(row, ensure_ascii=False)[:80]}"
            for i, row in enumerate(rows)
        ],
    )


def attempt(fn: Any) -> Any:
    try:
        return fn()
    except ValueError as error:
        return {"throws": str(error)}


def same(actual: Any, expected: Any) -> bool:
    """Equal as JSON values: 1250 == 1250.0, but True is not 1."""
    if isinstance(actual, bool) or isinstance(expected, bool):
        return actual is expected
    if isinstance(actual, (int, float)) and isinstance(expected, (int, float)):
        return actual == expected
    if isinstance(actual, dict) and isinstance(expected, dict):
        return actual.keys() == expected.keys() and all(
            same(actual[k], expected[k]) for k in actual
        )
    if isinstance(actual, (list, tuple)) and isinstance(expected, (list, tuple)):
        return len(actual) == len(expected) and all(
            same(a, e) for a, e in zip(actual, expected, strict=True)
        )
    return bool(actual == expected) and type(actual) is type(expected)


# --- helpers -------------------------------------------------------------------


@cases(HELPERS["normaliseTrxId"])
def test_normalise_trx_id(case):
    assert normalise_trx_id(case["input"]) == case["expected"]


@cases(HELPERS["takaToPoisha"])
def test_taka_to_poisha(case):
    assert same(taka_to_poisha(case["input"]), case["expected"])


@cases(HELPERS["poishaToTaka"])
def test_poisha_to_taka(case):
    assert same(poisha_to_taka(case["input"]), case["expected"])


@cases(HELPERS["firstClaimKey"])
def test_first_claim_key(case):
    got = attempt(lambda: first_claim_key(expand(case["orderRef"])))
    assert got == (
        {"throws": expand(case["throws"])} if "throws" in case else expand(case["expected"])
    )


@cases(HELPERS["claimKeyFor"])
def test_claim_key_for(case):
    assert claim_key_for(case["orderRef"], case["stored"]) == case["expected"]


@cases(HELPERS["nextClaimKey"])
def test_next_claim_key(case):
    got = attempt(lambda: next_claim_key(case["orderRef"], case["current"]))
    assert got == ({"throws": case["throws"]} if "throws" in case else case["expected"])


@cases(HELPERS["nextRetryDelaySeconds"])
def test_next_retry_delay_seconds(case):
    got = next_retry_delay_seconds(case["attempts"], case["granted"], case.get("retryAfterSeconds"))
    assert same(got, case["expected"])


@cases(HELPERS["isRetryable"])
def test_is_retryable(case):
    assert is_retryable(SimpleNamespace(outcome=case["outcome"])) is case["expected"]  # type: ignore[arg-type]


@cases(HELPERS["parseRetryAfter"])
def test_parse_retry_after(case):
    assert same(parse_retry_after(case["header"], case.get("nowMs")), case["expected"])


@cases(HELPERS["backoffMs"])
def test_backoff_ms(case):
    assert same(backoff_ms(case["retry"], lambda: case["random"]), case["expected"])


@cases(HELPERS["parseIsoDate"])
def test_parse_iso_date(case):
    got = parse_iso_date(case["input"])
    assert (None if got is None else _iso(got)) == case["expected"]


# --- claims: request and interpret -----------------------------------------------


def as_request(fields: dict[str, Any]) -> ClaimRequest:
    return ClaimRequest(**request_kwargs(fields))


@cases(CLAIMS["requestProblem"])
def test_request_problem(case):
    assert (
        request_problem(as_request(patched(CLAIMS["baseRequest"], case["patch"])))
        == case["expected"]
    )


@cases(CLAIMS["toClaimBody"])
def test_to_claim_body(case):
    body = to_claim_body(as_request(patched(CLAIMS["baseRequest"], case["patch"])))
    assert same(body, case["expected"])
    # Same keys in the same order as every other SDK sends them.
    assert list(body) == list(case["expected"])


@cases(CLAIMS["interpret"])
def test_interpret(case):
    body = (
        patched(CLAIMS["claimedBody"], case["bodyPatch"]) if "bodyPatch" in case else case["body"]
    )
    logs: list[str] = []
    outcome = interpret_claim_response(
        case["status"],
        body,
        case["expectedPoisha"],
        retry_after_seconds=case.get("retryAfterSeconds"),
        accept_shortfall=case.get("acceptShortfall", False),
        on_unexpected=logs.append,
    )
    assert same(outcome.to_json(), case["outcome"])
    assert logs == case["logs"]


def test_interpret_covers_every_published_reason():
    covered = {
        c["body"]["reason"]
        for c in CLAIMS["interpret"]
        if c["status"] < 500
        and isinstance(c.get("body"), dict)
        and isinstance(c["body"].get("reason"), str)
    }
    assert [r for r in SPEC["reasons"] if r not in covered] == []


# --- config ----------------------------------------------------------------------


def config_kwargs(config: dict[str, Any]) -> dict[str, Any]:
    return {snake(k): v for k, v in config.items()}


@cases(CONFIG["cases"])
def test_config(case):
    got = attempt(
        lambda: resolve_config(**config_kwargs(patched(CONFIG["baseConfig"], case["config"])))
    )

    if "error" in case:
        # Messages name options the Python way: baseUrl → base_url.
        assert got == {"throws": python_names(case["error"])}
    elif "resolved" in case:
        if isinstance(got, Resolved):
            policy = got.policy
            shown = {
                "enabled": True,
                "clientId": got.client_id,
                "claimsUrl": got.claims_url,
                "authorization": got.authorization,
                "policy": {
                    "timeoutMs": policy.timeout_ms,
                    "totalBudgetMs": policy.total_budget_ms,
                    "maxRetries": policy.max_retries,
                },
            }
        else:
            shown = {"enabled": got.enabled}
        assert same(shown, case["resolved"])
    else:
        assert got.claims_url == case["claimsUrl"]


# --- claims.claim over a scripted transport ------------------------------------------


REFS = {"claimedBody": CLIENT["claimedBody"], "sentBody": CLIENT["sentBody"]}


class Script:
    """The scenario's transport, clock and log, for either client."""

    def __init__(self, case: dict[str, Any]) -> None:
        self.case = case
        self.exchanges = expand(case["exchanges"], REFS)
        self.now = 0.0
        self.sleeps: list[float] = []
        self.calls: list[httpx.Request] = []
        self.logs: list[str] = []
        self.transport = httpx.MockTransport(self.answer)

        def sleep(ms: float) -> None:
            self.sleeps.append(ms)
            self.now += ms

        async def async_sleep(ms: float) -> None:
            sleep(ms)

        self.deps = RetryDeps(
            now=lambda: self.now,
            random=lambda: case.get("random", 0.5),
            sleep=sleep,
            async_sleep=async_sleep,
        )

    def error(self, msg: str) -> None:
        self.logs.append(msg)

    def answer(self, request: httpx.Request) -> httpx.Response:
        self.calls.append(request)
        ex = self.exchanges[min(len(self.calls) - 1, len(self.exchanges) - 1)]
        self.now += ex.get("takesMs", 0)
        if "networkError" in ex:
            raise httpx.ConnectError(ex["networkError"], request=request)
        if ex.get("timeout"):
            raise httpx.ReadTimeout("timed out", request=request)
        content = ex["bodyText"] if "bodyText" in ex else json.dumps(ex["body"])
        headers = {"content-type": "application/json", **ex.get("headers", {})}
        return httpx.Response(ex["status"], content=content.encode("utf-8"), headers=headers)

    def options(self) -> dict[str, Any]:
        return {
            **config_kwargs(patched(CLIENT["baseConfig"], self.case.get("config"))),
            "logger": self,
            "_deps": self.deps,
        }

    def request(self) -> dict[str, Any]:
        return request_kwargs(patched(CLIENT["baseRequest"], self.case.get("request"), REFS))

    def check(self, outcome: Any) -> None:
        case = self.case
        assert same(outcome.to_json(), case["outcome"])
        assert same(self.sleeps, case["sleeps"])
        assert self.logs == case["logs"]
        if "callCount" in case:
            assert len(self.calls) == case["callCount"]
        if "calls" in case:
            expected = expand(case["calls"], REFS)
            assert len(self.calls) == len(expected)
            for call, want in zip(self.calls, expected, strict=True):
                if "url" in want:
                    assert str(call.url) == want["url"]
                if "method" in want:
                    assert call.method == want["method"]
                for name, value in want.get("headers", {}).items():
                    assert call.headers.get(name) == value
                assert same(json.loads(call.content), want["body"])


@cases(CLIENT["scenarios"])
def test_claim_sync(case):
    script = Script(case)
    with create_gateway_client(
        **script.options(), http_client=httpx.Client(transport=script.transport)
    ) as gateway:
        script.check(gateway.claims.claim(**script.request()))


@cases(CLIENT["scenarios"])
def test_claim_async(case):
    script = Script(case)

    async def run() -> Any:
        http = httpx.AsyncClient(transport=script.transport)
        async with create_async_gateway_client(**script.options(), http_client=http) as gateway:
            outcome = await gateway.claims.claim(**script.request())
        await http.aclose()
        return outcome

    script.check(asyncio.run(run()))


# --- testing ---------------------------------------------------------------------


def fake_respond(case: dict[str, Any]) -> list[Any]:
    return [
        claimed_outcome() if o == "$claimedOutcome" else outcome_from_json(o)
        for o in case["respond"]
    ]


def fake_options(case: dict[str, Any]) -> dict[str, Any]:
    return {snake(k): v for k, v in case.get("options", {}).items()}


@cases(TESTING["fakeClient"])
def test_fake_client(case):
    gateway = create_fake_gateway_client(fake_respond(case), **fake_options(case))
    request = request_kwargs(CLAIMS["baseRequest"])
    got = [gateway.claims.claim(**request).to_json() for _ in range(case["claims"])]
    assert same(got, case["outcomes"])
    assert gateway.enabled is case["enabled"]
    assert gateway.client_id == case["clientId"]
    assert len(gateway.calls) == case["claims"]


@cases(TESTING["fakeClient"])
def test_fake_async_client(case):
    gateway = create_fake_async_gateway_client(fake_respond(case), **fake_options(case))
    request = request_kwargs(CLAIMS["baseRequest"])

    async def run() -> list[Any]:
        return [(await gateway.claims.claim(**request)).to_json() for _ in range(case["claims"])]

    assert same(asyncio.run(run()), case["outcomes"])
    assert gateway.client_id == case["clientId"]


@cases(TESTING["claimedOutcome"])
def test_claimed_outcome(case):
    overrides = {snake(k): v for k, v in case["overrides"].items()}
    assert same(claimed_outcome(**overrides).to_json(), case["expected"])
