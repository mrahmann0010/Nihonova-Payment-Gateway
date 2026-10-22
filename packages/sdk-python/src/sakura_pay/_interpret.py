"""Request → wire, and wire → ClaimOutcome. Pure, so every reason code is
testable without a server.

A line-for-line port of packages/sdk/src/resources/claims/interpret.ts and
validate.ts, held to the same vectors (packages/sdk-spec/vectors/claims.json).
A change here is a change there.
"""

from __future__ import annotations

import re
from collections.abc import Callable
from typing import Any

from ._dates import parse_iso_date
from ._format import message
from ._js import MISSING, is_integer, is_number, js_json, js_string, js_trim, shown, utf16_len
from ._spec import MAX_IDEMPOTENCY_KEY_LENGTH
from .helpers import is_platform, normalise_trx_id, poisha_to_taka, taka_to_poisha
from .outcomes import (
    AlreadyClaimed,
    Claimed,
    ClaimOutcome,
    ClaimRequest,
    Misconfigured,
    PendingArrival,
    Rejected,
    Released,
    Unavailable,
    Underpaid,
)

_ALNUM = re.compile(r"[A-Za-z0-9]")


def request_problem(request: ClaimRequest) -> str | None:
    """A claim the SDK refuses to send, or None. These are bugs in the calling
    app, caught before they cost a request."""
    trx_id: Any = request.trx_id
    if not isinstance(trx_id, str) or not _ALNUM.search(trx_id):
        return message("trxIdEmpty")

    amount: Any = request.expected_poisha
    if not is_integer(amount) or amount <= 0:
        return message("amountNotPositiveInt", value=js_string(amount))

    key: Any = request.idempotency_key
    if not isinstance(key, str) or not js_trim(key):
        return message("keyEmpty")
    if utf16_len(js_trim(key)) > MAX_IDEMPOTENCY_KEY_LENGTH:
        return message("keyTooLong", max=MAX_IDEMPOTENCY_KEY_LENGTH)

    if request.platform is not None and not is_platform(request.platform):
        return message("platformInvalid", value=shown(request.platform))

    return None


def to_claim_body(request: ClaimRequest) -> dict[str, Any]:
    """The body the gateway expects, with poisha turned into taka. Keys in the
    same order as every other SDK sends them."""
    order_ref = js_trim(request.order_ref) if isinstance(request.order_ref, str) else ""
    sender_phone = js_trim(request.sender_phone) if isinstance(request.sender_phone, str) else ""

    body: dict[str, Any] = {
        "trxId": normalise_trx_id(request.trx_id),
        "expectedAmount": poisha_to_taka(int(request.expected_poisha)),
        "idempotencyKey": js_trim(request.idempotency_key),
    }
    if order_ref:
        body["orderRef"] = order_ref
    if request.platform:
        body["platform"] = request.platform
    if sender_phone:
        body["senderPhone"] = sender_phone
    # Strictly True: a truthy "yes" must not quietly accept less money.
    if request.accept_shortfall is True:
        body["acceptShortfall"] = True
    return body


def interpret_claim_response(
    status: int,
    body: object,
    expected_poisha: int,
    *,
    retry_after_seconds: float | None = None,
    accept_shortfall: bool = False,
    on_unexpected: Callable[[str], object] | None = None,
) -> ClaimOutcome:
    """Turn one gateway answer into a ClaimOutcome.

    Anything outside the contract never grants: an unknown refusal is
    MISCONFIGURED (someone needs to look) and a 5xx is UNAVAILABLE (try again).
    """

    def unexpected(text: str) -> None:
        if on_unexpected is not None:
            on_unexpected(text)

    if status >= 500:
        return Unavailable(reason=message("gatewayAnswered", status=status))

    if status in (200, 201) and isinstance(body, dict) and body.get("claimed") is True:
        claimed = _read_claimed_body(body)

        if isinstance(claimed, str):
            # The gateway says yes but the answer is incomplete. Asking again
            # with the same key replays the claim, so "try again" is safe here.
            unexpected(message("unreadableSuccessLog", problem=claimed))
            return Unavailable(reason=message("unreadableSuccess"))

        paid_poisha = taka_to_poisha(claimed["amount"])

        # The gateway has already compared amounts. A second look on our side,
        # because a grant is the one answer that ships goods — unless the
        # caller said a short payment is acceptable.
        if paid_poisha < expected_poisha and accept_shortfall is not True:
            unexpected(
                message(
                    "underpaidGrantLog",
                    trxId=claimed["trxId"],
                    paidPoisha=paid_poisha,
                    expectedPoisha=expected_poisha,
                )
            )
            return Underpaid(expected_poisha=expected_poisha, paid_poisha=paid_poisha)

        claimed_at = parse_iso_date(claimed["claimedAt"])
        assert claimed_at is not None
        return Claimed(
            trx_id=claimed["trxId"],
            platform=claimed["platform"],
            paid_poisha=paid_poisha,
            overpaid_poisha=taka_to_poisha(claimed["overpaidBy"]),
            # Our own sum, in exact poisha, rather than the body's float taka.
            underpaid_poisha=max(0, expected_poisha - paid_poisha),
            claimed_at=claimed_at,
            replay=status == 200,
        )

    fields: dict[str, Any] = body if isinstance(body, dict) else {}
    reason = fields.get("reason") if isinstance(fields.get("reason"), str) else None

    if reason == "not_found":
        return PendingArrival()

    if reason == "already_claimed":
        return AlreadyClaimed(claimed_at=parse_iso_date(fields.get("claimedAt")))

    if reason == "claim_released":
        return Released(released_at=parse_iso_date(fields.get("releasedAt")))

    if reason == "amount_mismatch":
        expected: Any = fields.get("expected")
        actual: Any = fields.get("actual")
        return Underpaid(
            expected_poisha=taka_to_poisha(expected) if is_number(expected) else expected_poisha,
            paid_poisha=taka_to_poisha(actual) if is_number(actual) else None,
        )

    if reason == "ambiguous_trx":
        return Rejected(rejection="AMBIGUOUS", reason=message("rejectedAmbiguous"))

    if reason == "outside_claim_window":
        return Rejected(rejection="TOO_OLD", reason=message("rejectedTooOld"))

    if reason == "exceeds_max_claim":
        return Rejected(rejection="OVER_LIMIT", reason=message("rejectedOverLimit"))

    if reason == "sender_mismatch":
        return Rejected(rejection="SENDER_MISMATCH", reason=message("rejectedSenderMismatch"))

    if reason == "rate_limited":
        wait = fields.get("retryAfter")
        return _rate_limited(wait if is_number(wait) else retry_after_seconds)

    if reason == "idempotency_key_reused":
        unexpected(message("keyReusedLog"))
        return Misconfigured(reason=message("keyReused"))

    if reason == "invalid_request":
        detail = _describe(fields.get("detail", MISSING))
        unexpected(message("invalidRequestLog", detail=detail))
        return Misconfigured(reason=message("invalidRequest", detail=detail))

    if reason in ("unauthenticated", "client_inactive"):
        unexpected(message("credentialRefusedLog", reason=reason))
        return Misconfigured(
            reason=message("unauthenticated" if reason == "unauthenticated" else "clientInactive")
        )

    if status == 429:
        return _rate_limited(retry_after_seconds)

    # Includes a wrong base URL: the host's own 404 page, with no reason code.
    unexpected(
        message(
            "outsideContractLog",
            status=status,
            reason=reason if reason is not None else message("noReason"),
        )
    )
    return Misconfigured(
        reason=message("unexpectedAnswer", detail=f"{status}, {reason}" if reason else status)
    )


def _rate_limited(retry_after_seconds: float | None) -> Unavailable:
    return Unavailable(reason=message("rateLimited"), retry_after_seconds=retry_after_seconds)


def _read_claimed_body(body: dict[str, Any]) -> dict[str, Any] | str:
    """The fields a grant depends on, checked by hand."""
    trx_id = body.get("trxId")
    if not isinstance(trx_id, str) or not trx_id:
        return message("bodyTrxIdMissing")
    platform = body.get("platform", MISSING)
    if not is_platform(platform):
        return message("bodyPlatformInvalid", value=shown(platform))
    amount: Any = body.get("amount")
    if not is_number(amount) or amount < 0:
        return message("bodyAmountInvalid")
    if "overpaidBy" in body and (not is_number(body["overpaidBy"]) or body["overpaidBy"] < 0):
        return message("bodyOverpaidInvalid")
    if parse_iso_date(body.get("claimedAt")) is None:
        return message("bodyClaimedAtInvalid")

    return {**body, "overpaidBy": body.get("overpaidBy", 0)}


def _describe(detail: object) -> str:
    """A refusal's ``detail``, as text: a string as is, anything else as JSON."""
    if detail is MISSING:
        return message("noDetail")
    return detail if isinstance(detail, str) else js_json(detail)
