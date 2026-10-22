"""Reading packages/sdk-spec: the vectors every SDK must pass, and the small
vocabulary they're written in. The TypeScript runner implements the same
vocabulary (packages/sdk/test/vectors/load.ts); keep the two in step.

  "$name"                         a value defined at the top of the file
  {"$repeat": "x", "times": 3}    "xxx"
  {"$concat": [a, b]}             a + b, as strings
  {"$merge": [a, b]}              b's fields over a's
  {"$delete": true}               inside a patch: remove the field
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from sakura_pay import outcomes
from sakura_pay._dates import parse_iso_date

SPEC_DIR = Path(__file__).resolve().parents[2] / "sdk-spec"


def load(path: str) -> Any:
    return json.loads((SPEC_DIR / path).read_text("utf-8"))


def expand(value: Any, refs: dict[str, Any] | None = None) -> Any:
    refs = refs or {}
    if isinstance(value, str) and value.startswith("$") and value[1:] in refs:
        return expand(refs[value[1:]], refs)
    if isinstance(value, list):
        return [expand(v, refs) for v in value]
    if isinstance(value, dict):
        if "$repeat" in value:
            return str(value["$repeat"]) * int(value["times"])
        if "$concat" in value:
            return "".join(expand(v, refs) for v in value["$concat"])
        if "$merge" in value:
            merged: dict[str, Any] = {}
            for part in value["$merge"]:
                merged.update(expand(part, refs))
            return merged
        return {k: expand(v, refs) for k, v in value.items()}
    return value


def patched(base: Any, patch: Any, refs: dict[str, Any] | None = None) -> dict[str, Any]:
    out = dict(expand(base, refs))
    for key, value in (patch or {}).items():
        if isinstance(value, dict) and value.get("$delete"):
            out.pop(key, None)
        else:
            out[key] = expand(value, refs)
    return out


def snake(name: str) -> str:
    return re.sub(r"(?<!^)(?=[A-Z])", "_", name).lower()


def request_kwargs(request: dict[str, Any]) -> dict[str, Any]:
    """A vector's camelCase request as ``claims.claim()`` keyword arguments."""
    return {snake(k): v for k, v in request.items()}


def outcome_from_json(data: dict[str, Any]) -> outcomes.ClaimOutcome:
    """The inverse of ``to_json()``: a vector's outcome as the SDK's dataclass."""
    cls = {
        "CLAIMED": outcomes.Claimed,
        "PENDING_ARRIVAL": outcomes.PendingArrival,
        "UNDERPAID": outcomes.Underpaid,
        "ALREADY_CLAIMED": outcomes.AlreadyClaimed,
        "RELEASED": outcomes.Released,
        "REJECTED": outcomes.Rejected,
        "MISCONFIGURED": outcomes.Misconfigured,
        "UNAVAILABLE": outcomes.Unavailable,
    }[data["outcome"]]
    fields = {snake(k): v for k, v in data.items() if k != "outcome"}
    for key in ("claimed_at", "released_at"):
        if isinstance(fields.get(key), str):
            fields[key] = parse_iso_date(fields[key])
    return cls(**fields)  # type: ignore[no-any-return]
