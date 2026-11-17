"""The global search safeguard: how many searches may be in progress at once, from all visitors together.

Phase 11F. The service runs on a fraction of a CPU, where one search takes about a second and a long one much more.
Without a bound, a burst of searches from many addresses queues for a minute or more. These tests drive the middleware
directly with searches that stay open until released, and check that the bound is enforced, that it does not cost
anyone their own quota, and that it touches nothing else.
"""

import asyncio

import pytest

from profile_api.config import Settings
from profile_api.security.ratelimit import RateLimitMiddleware

SEARCH = ("POST", "/api/v1/discover/similar")
META = ("GET", "/api/v1/meta")
HEALTH = ("GET", "/api/v1/health")


class Harness:
    """A middleware in front of an application that holds every request open until release() is called."""

    def __init__(self, **options):
        self.release_event = asyncio.Event()
        self.fail = False
        options.setdefault("search_per_minute", 100)
        options.setdefault("general_per_minute", 100)
        options.setdefault("max_inflight_per_visitor", 100)  # the tests below that need it set their own
        self.middleware = RateLimitMiddleware(self.app, trust_proxy=True, trusted_proxy_hops=1, **options)

    async def app(self, scope, receive, send):
        await self.release_event.wait()
        if self.fail:
            raise RuntimeError("the search broke")
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b"{}"})

    def release(self):
        self.release_event.set()

    async def request(self, route, visitor):
        method, path = route
        scope = {
            "type": "http",
            "method": method,
            "path": path,
            "headers": [(b"x-forwarded-for", visitor.encode())],
            "client": ("172.16.0.9", 1),
        }
        sent = []

        async def send(message):
            sent.append(message)

        async def receive():
            return {"type": "http.request", "body": b"", "more_body": False}

        try:
            await self.middleware(scope, receive, send)
        except RuntimeError:
            return None
        start = next(m for m in sent if m["type"] == "http.response.start")
        body = next(m for m in sent if m["type"] == "http.response.body")["body"]
        return start["status"], dict(start["headers"]), body

    def start(self, route, visitor):
        return asyncio.ensure_future(self.request(route, visitor))


async def let_them_start():
    for _ in range(5):
        await asyncio.sleep(0)


def run(coroutine):
    return asyncio.run(coroutine)


def test_searches_beyond_the_bound_are_refused_at_once_with_a_short_retry_time():
    async def scenario():
        h = Harness(max_inflight_searches=2)
        first, second = h.start(SEARCH, "203.0.113.1"), h.start(SEARCH, "203.0.113.2")
        await let_them_start()
        status, headers, body = await h.request(SEARCH, "203.0.113.3")  # a stranger arrives while two are running
        assert status == 429
        assert headers[b"retry-after"] == b"5"
        assert b'"code": "busy"' in body and b"busy right now" in body
        h.release()
        assert [(await first)[0], (await second)[0]] == [200, 200]  # the two that were running are unaffected
        assert (await h.request(SEARCH, "203.0.113.3"))[0] == 200  # and the slot is free again afterwards

    run(scenario())


def test_a_refusal_for_being_busy_does_not_use_up_the_visitors_own_quota():
    async def scenario():
        h = Harness(max_inflight_searches=1, search_per_minute=3)
        blocker = h.start(SEARCH, "203.0.113.1")
        await let_them_start()
        for _ in range(10):  # ten refusals for being busy, from a visitor whose own limit is three a minute
            status, headers, _ = await h.request(SEARCH, "203.0.113.2")
            assert status == 429 and headers[b"retry-after"] == b"5"
        h.release()
        await blocker
        codes = [(await h.request(SEARCH, "203.0.113.2"))[0] for _ in range(4)]
        assert codes == [200, 200, 200, 429]  # the full quota of three is still there, then the visitor's own limit

    run(scenario())


def test_the_visitors_own_limit_is_checked_first_and_keeps_its_own_message():
    async def scenario():
        h = Harness(max_inflight_searches=1, search_per_minute=1)
        h.release()
        assert (await h.request(SEARCH, "203.0.113.1"))[0] == 200
        status, _, body = await h.request(SEARCH, "203.0.113.1")
        assert status == 429 and b"rate_limited" in body and b"busy" not in body

    run(scenario())


def test_one_noisy_visitor_cannot_use_more_than_their_own_share_of_the_bound():
    async def scenario():
        h = Harness(max_inflight_searches=4, search_per_minute=2)
        noisy = [h.start(SEARCH, "203.0.113.1") for _ in range(10)]
        await let_them_start()
        quiet = h.start(SEARCH, "203.0.113.2")  # someone else arrives in the middle of the burst
        await let_them_start()
        assert h.middleware.inflight == 3  # two from the noisy visitor and one from the quiet one, not four from one
        h.release()
        results = [r[0] for r in await asyncio.gather(*noisy)]
        assert results.count(200) == 2 and results.count(429) == 8
        assert (await quiet)[0] == 200

    run(scenario())


def test_the_health_check_and_other_pages_keep_working_while_the_service_is_full():
    async def scenario():
        h = Harness(max_inflight_searches=1)
        blocker = h.start(SEARCH, "203.0.113.1")
        await let_them_start()
        meta = h.start(META, "203.0.113.2")  # held open too, but it is not a search
        health = h.start(HEALTH, "203.0.113.3")
        await let_them_start()
        assert h.middleware.inflight == 1  # only the search is counted
        h.release()
        assert [(await meta)[0], (await health)[0], (await blocker)[0]] == [200, 200, 200]

    run(scenario())


def test_a_search_that_fails_gives_its_slot_back():
    async def scenario():
        h = Harness(max_inflight_searches=1)
        h.fail = True
        h.release()
        assert await h.request(SEARCH, "203.0.113.1") is None
        assert h.middleware.inflight == 0
        h.fail = False
        assert (await h.request(SEARCH, "203.0.113.2"))[0] == 200

    run(scenario())


def test_a_cancelled_search_gives_its_slot_back():
    async def scenario():
        h = Harness(max_inflight_searches=1)
        task = h.start(SEARCH, "203.0.113.1")
        await let_them_start()
        assert h.middleware.inflight == 1
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
        assert h.middleware.inflight == 0

    run(scenario())


def test_zero_turns_the_safeguard_off():
    async def scenario():
        h = Harness(max_inflight_searches=0)
        tasks = [h.start(SEARCH, f"203.0.113.{i}") for i in range(1, 30)]
        await let_them_start()
        assert h.middleware.inflight == 0
        h.release()
        assert {(await t)[0] for t in tasks} == {200}

    run(scenario())


def test_the_busy_answer_is_safe_json_that_names_no_address_and_carries_the_usual_headers():
    async def scenario():
        h = Harness(max_inflight_searches=1, search_per_minute=5)
        blocker = h.start(SEARCH, "203.0.113.1")
        await let_them_start()
        status, headers, body = await h.request(SEARCH, "198.51.100.77")
        assert status == 429
        assert headers[b"content-type"] == b"application/json"
        assert headers[b"ratelimit-limit"] == b"5" and headers[b"ratelimit-remaining"] == b"5"
        assert b"198.51.100" not in body and b"198.51.100" not in repr(headers).encode()
        assert b"Traceback" not in body
        h.release()
        await blocker

    run(scenario())


def test_the_setting_has_a_safe_default_and_rejects_nonsense(monkeypatch):
    monkeypatch.delenv("PROFILE_RATE_LIMIT_MAX_INFLIGHT_SEARCHES", raising=False)
    assert Settings(_env_file=None).rate_limit_max_inflight_searches == 4
    monkeypatch.setenv("PROFILE_RATE_LIMIT_MAX_INFLIGHT_SEARCHES", "3")
    assert Settings(_env_file=None).rate_limit_max_inflight_searches == 3
    monkeypatch.setenv("PROFILE_RATE_LIMIT_MAX_INFLIGHT_SEARCHES", "0")
    assert Settings(_env_file=None).rate_limit_max_inflight_searches == 0
    for bad in ("-1", "101", "many"):
        monkeypatch.setenv("PROFILE_RATE_LIMIT_MAX_INFLIGHT_SEARCHES", bad)
        with pytest.raises(ValueError):
            Settings(_env_file=None)


def test_one_visitor_cannot_hold_more_than_their_share_of_the_slots():
    async def scenario():
        h = Harness(max_inflight_searches=4, max_inflight_per_visitor=2)
        mine = [h.start(SEARCH, "203.0.113.1") for _ in range(2)]
        await let_them_start()
        status, headers, body = await h.request(SEARCH, "203.0.113.1")  # a third at the same moment, same visitor
        assert status == 429 and b"busy" in body and b"Your other searches" in body and headers[b"retry-after"] == b"5"
        stranger = h.start(SEARCH, "203.0.113.2")  # others are not affected
        await let_them_start()
        assert h.middleware.inflight == 3
        h.release()
        assert [r[0] for r in await asyncio.gather(*mine, stranger)] == [200, 200, 200]
        assert h.middleware.inflight == 0 and h.middleware.inflight_by_visitor == {}  # nothing is left behind

    run(scenario())


def test_search_answers_are_identical_with_the_safeguard_on_or_off():
    """The safeguard sits in front of the search and must not change what it returns."""
    from fastapi.testclient import TestClient

    from profile_api.main import create_app

    body = {"text": "hiking with my dog and camping by the lake", "method": "both", "k": 5}
    answers = []
    for inflight in (0, 4):
        settings = Settings(
            _env_file=None, app_mode="public", rate_limit_enabled=True, rate_limit_max_inflight_searches=inflight
        )
        with TestClient(create_app(settings)) as client:
            response = client.post("/api/v1/discover/similar", json=body)
            assert response.status_code == 200
            answers.append(response.json())
    assert answers[0] == answers[1]
