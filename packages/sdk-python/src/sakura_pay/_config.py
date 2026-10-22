"""Check the config once, at construction (mirrors packages/sdk/src/config.ts).

Every problem found here is a deploy mistake, so it raises — failing the boot
rather than the first customer's checkout.
"""

from __future__ import annotations

from dataclasses import dataclass
from urllib.parse import urlsplit

from ._format import field_name, message
from ._js import is_integer, is_number, js_trim
from ._spec import DEFAULT_MAX_RETRIES, DEFAULT_TIMEOUT_MS, DEFAULT_TOTAL_BUDGET_MS, LOCAL_HOSTS
from .errors import GatewayConfigError


@dataclass(frozen=True, slots=True)
class RetryPolicy:
    timeout_ms: float
    """Ceiling for one attempt. Clipped to what is left of the budget."""
    total_budget_ms: float
    """Ceiling for one call, retries included."""
    max_retries: int
    """Extra attempts after the first. 0 turns in-call retries off."""


@dataclass(frozen=True, slots=True)
class Disabled:
    enabled: bool = False


@dataclass(frozen=True, slots=True)
class Resolved:
    claims_url: str
    client_id: str
    authorization: str
    policy: RetryPolicy
    enabled: bool = True

    def __repr__(self) -> str:
        # The authorization header carries the secret.
        return f"Resolved(claims_url={self.claims_url!r}, client_id={self.client_id!r})"


def resolve_config(
    *,
    base_url: object,
    client_id: object,
    secret: object,
    timeout_ms: object = None,
    total_budget_ms: object = None,
    max_retries: object = None,
) -> Resolved | Disabled:
    url, cid, key = _blank_to_none(base_url), _blank_to_none(client_id), _blank_to_none(secret)

    given = [v for v in (url, cid, key) if v]
    if not given:
        return Disabled()
    if len(given) < 3:
        missing = [
            field_name(name)
            for name, value in (("baseUrl", url), ("clientId", cid), ("secret", key))
            if not value
        ]
        raise GatewayConfigError(message("configIncomplete", missing=", ".join(missing)))
    assert url and cid and key

    origin_and_path = _parse_base_url(url)

    # The credential is `<clientId>.<secret>` and the server splits on the FIRST
    # dot, so a dot inside the client ID would send the wrong credential.
    if "." in cid:
        raise GatewayConfigError(message("clientIdHasDot"))

    return Resolved(
        claims_url=f"{origin_and_path}/v1/claims",
        client_id=cid,
        authorization=f"Bearer {cid}.{key}",
        policy=RetryPolicy(
            timeout_ms=_positive("timeoutMs", timeout_ms, DEFAULT_TIMEOUT_MS),
            total_budget_ms=_positive("totalBudgetMs", total_budget_ms, DEFAULT_TOTAL_BUDGET_MS),
            max_retries=_non_negative_int("maxRetries", max_retries, DEFAULT_MAX_RETRIES),
        ),
    )


_DEFAULT_PORTS = {"http": 80, "https": 443}


def _parse_base_url(raw: str) -> str:
    """The WHATWG URL rules the TypeScript SDK gets from ``new URL()``, for the
    shapes a gateway base URL takes (vectors/config.json)."""
    not_a_url = GatewayConfigError(message("baseUrlNotUrl", raw=raw))
    try:
        parts = urlsplit(raw)
        # Lowercased; IPv6 without its brackets. `.port` raises when out of range.
        host, port = parts.hostname, parts.port
    except ValueError:
        raise not_a_url from None

    scheme = parts.scheme.lower()
    # Any scheme parses as a URL; http(s) also needs a host.
    if not scheme or (scheme in _DEFAULT_PORTS and not host):
        raise not_a_url
    if scheme != "https" and not (scheme == "http" and host in LOCAL_HOSTS):
        raise GatewayConfigError(message("baseUrlNotHttps"))
    if parts.username or parts.password or parts.query or parts.fragment:
        raise GatewayConfigError(message("baseUrlNotPlain"))

    assert host is not None
    shown_host = f"[{host}]" if ":" in host else host
    shown_port = "" if port is None or port == _DEFAULT_PORTS[scheme] else f":{port}"
    return f"{scheme}://{shown_host}{shown_port}{parts.path or '/'}".rstrip("/")


def _blank_to_none(value: object) -> str | None:
    trimmed = js_trim(value) if isinstance(value, str) else None
    return trimmed or None


def _positive(name: str, value: object, fallback: float) -> float:
    if value is None:
        return fallback
    if not is_number(value) or value <= 0:  # type: ignore[operator]
        raise GatewayConfigError(message("notPositive", name=field_name(name)))
    return value  # type: ignore[return-value]


def _non_negative_int(name: str, value: object, fallback: int) -> int:
    if value is None:
        return fallback
    if not is_integer(value) or value < 0:  # type: ignore[operator]
        raise GatewayConfigError(message("notNonNegativeInt", name=field_name(name)))
    return int(value)  # type: ignore[call-overload, no-any-return]
