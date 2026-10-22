"""Stand-in clients for an app's own tests: same shape, no network.

    from sakura_pay.testing import claimed_outcome, create_fake_gateway_client

    gateway = create_fake_gateway_client([PendingArrival(), claimed_outcome(paid_poisha=125_000)])

The same behaviour as ``@project-sakura/pay/testing`` (vectors/testing.json).
"""

from __future__ import annotations

import dataclasses
from collections.abc import Awaitable, Callable, Sequence
from datetime import datetime
from typing import Any

from ._dates import parse_iso_date
from ._format import message
from ._spec import CLAIMED_OUTCOME_DEFAULTS, Platform
from .outcomes import Claimed, ClaimOutcome, ClaimRequest, PendingArrival, Unavailable

__all__ = [
    "FakeAsyncGatewayClient",
    "FakeGatewayClient",
    "claimed_outcome",
    "create_fake_async_gateway_client",
    "create_fake_gateway_client",
]

Responder = Sequence[ClaimOutcome] | Callable[[ClaimRequest, int], ClaimOutcome]
AsyncResponder = (
    Sequence[ClaimOutcome]
    | Callable[[ClaimRequest, int], ClaimOutcome]
    | Callable[[ClaimRequest, int], Awaitable[ClaimOutcome]]
)


class _Fake:
    def __init__(self, respond: Any, enabled: bool, client_id: str | None) -> None:
        self.enabled = enabled
        self.client_id = (client_id or "test-client") if enabled else None
        self.calls: list[ClaimRequest] = []
        """Every request ``claim()`` received, in order."""
        self._respond = respond
        self._queue: list[ClaimOutcome] | None = None if callable(respond) else list(respond)

    def _record(self, request: ClaimRequest) -> ClaimOutcome | None:
        """The canned answer, or None when the responder function must decide."""
        self.calls.append(request)
        if not self.enabled:
            return Unavailable(reason=message("notConfigured"))
        if self._queue is None:
            return None
        if len(self._queue) > 1:
            return self._queue.pop(0)
        return self._queue[0] if self._queue else PendingArrival()


class FakeGatewayClient(_Fake):
    """A ``GatewayClient`` that answers from a script. ``calls`` records every request."""

    def __init__(self, respond: Responder, enabled: bool, client_id: str | None) -> None:
        super().__init__(respond, enabled, client_id)
        self.claims = _SyncClaims(self)

    def close(self) -> None:
        return None


class FakeAsyncGatewayClient(_Fake):
    """An ``AsyncGatewayClient`` that answers from a script."""

    def __init__(self, respond: AsyncResponder, enabled: bool, client_id: str | None) -> None:
        super().__init__(respond, enabled, client_id)
        self.claims = _AsyncClaims(self)

    async def aclose(self) -> None:
        return None


class _SyncClaims:
    def __init__(self, fake: _Fake) -> None:
        self._fake = fake

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
        request = ClaimRequest(
            trx_id=trx_id,
            expected_poisha=expected_poisha,
            idempotency_key=idempotency_key,
            order_ref=order_ref,
            platform=platform,
            sender_phone=sender_phone,
            accept_shortfall=accept_shortfall,
        )
        canned = self._fake._record(request)
        if canned is not None:
            return canned
        outcome: ClaimOutcome = self._fake._respond(request, len(self._fake.calls))
        return outcome


class _AsyncClaims:
    def __init__(self, fake: _Fake) -> None:
        self._fake = fake

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
        request = ClaimRequest(
            trx_id=trx_id,
            expected_poisha=expected_poisha,
            idempotency_key=idempotency_key,
            order_ref=order_ref,
            platform=platform,
            sender_phone=sender_phone,
            accept_shortfall=accept_shortfall,
        )
        canned = self._fake._record(request)
        if canned is not None:
            return canned
        result = self._fake._respond(request, len(self._fake.calls))
        if isinstance(result, Awaitable):
            result = await result
        outcome: ClaimOutcome = result
        return outcome


def create_fake_gateway_client(
    respond: Responder = (), *, enabled: bool = True, client_id: str | None = None
) -> FakeGatewayClient:
    """``respond``: outcomes to hand out in order (the last one repeats), or a
    function ``(request, call_number) -> outcome``. Defaults to PendingArrival."""
    return FakeGatewayClient(respond, enabled, client_id)


def create_fake_async_gateway_client(
    respond: AsyncResponder = (), *, enabled: bool = True, client_id: str | None = None
) -> FakeAsyncGatewayClient:
    """The async fake. A responder function may be sync or async."""
    return FakeAsyncGatewayClient(respond, enabled, client_id)


def claimed_outcome(
    *,
    trx_id: str | None = None,
    platform: Platform | None = None,
    paid_poisha: int | None = None,
    overpaid_poisha: int | None = None,
    underpaid_poisha: int | None = None,
    claimed_at: datetime | None = None,
    replay: bool | None = None,
) -> Claimed:
    """A ``Claimed`` with sensible defaults (spec.json), for building fixtures."""
    d = CLAIMED_OUTCOME_DEFAULTS
    default_at = parse_iso_date(d["claimedAt"])
    assert default_at is not None
    base = Claimed(
        trx_id=str(d["trxId"]),
        platform=d["platform"],  # type: ignore[arg-type]
        paid_poisha=int(d["paidPoisha"]),  # type: ignore[call-overload]
        overpaid_poisha=int(d["overpaidPoisha"]),  # type: ignore[call-overload]
        underpaid_poisha=int(d["underpaidPoisha"]),  # type: ignore[call-overload]
        claimed_at=default_at,
        replay=bool(d["replay"]),
    )
    overrides: dict[str, Any] = {
        "trx_id": trx_id,
        "platform": platform,
        "paid_poisha": paid_poisha,
        "overpaid_poisha": overpaid_poisha,
        "underpaid_poisha": underpaid_poisha,
        "claimed_at": claimed_at,
        "replay": replay,
    }
    return dataclasses.replace(base, **{k: v for k, v in overrides.items() if v is not None})
