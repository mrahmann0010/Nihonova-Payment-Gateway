"""JavaScript's semantics, where Python's differ and the shared vectors notice.

The gateway and the TypeScript SDK are JavaScript, and the vectors in
packages/sdk-spec pin their exact behaviour. Wherever Python's built-ins
disagree with JavaScript in a way that would change an outcome or a message,
the SDK goes through one of these instead:

- ``round()`` rounds half to even; ``Math.round`` rounds half up.
- ``str.strip()`` and ``String.prototype.trim`` remove different whitespace.
- ``len()`` counts code points; the gateway's length limits count UTF-16 units.
- ``str(1250.0)`` is ``"1250.0"``; ``String(1250)`` is ``"1250"``.
- ``json.dumps`` spaces its separators, escapes non-ASCII and accepts NaN.
"""

from __future__ import annotations

import json
import math
import re
from typing import Any

from ._spec import WHITESPACE

MISSING: Any = object()
"""A field that is absent, as opposed to present and ``None`` (JSON null)."""


def is_number(value: object) -> bool:
    """``typeof value === "number" && Number.isFinite(value)``. A bool is not a number."""
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def is_integer(value: object) -> bool:
    """``Number.isInteger(value)``: 1250 and 1250.0 both count."""
    return is_number(value) and float(value).is_integer()  # type: ignore[arg-type]


def js_round(value: float) -> int:
    """``Math.round``: the nearest integer, halves toward +∞."""
    floor = math.floor(value)
    return int(floor + 1 if value - floor >= 0.5 else floor)


def js_trim(value: str) -> str:
    """``String.prototype.trim``, by the whitespace set in spec.json."""
    return value.strip(WHITESPACE)


def utf16_len(value: str) -> int:
    """``value.length`` in JavaScript: UTF-16 code units, so an emoji counts 2."""
    return len(value.encode("utf-16-le", "surrogatepass")) // 2


def js_number(value: float) -> str:
    """``String(number)``: the shortest digits, JavaScript's choice of notation."""
    if math.isnan(value):
        return "NaN"
    if math.isinf(value):
        return "Infinity" if value > 0 else "-Infinity"
    if value == 0:
        return "0"
    if value < 0:
        return "-" + js_number(-value)

    mantissa, _, exp_text = repr(float(value)).partition("e")
    whole, _, fraction = mantissa.partition(".")
    raw = whole + fraction
    digits = raw.lstrip("0")
    leading_zeros = len(raw) - len(digits)
    digits = digits.rstrip("0")
    k = len(digits)
    # value = 0.<digits> × 10^n
    n = len(whole) - leading_zeros + int(exp_text or 0)

    if k <= n <= 21:
        return digits + "0" * (n - k)
    if 0 < n <= 21:
        return f"{digits[:n]}.{digits[n:]}"
    if -6 < n <= 0:
        return "0." + "0" * -n + digits
    e = n - 1
    sign = "+" if e >= 0 else "-"
    head = digits if k == 1 else f"{digits[0]}.{digits[1:]}"
    return f"{head}e{sign}{abs(e)}"


def js_string(value: object) -> str:
    """``String(value)`` for what reaches a message: text, numbers, booleans, null."""
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, int) and abs(value) < 10**21:
        return str(value)
    if isinstance(value, (int, float)):
        return js_number(float(value))
    if isinstance(value, str):
        return value
    if isinstance(value, (list, tuple)):
        return ",".join("" if v is None else js_string(v) for v in value)
    if isinstance(value, dict):
        return "[object Object]"
    return str(value)


_INDEX_KEY = re.compile(r"(?:0|[1-9][0-9]*)")


def js_json(value: object) -> str:
    """``JSON.stringify(value)``: compact, non-ASCII kept, JavaScript's key order."""
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        if isinstance(value, float) and not math.isfinite(value):
            return "null"
        return js_string(value)
    if isinstance(value, str):
        return json.dumps(value, ensure_ascii=False)
    if isinstance(value, (list, tuple)):
        return "[" + ",".join(js_json(v) for v in value) + "]"
    if isinstance(value, dict):
        keys = [str(k) for k in value]
        # JavaScript lists array-index keys first, in numeric order.
        index = sorted((k for k in keys if _INDEX_KEY.fullmatch(k) and int(k) < 2**32 - 1), key=int)
        ordered = index + [k for k in keys if k not in index]
        lookup = {str(k): v for k, v in value.items()}
        return "{" + ",".join(f"{js_json(k)}:{js_json(lookup[k])}" for k in ordered) + "}"
    return js_json(str(value))


def shown(value: object) -> str:
    """``JSON.stringify``, except that a missing value reads ``undefined``."""
    return "undefined" if value is MISSING else js_json(value)


def _no_constants(name: str) -> object:
    raise ValueError(f"{name} is not JSON")


def parse_json(content: bytes) -> object:
    """``response.json()``: UTF-8 with an optional BOM, strict JSON, None on failure."""
    text = content.decode("utf-8", errors="replace")
    if text.startswith("﻿"):
        text = text[1:]
    try:
        return json.loads(text, parse_constant=_no_constants)
    except ValueError:
        return None
