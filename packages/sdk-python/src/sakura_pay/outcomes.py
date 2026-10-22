"""The SDK's words for what the gateway said.

The gateway answers a claim with one of a dozen ``reason`` codes. None of them
reach the app: each is translated into one of the outcomes below, so a change
to the gateway's contract touches the SDK and not every app.

Every amount here is integer POISHA (1 taka = 100 poisha), the way a shop
stores money. The gateway speaks taka; the conversion happens at the edge.

The same outcomes, with the same fields, as the TypeScript SDK's
``ClaimOutcome``. ``to_json()`` gives exactly the JSON the TypeScript SDK's
outcome serialises to.
"""

from __future__ import annotations

from dataclasses import dataclass, field, fields
from datetime import datetime, timezone
from typing import Any, Literal

from ._spec import OutcomeName, Platform, Rejection

__all__ = [
    "AlreadyClaimed",
    "ClaimOutcome",
    "ClaimRequest",
    "Claimed",
    "Misconfigured",
    "PendingArrival",
    "Rejected",
    "Released",
    "Unavailable",
    "Underpaid",
]


def _camel(name: str) -> str:
    head, *rest = name.split("_")
    return head + "".join(part.title() for part in rest)


def _iso(value: datetime) -> str:
    utc = value.astimezone(timezone.utc)
    return utc.strftime("%Y-%m-%dT%H:%M:%S.") + f"{utc.microsecond // 1000:03d}Z"


class _Outcome:
    """Shared behaviour: camelCase JSON in the TypeScript SDK's shape."""

    __slots__ = ()

    def to_json(self) -> dict[str, Any]:
        out: dict[str, Any] = {}
        for f in fields(self):  # type: ignore[arg-type]
            value = getattr(self, f.name)
            if value is None and f.metadata.get("omit_none"):
                continue
            out[_camel(f.name)] = _iso(value) if isinstance(value, datetime) else value
        return out


@dataclass(frozen=True, slots=True, kw_only=True)
class Claimed(_Outcome):
    """We own this payment. ``replay`` is True when it was our own earlier claim.
    ``underpaid_poisha`` is above 0 only when the request accepted a shortfall."""

    outcome: Literal["CLAIMED"] = "CLAIMED"
    trx_id: str
    platform: Platform
    paid_poisha: int
    overpaid_poisha: int
    underpaid_poisha: int
    claimed_at: datetime
    replay: bool


@dataclass(frozen=True, slots=True, kw_only=True)
class PendingArrival(_Outcome):
    """The SMS has not reached the gateway yet. Retry later with the same key."""

    outcome: Literal["PENDING_ARRIVAL"] = "PENDING_ARRIVAL"


@dataclass(frozen=True, slots=True, kw_only=True)
class Underpaid(_Outcome):
    """The payment exists and is short. It stays unclaimed so the customer can
    top up, or a person can claim it again with ``accept_shortfall=True``."""

    outcome: Literal["UNDERPAID"] = "UNDERPAID"
    expected_poisha: int
    paid_poisha: int | None


@dataclass(frozen=True, slots=True, kw_only=True)
class AlreadyClaimed(_Outcome):
    """Another order or business has already spent this payment."""

    outcome: Literal["ALREADY_CLAIMED"] = "ALREADY_CLAIMED"
    claimed_at: datetime | None


@dataclass(frozen=True, slots=True, kw_only=True)
class Released(_Outcome):
    """A gateway admin released our earlier claim. Trying again needs a new key."""

    outcome: Literal["RELEASED"] = "RELEASED"
    released_at: datetime | None


@dataclass(frozen=True, slots=True, kw_only=True)
class Rejected(_Outcome):
    """The payment exists but this client may not spend it."""

    outcome: Literal["REJECTED"] = "REJECTED"
    rejection: Rejection
    reason: str


@dataclass(frozen=True, slots=True, kw_only=True)
class Misconfigured(_Outcome):
    """Our request or our credentials are wrong. A bug or a config problem, never retried."""

    outcome: Literal["MISCONFIGURED"] = "MISCONFIGURED"
    reason: str


@dataclass(frozen=True, slots=True, kw_only=True)
class Unavailable(_Outcome):
    """We could not ask: network, timeout, 5xx, rate limit, or not configured."""

    outcome: Literal["UNAVAILABLE"] = "UNAVAILABLE"
    reason: str
    retry_after_seconds: float | None = field(default=None, metadata={"omit_none": True})


ClaimOutcome = (
    Claimed
    | PendingArrival
    | Underpaid
    | AlreadyClaimed
    | Released
    | Rejected
    | Misconfigured
    | Unavailable
)
"""Every answer ``claims.claim()`` can give. Only ``Claimed`` means grant."""

_OUTCOME_CLASSES: dict[OutcomeName, type[_Outcome]] = {
    "CLAIMED": Claimed,
    "PENDING_ARRIVAL": PendingArrival,
    "UNDERPAID": Underpaid,
    "ALREADY_CLAIMED": AlreadyClaimed,
    "RELEASED": Released,
    "REJECTED": Rejected,
    "MISCONFIGURED": Misconfigured,
    "UNAVAILABLE": Unavailable,
}


@dataclass(frozen=True, slots=True, kw_only=True)
class ClaimRequest:
    """One claim, as ``claims.claim()`` received it (see ``FakeGatewayClient.calls``).

    Typed as the SDK expects; at runtime the SDK checks every field, so a
    wrong type comes back as ``Misconfigured`` instead of reaching the gateway.
    """

    trx_id: str
    """As the customer typed it. Case, spaces and dashes don't matter."""
    expected_poisha: int
    """The order total, in integer poisha. Sent to the gateway as taka."""
    idempotency_key: str
    """One key per attempt to pay for one order: ``first_claim_key`` / ``next_claim_key``."""
    order_ref: str | None = None
    """The app's order number, shown in the gateway's ledger."""
    platform: Platform | None = None
    """The wallet the customer says they paid with. A hint, not a filter."""
    sender_phone: str | None = None
    """The number the customer says they paid from."""
    accept_shortfall: bool = False
    """Claim the payment even if it is short, reporting what is still owed as
    ``underpaid_poisha``. For a person who decided to take a short payment,
    never for an automatic checkout. Only ``True`` counts."""
