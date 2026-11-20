"""uvicorn must not decide the client address from a header a visitor can write.

Phase 11F, Step 2. uvicorn's own proxy header handling replaces the request's socket address with an entry of
X-Forwarded-For when the connecting peer is trusted. With FORWARDED_ALLOW_IPS=* every peer is trusted and the entry is
the first one, which the visitor writes. The rate limiter falls back to the socket address when the header has no usable
entry, so that fallback would become choosable. The production command pins the trusted peers to the loopback address.
"""

import asyncio
import re
from pathlib import Path

import pytest
from uvicorn import Config
from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware

DOCKERFILE = Path(__file__).resolve().parents[2] / "deploy" / "Dockerfile.render"
RENDER_PEER = "10.20.30.40"  # a proxy address that is not loopback, as on Render


def seen_client(trusted_hosts, forwarded, peer=RENDER_PEER):
    """The client address the application would see, after uvicorn's proxy header handling."""
    seen = {}

    async def app(scope, receive, send):
        seen["client"] = scope["client"][0]

    scope = {"type": "http", "client": (peer, 5000), "headers": [(b"x-forwarded-for", forwarded.encode())]}
    asyncio.run(ProxyHeadersMiddleware(app, trusted_hosts=trusted_hosts)(scope, None, None))
    return seen["client"]


def test_the_production_command_pins_the_trusted_peers_to_loopback():
    command = next(line for line in DOCKERFILE.read_text().splitlines() if line.startswith("CMD "))
    assert re.search(r"--forwarded-allow-ips 127\.0\.0\.1(\s|\"|$)", command)
    assert "--workers 1" in command and "--no-access-log" in command and "--no-server-header" in command


def test_the_option_wins_over_a_permissive_environment_variable(monkeypatch):
    monkeypatch.setenv("FORWARDED_ALLOW_IPS", "*")
    assert Config("profile_api.main:app", forwarded_allow_ips="127.0.0.1").forwarded_allow_ips == "127.0.0.1"
    # Without the option the environment decides. This is the weakness the option removes.
    assert Config("profile_api.main:app").forwarded_allow_ips == "*"


@pytest.mark.parametrize("forged", ["forged-1", "6.6.6.6", "6.6.6.6, 7.7.7.7", "", "2001:db8::1"])
def test_a_forged_header_from_a_proxy_that_is_not_trusted_leaves_the_socket_address_alone(forged):
    assert seen_client("127.0.0.1", forged) == RENDER_PEER


def test_the_permissive_setting_would_have_let_the_visitor_choose_the_address():
    assert seen_client("*", "forged-1, 198.51.100.1") == "forged-1"  # documents the weakness, do not use on Render


def test_a_proxy_on_loopback_is_still_believed():
    assert seen_client("127.0.0.1", "203.0.113.5", peer="127.0.0.1") == "203.0.113.5"
