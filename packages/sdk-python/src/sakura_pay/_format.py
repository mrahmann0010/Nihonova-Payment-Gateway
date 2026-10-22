"""Messages from spec.json, shared word for word with every other SDK."""

from __future__ import annotations

import re

from ._js import js_string
from ._spec import CONFIG_FIELDS, MESSAGES

# A camelCase option name standing alone in a template (not a {slot}).
_FIELD = re.compile(r"(?<!\{)\b(" + "|".join(CONFIG_FIELDS) + r")\b(?!\})")
_SLOT = re.compile(r"\{(\w+)\}")


def field_name(camel: str) -> str:
    """This SDK's spelling of a config option: ``baseUrl`` → ``base_url``."""
    return CONFIG_FIELDS.get(camel, camel)


def python_names(text: str) -> str:
    """Option names in ``text`` respelled for Python, outside of ``{slots}``."""
    return _FIELD.sub(lambda m: field_name(m.group(1)), text)


def message(message_id: str, **values: object) -> str:
    """The template ``message_id`` with its ``{name}`` slots filled.

    Values print the way JavaScript's ``String()`` prints them, so a number in
    a message reads the same in every SDK.
    """
    template = python_names(MESSAGES[message_id])
    return _SLOT.sub(
        lambda m: js_string(values[m.group(1)]) if m.group(1) in values else m.group(0),
        template,
    )
