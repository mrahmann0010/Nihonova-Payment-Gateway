"""The only exception the SDK raises (besides ValueError from the claim-key helpers)."""

from __future__ import annotations


class GatewayConfigError(ValueError):
    """Raised by ``create_gateway_client`` when its config is wrong.

    At boot, so a bad deploy fails before the first checkout instead of during
    it. Once a client exists, ``claim()`` never raises: every failure is an
    outcome.
    """
