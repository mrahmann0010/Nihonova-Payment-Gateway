"""sakura-pay — the server-side client for the Nihonova payment gateway.

Claims a bKash / Nagad / Rocket payment for an order, exactly once across every
business that shares the receiving number. The Python twin of the npm package
``@project-sakura/pay``: the same rules, outcomes and messages, held to the
same shared test vectors.

Anything not exported here is internal and may change in any release; anything
exported here follows semver.
"""

from ._flow import GatewayLogger
from ._spec import (
    FAST_RETRY_DELAYS_SECONDS,
    LATE_RETRY_ATTEMPTS,
    LATE_RETRY_INTERVAL_SECONDS,
    PLATFORMS,
    VERSION,
    OutcomeName,
    Platform,
    Rejection,
)
from .client import (
    AsyncClaimsResource,
    AsyncGatewayClient,
    ClaimsResource,
    GatewayClient,
    create_async_gateway_client,
    create_gateway_client,
)
from .errors import GatewayConfigError
from .helpers import (
    claim_key_for,
    first_claim_key,
    is_platform,
    is_retryable,
    next_claim_key,
    next_retry_delay_seconds,
    normalise_trx_id,
    poisha_to_taka,
    taka_to_poisha,
)
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

__version__ = VERSION

__all__ = [
    "FAST_RETRY_DELAYS_SECONDS",
    "LATE_RETRY_ATTEMPTS",
    "LATE_RETRY_INTERVAL_SECONDS",
    "PLATFORMS",
    "VERSION",
    "AlreadyClaimed",
    "AsyncClaimsResource",
    "AsyncGatewayClient",
    "ClaimOutcome",
    "ClaimRequest",
    "Claimed",
    "ClaimsResource",
    "GatewayClient",
    "GatewayConfigError",
    "GatewayLogger",
    "Misconfigured",
    "OutcomeName",
    "PendingArrival",
    "Platform",
    "Rejected",
    "Rejection",
    "Released",
    "Unavailable",
    "Underpaid",
    "__version__",
    "claim_key_for",
    "create_async_gateway_client",
    "create_gateway_client",
    "first_claim_key",
    "is_platform",
    "is_retryable",
    "next_claim_key",
    "next_retry_delay_seconds",
    "normalise_trx_id",
    "poisha_to_taka",
    "taka_to_poisha",
]
