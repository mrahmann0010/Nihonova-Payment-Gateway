"""The client: build one at boot and share it (mirrors packages/sdk/src/client.ts).

``create_gateway_client`` for sync code (Django, Flask, a worker);
``create_async_gateway_client`` for asyncio (FastAPI, Starlette, aiohttp).
Both run the same claim flow (``_flow.py``) and answer every request with the
same outcome, message for message, as each other and as the TypeScript SDK.
"""

from __future__ import annotations

from collections.abc import Callable
from types import TracebackType
from typing import Any

import httpx

from ._config import Resolved, resolve_config
from ._flow import (
    ClaimsContext,
    GatewayLogger,
    RetryDeps,
    SilentLogger,
    claim_flow,
    run_async,
    run_sync,
)
from ._spec import Platform
from ._transport import HttpResult, apost_json, post_json
from .outcomes import ClaimOutcome, ClaimRequest

__all__ = [
    "AsyncClaimsResource",
    "AsyncGatewayClient",
    "ClaimsResource",
    "GatewayClient",
    "create_async_gateway_client",
    "create_gateway_client",
]


class _Frozen:
    __slots__ = ()

    def __setattr__(self, name: str, value: object) -> None:
        raise AttributeError(f"{type(self).__name__} is read-only")

    def _init(self, **values: object) -> None:
        for name, value in values.items():
            object.__setattr__(self, name, value)


class ClaimsResource(_Frozen):
    __slots__ = ("_run",)
    _run: Callable[[ClaimRequest], ClaimOutcome]

    def __init__(self, run: Callable[[ClaimRequest], ClaimOutcome]) -> None:
        self._init(_run=run)

    def claim(
        self,
        *,
        trx_id: str,
        expected_poisha: int,
        idempotency_key: str,
        order_ref: str | None = None,
        platform: Platform | None = None,
        sender_phone: str | None = None,
        accept_shortfall: bool = False,
    ) -> ClaimOutcome:
        """ "Let me spend this payment for this order."

        Claiming *is* checking: there is no "is it paid?" read to call first,
        and no app should build one — a read-then-decide check is the race the
        gateway exists to remove.

        Never raises. Gateway trouble is ``Unavailable``; the app's own bugs
        and config mistakes are ``Misconfigured``. Only ``Claimed`` means grant.
        """
        return self._run(
            ClaimRequest(
                trx_id=trx_id,
                expected_poisha=expected_poisha,
                idempotency_key=idempotency_key,
                order_ref=order_ref,
                platform=platform,
                sender_phone=sender_phone,
                accept_shortfall=accept_shortfall,
            )
        )


class AsyncClaimsResource(_Frozen):
    __slots__ = ("_run",)
    _run: Callable[[ClaimRequest], Any]

    def __init__(self, run: Callable[[ClaimRequest], Any]) -> None:
        self._init(_run=run)

    async def claim(
        self,
        *,
        trx_id: str,
        expected_poisha: int,
        idempotency_key: str,
        order_ref: str | None = None,
        platform: Platform | None = None,
        sender_phone: str | None = None,
        accept_shortfall: bool = False,
    ) -> ClaimOutcome:
        """The async ``claim``: same rules, same outcomes as ``ClaimsResource.claim``."""
        outcome: ClaimOutcome = await self._run(
            ClaimRequest(
                trx_id=trx_id,
                expected_poisha=expected_poisha,
                idempotency_key=idempotency_key,
                order_ref=order_ref,
                platform=platform,
                sender_phone=sender_phone,
                accept_shortfall=accept_shortfall,
            )
        )
        return outcome


class GatewayClient(_Frozen):
    """Holds no per-request state; share one across threads.

    ``enabled`` is False when the config was left empty: every claim is then
    ``Unavailable``. ``client_id`` is for logs. The secret is never on this
    object, in its repr, or in any message.
    """

    __slots__ = ("_close", "claims", "client_id", "enabled")
    enabled: bool
    client_id: str | None
    claims: ClaimsResource
    _close: Callable[[], None]

    def __init__(
        self,
        enabled: bool,
        client_id: str | None,
        claims: ClaimsResource,
        close: Callable[[], None],
    ) -> None:
        self._init(enabled=enabled, client_id=client_id, claims=claims, _close=close)

    def close(self) -> None:
        """Close the connection pool, unless you passed in your own ``http_client``."""
        self._close()

    def __enter__(self) -> GatewayClient:
        return self

    def __exit__(
        self,
        kind: type[BaseException] | None,
        error: BaseException | None,
        tb: TracebackType | None,
    ) -> None:
        self.close()

    def __repr__(self) -> str:
        return f"GatewayClient(enabled={self.enabled}, client_id={self.client_id!r})"


class AsyncGatewayClient(_Frozen):
    """The asyncio client. Same surface as ``GatewayClient``, with ``await``."""

    __slots__ = ("_close", "claims", "client_id", "enabled")
    enabled: bool
    client_id: str | None
    claims: AsyncClaimsResource
    _close: Callable[[], Any]

    def __init__(
        self,
        enabled: bool,
        client_id: str | None,
        claims: AsyncClaimsResource,
        close: Callable[[], Any],
    ) -> None:
        self._init(enabled=enabled, client_id=client_id, claims=claims, _close=close)

    async def aclose(self) -> None:
        """Close the connection pool, unless you passed in your own ``http_client``."""
        await self._close()

    async def __aenter__(self) -> AsyncGatewayClient:
        return self

    async def __aexit__(
        self,
        kind: type[BaseException] | None,
        error: BaseException | None,
        tb: TracebackType | None,
    ) -> None:
        await self.aclose()

    def __repr__(self) -> str:
        return f"AsyncGatewayClient(enabled={self.enabled}, client_id={self.client_id!r})"


def create_gateway_client(
    *,
    base_url: str | None,
    client_id: str | None,
    secret: str | None,
    timeout_ms: float | None = None,
    total_budget_ms: float | None = None,
    max_retries: int | None = None,
    logger: GatewayLogger | None = None,
    http_client: httpx.Client | None = None,
    _deps: RetryDeps | None = None,
) -> GatewayClient:
    """Build the client once at boot and share it.

    ``base_url``, ``client_id`` and ``secret`` are all-or-none: pass all three,
    or leave all three empty for an environment with no gateway (every claim is
    then ``Unavailable`` — never a grant). Raises ``GatewayConfigError`` on a
    bad config, so a deploy mistake fails the boot, not the first checkout.

    ``timeout_ms`` (5000) is per attempt, ``total_budget_ms`` (8000) per call,
    ``max_retries`` (1) counts in-call retries on network errors, timeouts and
    5xx. ``http_client`` lets you bring your own ``httpx.Client`` (proxies,
    mTLS); the SDK then never closes it.
    """
    resolved = resolve_config(
        base_url=base_url,
        client_id=client_id,
        secret=secret,
        timeout_ms=timeout_ms,
        total_budget_ms=total_budget_ms,
        max_retries=max_retries,
    )
    log: GatewayLogger = logger or SilentLogger()
    deps = _deps or RetryDeps()

    if not isinstance(resolved, Resolved):
        ctx = ClaimsContext(enabled=False, logger=log)
        return GatewayClient(
            False,
            None,
            ClaimsResource(lambda request: run_sync(claim_flow(ctx, request), _never, deps.sleep)),
            lambda: None,
        )

    owned = http_client is None
    http = http_client or httpx.Client(follow_redirects=False)
    # The credential lives only in this closure — not on the returned object —
    # so logging or printing the client cannot show it.
    url, authorization = resolved.claims_url, resolved.authorization
    ctx = ClaimsContext(enabled=True, logger=log, policy=resolved.policy, deps=deps)

    def post(body: dict[str, Any], timeout_ms: float) -> HttpResult:
        return post_json(http, url, body, authorization, timeout_ms)

    return GatewayClient(
        True,
        resolved.client_id,
        ClaimsResource(lambda request: run_sync(claim_flow(ctx, request), post, deps.sleep)),
        http.close if owned else lambda: None,
    )


def create_async_gateway_client(
    *,
    base_url: str | None,
    client_id: str | None,
    secret: str | None,
    timeout_ms: float | None = None,
    total_budget_ms: float | None = None,
    max_retries: int | None = None,
    logger: GatewayLogger | None = None,
    http_client: httpx.AsyncClient | None = None,
    _deps: RetryDeps | None = None,
) -> AsyncGatewayClient:
    """The asyncio twin of ``create_gateway_client``: same options, same rules."""
    resolved = resolve_config(
        base_url=base_url,
        client_id=client_id,
        secret=secret,
        timeout_ms=timeout_ms,
        total_budget_ms=total_budget_ms,
        max_retries=max_retries,
    )
    log: GatewayLogger = logger or SilentLogger()
    deps = _deps or RetryDeps()

    async def nothing() -> None:
        return None

    if not isinstance(resolved, Resolved):
        ctx = ClaimsContext(enabled=False, logger=log)
        return AsyncGatewayClient(
            False,
            None,
            AsyncClaimsResource(
                lambda request: run_async(claim_flow(ctx, request), _anever, deps.async_sleep)
            ),
            nothing,
        )

    owned = http_client is None
    http = http_client or httpx.AsyncClient(follow_redirects=False)
    url, authorization = resolved.claims_url, resolved.authorization
    ctx = ClaimsContext(enabled=True, logger=log, policy=resolved.policy, deps=deps)

    async def post(body: dict[str, Any], timeout_ms: float) -> HttpResult:
        return await apost_json(http, url, body, authorization, timeout_ms)

    return AsyncGatewayClient(
        True,
        resolved.client_id,
        AsyncClaimsResource(
            lambda request: run_async(claim_flow(ctx, request), post, deps.async_sleep)
        ),
        http.aclose if owned else nothing,
    )


def _never(body: dict[str, Any], timeout_ms: float) -> HttpResult:
    raise AssertionError("an unconfigured client never posts")


async def _anever(body: dict[str, Any], timeout_ms: float) -> HttpResult:
    raise AssertionError("an unconfigured client never posts")
