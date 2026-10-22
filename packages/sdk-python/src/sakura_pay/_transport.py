"""One JSON POST. Knows HTTP, not payments (mirrors packages/sdk/src/transport/http.ts).

Never raises: a network failure or a timeout comes back as a value, so the
layers above can promise the same. The credential is passed in already built
and is never put into a returned value or a message.
"""

from __future__ import annotations

import asyncio
import calendar
import math
import re
import time
from dataclasses import dataclass

import httpx

from ._dates import days_in
from ._js import js_json, parse_json


@dataclass(frozen=True, slots=True)
class HttpResponse:
    status: int
    body: object
    retry_after_seconds: float | None = None


@dataclass(frozen=True, slots=True)
class HttpFailure:
    timed_out: bool
    message: str


HttpResult = HttpResponse | HttpFailure


def _request(url: str, body: object, authorization: str) -> dict[str, object]:
    return {
        "url": url,
        "content": js_json(body).encode("utf-8"),
        "headers": {
            "Authorization": authorization,
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
    }


def _response(response: httpx.Response) -> HttpResponse:
    return HttpResponse(
        status=response.status_code,
        # None for anything that isn't JSON — a 5xx HTML page is still
        # answered by its status.
        body=parse_json(response.content),
        retry_after_seconds=parse_retry_after(response.headers.get("retry-after")),
    )


def _timeout(timeout_ms: float) -> httpx.Timeout:
    return httpx.Timeout(timeout_ms / 1000)


def post_json(
    client: httpx.Client, url: str, body: object, authorization: str, timeout_ms: float
) -> HttpResult:
    try:
        response = client.post(**_request(url, body, authorization), timeout=_timeout(timeout_ms))  # type: ignore[arg-type]
    except httpx.TimeoutException:
        return HttpFailure(timed_out=True, message=f"no answer within {timeout_ms} ms")
    except Exception as error:
        return HttpFailure(timed_out=False, message=_describe_error(error))
    return _response(response)


async def apost_json(
    client: httpx.AsyncClient, url: str, body: object, authorization: str, timeout_ms: float
) -> HttpResult:
    try:
        # httpx's timeout is per read; wait_for makes it a ceiling on the whole
        # request, as the TypeScript SDK's AbortSignal.timeout is.
        response = await asyncio.wait_for(
            client.post(**_request(url, body, authorization), timeout=_timeout(timeout_ms)),  # type: ignore[arg-type]
            timeout_ms / 1000,
        )
    except (httpx.TimeoutException, asyncio.TimeoutError):
        return HttpFailure(timed_out=True, message=f"no answer within {timeout_ms} ms")
    except Exception as error:
        return HttpFailure(timed_out=False, message=_describe_error(error))
    return _response(response)


def _describe_error(error: Exception) -> str:
    text = str(error) or type(error).__name__
    cause = error.__cause__
    return f"{text}: {cause}" if cause and str(cause) and str(cause) not in text else text


# --- Retry-After -------------------------------------------------------------

_SECONDS = re.compile(r"[ \t]*([0-9]+(?:\.[0-9]+)?)[ \t]*")
_MONTHS = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")
_IMF_FIXDATE = re.compile(
    r"[ \t]*(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), ([0-9]{2}) (" + "|".join(_MONTHS) + r") "
    r"([0-9]{4}) ([0-9]{2}):([0-9]{2}):([0-9]{2}) GMT[ \t]*"
)


def now_ms() -> int:
    """``Date.now()``: whole milliseconds since the epoch."""
    return time.time_ns() // 1_000_000


def parse_retry_after(header: str | None, now: int | None = None) -> float | None:
    """Retry-After: delta-seconds, or an HTTP date in the one format servers must
    send (IMF-fixdate). Anything else is ignored rather than guessed at."""
    if not header:
        return None

    seconds = _SECONDS.fullmatch(header)
    if seconds:
        value = float(seconds.group(1))
        return int(value) if value.is_integer() else value

    date = _IMF_FIXDATE.fullmatch(header)
    if not date:
        return None
    day, year, hour, minute, second = (int(date.group(i)) for i in (1, 3, 4, 5, 6))
    month = _MONTHS.index(date.group(2)) + 1
    if not 1 <= day <= days_in(year, month) or hour > 23 or minute > 59 or second > 59:
        return None
    at = calendar.timegm((year, month, day, hour, minute, second, 0, 0, 0)) * 1000
    current = now_ms() if now is None else now
    return max(0, math.ceil((at - current) / 1000))
