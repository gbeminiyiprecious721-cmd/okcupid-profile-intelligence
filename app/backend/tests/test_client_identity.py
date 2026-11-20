"""Which address the rate limiter counts a request under, behind proxies.

Phase 11E found that on Render one client was spread over several buckets and strangers shared them, because the
limiter read the last X-Forwarded-For entry, which is the address of Render's own front end, not the visitor. These tests
describe the layouts involved with invented addresses (documentation ranges) and check three things: the visitor is
found, nothing the visitor controls can pick the bucket, and a wrong setting fails safe.
"""

import pytest
from fastapi.testclient import TestClient

from profile_api.config import Settings
from profile_api.main import create_app
from profile_api.security.ratelimit import client_address, normalise_address

LIMIT = 3


class Clock:
    def __init__(self):
        self.now = 1000.0

    def __call__(self):
        return self.now


def make_client(**overrides):
    settings = Settings(
        _env_file=None,
        app_mode="public",
        rate_limit_enabled=True,
        rate_limit_search_per_minute=LIMIT,
        rate_limit_general_per_minute=50,
        trust_proxy=True,
        **overrides,
    )
    return TestClient(create_app(settings, clock=Clock()))


def search(client, forwarded=None, **headers):
    if forwarded is not None:
        headers["X-Forwarded-For"] = forwarded
    return client.post("/api/v1/discover/similar", json={"text": "hiking with my dog and camping"}, headers=headers)


def scope(*lines):
    return {"headers": [(b"x-forwarded-for", line.encode()) for line in lines], "client": ("172.16.0.9", 1234)}


# Render in front of the application, as measured in Phase 11E: Cloudflare appends the visitor, Render's front end
# appends the address it received the request from. The application therefore sees "<visitor>, <edge address>".
def test_with_two_proxies_one_visitor_is_one_bucket_whatever_the_edge_address():
    with make_client(trusted_proxy_hops=2) as client:
        edges = ["198.51.100.1", "198.51.100.2", "198.51.100.3", "198.51.100.4"]
        codes = [search(client, f"203.0.113.7, {edge}").status_code for edge in edges]
        assert codes == [200, 200, 200, 429]  # the fourth is refused although it came through another edge


def test_two_visitors_behind_the_same_edge_address_do_not_share_a_bucket():
    with make_client(trusted_proxy_hops=2) as client:
        for _ in range(LIMIT):
            assert search(client, "203.0.113.7, 198.51.100.1").status_code == 200
        assert search(client, "203.0.113.7, 198.51.100.1").status_code == 429
        assert search(client, "203.0.113.8, 198.51.100.1").status_code == 200  # a stranger on the same edge


def test_what_the_visitor_prepends_cannot_choose_the_bucket():
    with make_client(trusted_proxy_hops=2) as client:
        codes = [search(client, f"10.9.9.{i}, 203.0.113.7, 198.51.100.1").status_code for i in range(5)]
        assert codes == [200, 200, 200, 429, 429]  # five invented first entries, still one client


def test_a_second_header_line_is_read_as_part_of_the_same_list():
    assert client_address(scope("1.1.1.1", "203.0.113.7, 198.51.100.1"), True, 2) == "203.0.113.7"
    assert client_address(scope("1.1.1.1, 2.2.2.2", "203.0.113.7, 198.51.100.1"), True, 2) == "203.0.113.7"


def test_the_old_setting_reproduces_the_phase_11e_weakness_so_it_stays_visible():
    """With one proxy assumed where there are two, the key is the edge address. Do not use this on Render."""
    with make_client(trusted_proxy_hops=1) as client:
        codes = [search(client, f"203.0.113.7, 198.51.100.{i}").status_code for i in range(1, 7)]
        assert codes == [200] * 6  # one visitor, six edge addresses, no limit reached


def test_a_header_that_is_too_short_is_not_trusted():
    assert client_address(scope("203.0.113.7"), True, 2) == "172.16.0.9"  # falls back to the socket address
    assert client_address({"headers": [], "client": ("172.16.0.9", 1)}, True, 2) == "172.16.0.9"


def test_a_chosen_entry_that_is_not_an_address_is_not_trusted():
    for bad in (
        "garbage, 198.51.100.1",
        "unknown, 198.51.100.1",
        "<script>, 198.51.100.1",
        ", ,198.51.100.1",
        "x" * 500 + ", 198.51.100.1",
    ):
        assert client_address(scope(bad), True, 2) == "172.16.0.9"


def test_the_header_is_ignored_when_the_proxy_is_not_trusted():
    assert client_address(scope("203.0.113.7, 198.51.100.1"), False, 2) == "172.16.0.9"


@pytest.mark.parametrize(
    "text, expected",
    [
        ("203.0.113.7", "203.0.113.7"),
        (" 203.0.113.7 ", "203.0.113.7"),
        ("203.0.113.7:4711", "203.0.113.7"),
        ("::ffff:203.0.113.7", "203.0.113.7"),
        ("2001:db8:1:2:aaaa:bbbb:cccc:dddd", "2001:db8:1:2::/64"),
        ("2001:db8:1:2::1", "2001:db8:1:2::/64"),
        ("[2001:db8:1:2::1]:443", "2001:db8:1:2::/64"),
        ("2001:db8:1:3::1", "2001:db8:1:3::/64"),
        ("203.0.113", None),
        ("203.0.113.256", None),
        ("example.org", None),
        ("", None),
    ],
)
def test_addresses_are_normalised(text, expected):
    assert normalise_address(text) == expected


def test_an_ipv6_visitor_cannot_get_a_fresh_bucket_by_changing_the_low_bits():
    with make_client(trusted_proxy_hops=2) as client:
        codes = [search(client, f"2001:db8:1:2::{i:x}, 198.51.100.1").status_code for i in range(1, 6)]
        assert codes == [200, 200, 200, 429, 429]
        assert search(client, "2001:db8:1:3::1, 198.51.100.1").status_code == 200  # another /64 is another visitor


def test_the_refusal_stays_the_safe_json_with_a_retry_time():
    with make_client(trusted_proxy_hops=2) as client:
        for _ in range(LIMIT):
            search(client, "203.0.113.7, 198.51.100.1")
        blocked = search(client, "203.0.113.7, 198.51.100.1")
        assert blocked.status_code == 429
        assert blocked.json() == {
            "error": {"code": "rate_limited", "message": "Too many requests. Try again in 60 seconds."}
        }
        assert blocked.headers["retry-after"] == "60" and blocked.headers["ratelimit-limit"] == str(LIMIT)
        assert "203.0.113" not in blocked.text and "203.0.113" not in str(dict(blocked.headers))  # no address is echoed
