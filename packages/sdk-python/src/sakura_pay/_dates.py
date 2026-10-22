"""Timestamps from the gateway, read strictly (vectors/helpers.json → parseIsoDate).

The gateway only ever sends ISO 8601 with a zone; anything else is None, in
every SDK, by the same rule. Millisecond precision; extra fraction digits are
cut, not rounded.
"""

from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone

_ISO = re.compile(
    r"([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2})"
    r"(?::([0-9]{2})(?:\.([0-9]+))?)?(Z|[+-][0-9]{2}:[0-9]{2})"
)


def days_in(year: int, month: int) -> int:
    if month == 2:
        return 29 if year % 4 == 0 and (year % 100 != 0 or year % 400 == 0) else 28
    return 30 if month in (4, 6, 9, 11) else 31


def parse_iso_date(value: object) -> datetime | None:
    if not isinstance(value, str):
        return None
    m = _ISO.fullmatch(value)
    if not m:
        return None

    year, month, day, hour, minute = (int(m.group(i)) for i in range(1, 6))
    second = int(m.group(6)) if m.group(6) is not None else 0
    ms = int(m.group(7)[:3].ljust(3, "0")) if m.group(7) is not None else 0

    if year < 1 or not 1 <= month <= 12 or not 1 <= day <= days_in(year, month):
        return None
    if hour > 23 or minute > 59 or second > 59:
        return None

    offset_minutes = 0
    zone = m.group(8)
    if zone != "Z":
        oh, om = int(zone[1:3]), int(zone[4:6])
        if oh > 23 or om > 59:
            return None
        offset_minutes = (-1 if zone[0] == "-" else 1) * (oh * 60 + om)

    try:
        local = datetime(year, month, day, hour, minute, second, ms * 1000, tzinfo=timezone.utc)
        return local - timedelta(minutes=offset_minutes)
    except OverflowError:
        return None
