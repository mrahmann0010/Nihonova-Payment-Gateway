"""Pure helpers an app uses around ``claims.claim()``: no I/O, no client needed."""

from __future__ import annotations

import math
import re

from ._format import message
from ._js import js_round, js_string, js_trim, utf16_len
from ._spec import (
    FAST_RETRY_DELAYS_SECONDS,
    LATE_RETRY_ATTEMPTS,
    LATE_RETRY_INTERVAL_SECONDS,
    MAX_IDEMPOTENCY_KEY_LENGTH,
    PLATFORMS,
    RETRYABLE_OUTCOMES,
)
from .outcomes import ClaimOutcome

__all__ = [
    "claim_key_for",
    "first_claim_key",
    "is_platform",
    "is_retryable",
    "next_claim_key",
    "next_retry_delay_seconds",
    "normalise_trx_id",
    "poisha_to_taka",
    "taka_to_poisha",
]


def is_platform(value: object) -> bool:
    """Whether ``value`` is ``"bkash"``, ``"nagad"`` or ``"rocket"``."""
    return isinstance(value, str) and value in PLATFORMS


# --- trxId -------------------------------------------------------------------

_NOT_ALNUM = re.compile(r"[^A-Za-z0-9]")


def normalise_trx_id(value: object) -> str:
    """The one form two receipts are compared in: uppercase, every non-alphanumeric removed.

    The same rule as the gateway (apps/server/src/services/trxId.js) and the
    TypeScript SDK, pinned by the shared vectors. Use it for your own "is this
    receipt already used in *our* orders?" check, so you compare IDs the way
    the gateway does.
    """
    text = "" if value is None else js_string(value)
    return _NOT_ALNUM.sub("", text).upper()


# --- money -------------------------------------------------------------------


def taka_to_poisha(taka: float) -> int:
    """Rounded, not truncated: 12.34 taka arrives as 12.339999…, and truncating
    would make a correct payment one poisha short of its order."""
    return js_round(taka * 100)


def poisha_to_taka(poisha: int) -> int | float:
    """Whole taka come back as an int, so they serialise as ``1250``, not ``1250.0``."""
    taka = poisha / 100
    return int(taka) if taka.is_integer() else taka


# --- claim keys ----------------------------------------------------------------
#
# The idempotency key an order's payment is claimed with: `<orderRef>:<attempt>`.
# The same key is sent on every retry of one attempt — a timeout, a not-found
# poll, a worker restart — so the gateway hands back our own earlier claim. A
# *new* key for the same payment collides with that claim and comes back
# ALREADY_CLAIMED, which looks exactly like someone else taking the money.
#
# The attempt moves on only when the old key can no longer succeed: a gateway
# admin released the claim (RELEASED), or the order now carries a different
# transaction ID.

# JavaScript's /^(.+):(\d+)$/ spelled out: `.` stops at line breaks and \d is
# ASCII-only there.
_KEY = re.compile(r"([^\n\r  ]+):([0-9]+)")


def first_claim_key(order_ref: str) -> str:
    """``SB-10482`` → ``SB-10482:1``. Raises ValueError for a key the gateway would refuse."""
    return _checked(order_ref, f"{order_ref}:1")


def claim_key_for(order_ref: str, stored_key: str | None) -> str:
    """The key to claim with now: the one stored on the order, or the first one."""
    return stored_key or first_claim_key(order_ref)


def next_claim_key(order_ref: str, current: str | None) -> str:
    """The key for the next attempt: ``SB-10482:1`` → ``SB-10482:2``."""
    match = _KEY.fullmatch(current) if current else None
    attempt = int(match.group(2)) if match and match.group(1) == order_ref else 1
    return _checked(order_ref, f"{order_ref}:{attempt + 1}")


def _checked(order_ref: str, key: str) -> str:
    if not js_trim(order_ref):
        raise ValueError(message("keyNeedsOrderRef"))
    if utf16_len(key) > MAX_IDEMPOTENCY_KEY_LENGTH:
        raise ValueError(
            message("keyWouldBeTooLong", orderRef=order_ref, max=MAX_IDEMPOTENCY_KEY_LENGTH)
        )
    return key


# --- background retry schedule -------------------------------------------------
#
# The customer usually taps "I've paid" a few seconds before the payment SMS
# reaches the gateway, so the first claim at checkout is often PENDING_ARRIVAL.
# Retry quickly at first (FAST_RETRY_DELAYS_SECONDS: 5s, 10s, 20s, then every
# 30s), then stop and leave the order for a person. An order staff have already
# granted by hand keeps being retried every 10 minutes for 8 hours, because the
# payment still has to be marked spent at the gateway once it turns up.
#
# The SDK only computes the schedule. The app runs it with its own job runner
# (Celery, RQ, APScheduler, cron) — blocking a checkout for minutes is never
# the answer.


def next_retry_delay_seconds(
    attempts: float, granted: bool, retry_after_seconds: float | None = None
) -> int | None:
    """Seconds until the next try, or None to stop.

    ``attempts`` counts claims made so far under the current key, including the
    one that just failed. ``granted`` is whether staff already granted the
    order. ``retry_after_seconds`` is the gateway's own "wait this long".
    """
    delay: int | None = None
    fast = FAST_RETRY_DELAYS_SECONDS

    if 1 <= attempts <= len(fast):
        delay = fast[int(attempts) - 1] if float(attempts).is_integer() else None
    elif granted and attempts <= len(fast) + LATE_RETRY_ATTEMPTS:
        delay = LATE_RETRY_INTERVAL_SECONDS

    if delay is None:
        return None
    if retry_after_seconds and retry_after_seconds > delay:
        return math.ceil(retry_after_seconds)
    return delay


def is_retryable(outcome: ClaimOutcome) -> bool:
    """Whether asking again with the same key could change the answer.

    Only PENDING_ARRIVAL and UNAVAILABLE; everything else is final for this
    key. (RELEASED is final for the key — the next attempt needs a new one
    from ``next_claim_key``.)
    """
    return outcome.outcome in RETRYABLE_OUTCOMES
