"""The claim, written once for both the sync and the async client.

``claim_flow`` is a generator: it does no I/O itself, it *yields* what it needs
(an HTTP post, a sleep) and is sent back the result. ``run_sync`` and
``run_async`` are the two drivers. So the retry loop, the time budget and the
wallet-hint resend exist once, and the two clients cannot drift apart — any
more than this SDK and the TypeScript one can, which the shared vectors pin.

Mirrors packages/sdk/src/resources/claims/claims.ts and transport/retry.ts.
"""

from __future__ import annotations

import asyncio
import dataclasses
import random
import time
from collections.abc import Awaitable, Callable, Generator
from dataclasses import dataclass
from typing import Any, Protocol

from ._config import RetryPolicy
from ._format import message
from ._interpret import interpret_claim_response, request_problem, to_claim_body
from ._js import js_round
from ._spec import BACKOFF_BASE_MS, BACKOFF_FACTOR, BACKOFF_JITTER, MIN_ATTEMPT_MS
from ._transport import HttpFailure, HttpResult, now_ms
from .outcomes import ClaimOutcome, ClaimRequest, Misconfigured, Rejected, Unavailable


class GatewayLogger(Protocol):
    """Where the SDK reports answers that mean something is wrong: a refused
    credential, a malformed request, a reply outside the contract. A
    ``logging.Logger`` fits. Messages never contain the secret."""

    def error(self, msg: str, /) -> object: ...


class SilentLogger:
    """The default: a library should not write to an app's output unasked."""

    def error(self, msg: str, /) -> None:
        return None


@dataclass(frozen=True, slots=True)
class RetryDeps:
    """Time and chance, injectable so the vectors can run on a fake clock."""

    now: Callable[[], float] = now_ms
    random: Callable[[], float] = random.random
    sleep: Callable[[float], object] = lambda ms: time.sleep(ms / 1000)
    async_sleep: Callable[[float], Awaitable[object]] = lambda ms: asyncio.sleep(ms / 1000)


@dataclass(frozen=True, slots=True)
class Post:
    body: dict[str, Any]
    timeout_ms: float


@dataclass(frozen=True, slots=True)
class Sleep:
    ms: float


Effect = Post | Sleep
Flow = Generator[Effect, Any, ClaimOutcome]


@dataclass(frozen=True, slots=True)
class ClaimsContext:
    enabled: bool
    logger: GatewayLogger
    policy: RetryPolicy | None = None
    deps: RetryDeps = dataclasses.field(default_factory=RetryDeps)


def backoff_ms(retry: int, rand: Callable[[], float]) -> int:
    """250ms, 750ms, 2250ms… with ±25% jitter, so callers don't retry in step."""
    base = BACKOFF_BASE_MS * BACKOFF_FACTOR**retry
    return js_round(base * (1 - BACKOFF_JITTER + rand() * 2 * BACKOFF_JITTER))


def claim_flow(ctx: ClaimsContext, request: ClaimRequest) -> Flow:
    """ "Let me spend this payment for this order." Never raises; only Claimed grants."""
    if not ctx.enabled:
        return Unavailable(reason=message("notConfigured"))

    try:
        problem = request_problem(request)
        if problem:
            order_ref = "?" if request.order_ref is None else request.order_ref
            ctx.logger.error(message("refusingBadClaimLog", orderRef=order_ref, problem=problem))
            return Misconfigured(reason=problem)

        # Asked without the wallet first. The customer picks a wallet on the
        # form and can pick the wrong one; naming it up front would turn that
        # slip into a payment that is "not found" forever. Only when the
        # gateway says the ID exists on two wallets is the customer's choice used.
        outcome = yield from _send(ctx, dataclasses.replace(request, platform=None))

        if (
            isinstance(outcome, Rejected)
            and outcome.rejection == "AMBIGUOUS"
            and request.platform is not None
        ):
            outcome = yield from _send(ctx, request)

        return outcome
    except Exception as error:
        # Every path above already returns an outcome; this keeps the promise
        # ("never raises") even against a bug in the SDK itself.
        text = f"{type(error).__name__}: {error}"
        ctx.logger.error(message("unexpectedErrorLog", error=text))
        return Unavailable(reason=message("unexpectedError", error=text))


@dataclass(frozen=True, slots=True)
class _Attempt:
    value: ClaimOutcome
    transient: bool


def _send(ctx: ClaimsContext, request: ClaimRequest) -> Flow:
    assert ctx.policy is not None
    body = to_claim_body(request)

    def attempt(timeout_ms: float) -> Generator[Effect, Any, _Attempt]:
        http: HttpResult = yield Post(body, timeout_ms)

        if isinstance(http, HttpFailure):
            reason = (
                message("timedOut", timeoutMs=timeout_ms)
                if http.timed_out
                else message("unreachable", message=http.message)
            )
            return _Attempt(Unavailable(reason=reason), transient=True)

        outcome = interpret_claim_response(
            http.status,
            http.body,
            request.expected_poisha,
            retry_after_seconds=http.retry_after_seconds,
            accept_shortfall=request.accept_shortfall is True,
            on_unexpected=ctx.logger.error,
        )
        # A 5xx or an unreadable success is worth one more try with the same
        # key. A rate limit is not: hammering it is what got us limited, and
        # the app's schedule honours its Retry-After instead.
        transient = isinstance(outcome, Unavailable) and http.status != 429
        return _Attempt(outcome, transient)

    return (yield from _with_retry(ctx.policy, attempt, ctx.deps))


def _with_retry(
    policy: RetryPolicy,
    run: Callable[[float], Generator[Effect, Any, _Attempt]],
    deps: RetryDeps,
) -> Flow:
    """Retrying inside one call, under a time budget.

    Only for answers that say nothing about the payment — a dropped
    connection, a timeout, a 5xx. Safe solely because the retry carries the
    same idempotency key. The budget exists because a checkout is waiting.
    """
    deadline = deps.now() + policy.total_budget_ms
    result = yield from run(min(policy.timeout_ms, policy.total_budget_ms))

    retry = 0
    while retry < policy.max_retries and result.transient:
        wait = backoff_ms(retry, deps.random)
        left = deadline - deps.now() - wait
        # Shortest attempt worth starting; below it, it would time out on arrival.
        if left < MIN_ATTEMPT_MS:
            break
        yield Sleep(wait)
        result = yield from run(min(policy.timeout_ms, left))
        retry += 1

    return result.value


# --- drivers ------------------------------------------------------------------


def run_sync(
    flow: Flow,
    post: Callable[[dict[str, Any], float], HttpResult],
    sleep: Callable[[float], object],
) -> ClaimOutcome:
    try:
        effect = next(flow)
        while True:
            try:
                if isinstance(effect, Post):
                    result: object = post(effect.body, effect.timeout_ms)
                else:
                    sleep(effect.ms)
                    result = None
            except Exception as error:
                effect = flow.throw(error)
                continue
            effect = flow.send(result)
    except StopIteration as done:
        return done.value  # type: ignore[no-any-return]


async def run_async(
    flow: Flow,
    post: Callable[[dict[str, Any], float], Awaitable[HttpResult]],
    sleep: Callable[[float], Awaitable[object]],
) -> ClaimOutcome:
    try:
        effect = next(flow)
        while True:
            try:
                if isinstance(effect, Post):
                    result: object = await post(effect.body, effect.timeout_ms)
                else:
                    await sleep(effect.ms)
                    result = None
            except Exception as error:
                effect = flow.throw(error)
                continue
            effect = flow.send(result)
    except StopIteration as done:
        return done.value  # type: ignore[no-any-return]
