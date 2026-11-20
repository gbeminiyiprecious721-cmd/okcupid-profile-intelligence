"""The request log must be useful for monitoring and must never hold what a visitor sent."""

import json
import logging

import pytest
from fastapi.testclient import TestClient

from profile_api.config import Settings
from profile_api.main import create_app

MARKER = "zz-visitor-marker-5d1"


@pytest.fixture
def lines(caplog):
    caplog.set_level(logging.INFO, logger="profile_api.requests")
    caplog.clear()
    return lambda: [json.loads(r.getMessage()) for r in caplog.records if r.name == "profile_api.requests"]


def client(**overrides):
    base = {"_env_file": None, "app_mode": "public", "rate_limit_enabled": False, "request_log": True}
    return TestClient(create_app(Settings(**{**base, **overrides})), raise_server_exceptions=False)


def test_one_line_per_request_with_the_route_template_status_and_timing(lines):
    with client() as c:
        c.get("/api/v1/health")
        c.get("/api/v1/discover/profiles/ex_782bfd92")
        c.post("/api/v1/discover/similar", json={"text": "hiking with my dog and camping"})
    got = lines()
    assert [(r["method"], r["route"], r["status"]) for r in got] == [
        ("GET", "/api/v1/health", 200),
        ("GET", "/api/v1/discover/profiles/{profile_id}", 200),
        ("POST", "/api/v1/discover/similar", 200),
    ]
    assert all(set(r) == {"event", "id", "method", "route", "status", "ms", "bytes"} for r in got)
    assert all(r["ms"] >= 0 and r["bytes"] > 0 for r in got)


def test_failures_are_visible_by_status(lines):
    with client(rate_limit_enabled=True, rate_limit_general_per_minute=1) as c:
        c.get("/api/v1/meta")
        c.get("/api/v1/meta")  # 429
        c.get("/api/v1/nothing")  # 404 and also over the limit
    statuses = [r["status"] for r in lines()]
    assert statuses[:2] == [200, 429]
    assert 404 in statuses or statuses[2] == 429


def test_an_unexpected_error_is_logged_as_a_500_without_its_details(lines):
    app = create_app(Settings(_env_file=None, app_mode="public", rate_limit_enabled=False, request_log=True))

    @app.get("/api/v1/boom")
    def boom():
        raise RuntimeError(f"details {MARKER}")

    with TestClient(app, raise_server_exceptions=False) as c:
        c.get("/api/v1/boom")
    entry = [r for r in lines() if r["route"] == "/api/v1/boom"][0]
    assert entry["status"] == 500 and MARKER not in json.dumps(entry)


def test_nothing_the_visitor_sent_reaches_the_log(lines, caplog):
    with client() as c:
        c.get(
            f"/api/v1/{MARKER}?q={MARKER}",
            headers={"User-Agent": MARKER, "X-Anything": MARKER, "Cookie": f"a={MARKER}"},
        )
        c.get(f"/api/v1/discover/profiles/{MARKER}?x={MARKER}")
        c.post("/api/v1/discover/similar", json={"text": f"hiking {MARKER} with my dog", "answers": {"pets": MARKER}})
        c.post("/api/v1/discover/similar", content=MARKER, headers={"Content-Type": "text/plain"})
        c.post("/api/v1/classify/predict", json={"example_id": MARKER})
        c.get("/api/v1/discover/profiles/ex_782bfd92", headers={"X-Forwarded-For": "203.0.113.77"})
    text = " ".join(r.getMessage() for r in caplog.records)
    assert text and MARKER not in text
    assert "203.0.113.77" not in text and "testclient" not in text  # no client address
    assert "q=" not in text  # no query string


def test_unmatched_paths_are_labelled_without_the_real_path(lines):
    with client() as c:
        c.get(f"/api/v1/{MARKER}")
    assert lines()[-1]["route"] == "unmatched"


def test_each_answer_carries_a_unique_request_id_that_matches_the_log(lines):
    with client() as c:
        first, second = c.get("/api/v1/health"), c.get("/api/v1/health")
    ids = [first.headers["x-request-id"], second.headers["x-request-id"]]
    assert ids[0] != ids[1] and [r["id"] for r in lines()] == ids


def test_the_web_application_is_logged_as_one_route(lines, tmp_path):
    site = tmp_path / "dist"
    site.mkdir()
    (site / "index.html").write_text("<title>x</title>")
    with client(static_dir=site) as c:
        c.get("/lab/models")
        c.get("/some/other/page")
    assert {r["route"] for r in lines()} == {"web"}


def test_the_log_can_be_switched_off(lines):
    with client(request_log=False) as c:
        c.get("/api/v1/health")
    assert lines() == []
