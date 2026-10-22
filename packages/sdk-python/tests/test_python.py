"""What only exists in Python. Everything shared is in test_vectors.py."""

from __future__ import annotations

import asyncio
import logging
import socket
import threading
from collections.abc import Iterator
from typing import Any

import pytest

import sakura_pay
from sakura_pay import (
    AlreadyClaimed,
    Claimed,
    GatewayConfigError,
    Unavailable,
    create_async_gateway_client,
    create_gateway_client,
)
from sakura_pay._flow import RetryDeps
from sakura_pay.testing import (
    claimed_outcome,
    create_fake_async_gateway_client,
    create_fake_gateway_client,
)

from .vectors import load, request_kwargs

SECRET = "s3cret.with.dots"
GOOD: dict[str, Any] = {
    "base_url": "https://gateway.example",
    "client_id": "sakura-book",
    "secret": SECRET,
}
REQUEST = request_kwargs(load("vectors/claims.json")["baseRequest"])


def test_version_is_the_spec_version():
    assert sakura_pay.__version__ == load("spec.json")["version"]


def test_the_secret_is_not_on_the_client():
    client = create_gateway_client(**GOOD)
    assert SECRET not in repr(client)
    assert SECRET not in repr(client.claims)
    with pytest.raises(AttributeError):
        client.enabled = False
    client.close()


def test_the_secret_is_not_in_a_config_error():
    with pytest.raises(GatewayConfigError) as error:
        create_gateway_client(**{**GOOD, "base_url": "http://gateway.example"})
    assert "s3cret" not in str(error.value)
    assert "base_url" in str(error.value)


def test_a_config_error_is_a_value_error():
    assert issubclass(GatewayConfigError, ValueError)


def test_never_raises_against_a_bug_inside_the_sdk(caplog: pytest.LogCaptureFixture):
    def boom(_ms: float) -> None:
        raise RuntimeError("boom")

    import httpx

    transport = httpx.MockTransport(lambda request: httpx.Response(503, json={}))
    client = create_gateway_client(
        **GOOD,
        logger=logging.getLogger("sakura_pay.test"),
        http_client=httpx.Client(transport=transport),
        _deps=RetryDeps(now=lambda: 0, random=lambda: 0.5, sleep=boom),
    )
    with caplog.at_level(logging.ERROR, logger="sakura_pay.test"):
        outcome = client.claims.claim(**REQUEST)

    assert outcome == Unavailable(reason="Unexpected error: RuntimeError: boom")
    assert caplog.messages == ["Payment gateway claim failed unexpectedly: RuntimeError: boom"]


def test_an_unconfigured_client_needs_no_network():
    client = create_gateway_client(base_url=None, client_id=None, secret=None)
    assert client.enabled is False and client.client_id is None
    assert client.claims.claim(**REQUEST) == Unavailable(
        reason="The payment gateway is not configured."
    )


def test_outcomes_support_match():
    outcome = claimed_outcome(paid_poisha=130_000)
    match outcome:
        case Claimed(paid_poisha=paid, replay=False):
            assert paid == 130_000
        case _:
            pytest.fail("no match")


def test_fake_answers_per_request_when_given_a_function():
    gateway = create_fake_gateway_client(
        lambda req, call: (
            AlreadyClaimed(claimed_at=None)
            if req.trx_id == "USED"
            else claimed_outcome(replay=call > 1)
        )
    )
    assert gateway.claims.claim(**{**REQUEST, "trx_id": "USED"}).outcome == "ALREADY_CLAIMED"
    assert gateway.claims.claim(**REQUEST) == claimed_outcome(replay=True)
    assert [c.trx_id for c in gateway.calls] == ["USED", "8F3K2M9X01"]


def test_async_fake_takes_an_async_function():
    async def respond(req: Any, call: int) -> Claimed:
        await asyncio.sleep(0)
        return claimed_outcome(replay=call > 1)

    gateway = create_fake_async_gateway_client(respond)

    async def run() -> list[bool]:
        return [(await gateway.claims.claim(**REQUEST)).replay for _ in range(2)]  # type: ignore[union-attr]

    assert asyncio.run(run()) == [False, True]


# --- a real socket ---------------------------------------------------------------


@pytest.fixture
def silent_server() -> Iterator[str]:
    """A server that accepts a connection and never answers."""
    sock = socket.socket()
    sock.bind(("127.0.0.1", 0))
    sock.listen()
    held: list[socket.socket] = []
    stop = threading.Event()

    def accept() -> None:
        sock.settimeout(0.1)
        while not stop.is_set():
            try:
                held.append(sock.accept()[0])
            except OSError:
                continue

    thread = threading.Thread(target=accept, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{sock.getsockname()[1]}"
    stop.set()
    thread.join()
    for conn in held:
        conn.close()
    sock.close()


def test_sync_timeout_on_a_real_socket(silent_server: str):
    client = create_gateway_client(
        **{**GOOD, "base_url": silent_server}, timeout_ms=200, max_retries=0
    )
    assert client.claims.claim(**REQUEST) == Unavailable(
        reason="The payment gateway did not answer within 200 ms."
    )
    client.close()


def test_async_timeout_on_a_real_socket(silent_server: str):
    async def run() -> Any:
        async with create_async_gateway_client(
            **{**GOOD, "base_url": silent_server}, timeout_ms=200, max_retries=0
        ) as client:
            return await client.claims.claim(**REQUEST)

    assert asyncio.run(run()) == Unavailable(
        reason="The payment gateway did not answer within 200 ms."
    )
