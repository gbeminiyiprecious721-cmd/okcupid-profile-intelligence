"""Phase 7: rate limiting, documentation exposure, headers, CORS, production settings and the mode matrix."""

import json
import os
import socket
import subprocess
import sys
import time

import pytest
from fastapi.testclient import TestClient

from profile_api.config import AppMode, Settings
from profile_api.main import create_app
from profile_api.paths import BACKEND_DIR
from profile_api.security import ratelimit

MARKER = "zz-visitor-marker-77c"
STARTER = "ex_782bfd92"


class Clock:
    def __init__(self):
        self.now = 1000.0

    def __call__(self):
        return self.now


def limited(clock=None, **overrides):
    settings = Settings(
        _env_file=None,
        app_mode="public",
        rate_limit_enabled=True,
        rate_limit_search_per_minute=3,
        rate_limit_general_per_minute=5,
        **overrides,
    )
    return TestClient(create_app(settings, clock=clock or Clock()))


def search(client, **headers):
    return client.post("/api/v1/discover/similar", json={"text": "hiking with my dog and camping"}, headers=headers)


# ------------------------------------------------------------------ rate limiting
def test_the_defaults_turn_the_limiter_on(monkeypatch):
    monkeypatch.delenv("PROFILE_RATE_LIMIT_ENABLED", raising=False)
    settings = Settings(_env_file=None)
    assert settings.rate_limit_enabled is True
    assert settings.rate_limit_search_per_minute == 30 and settings.rate_limit_general_per_minute == 240
    assert settings.trust_proxy is False


def test_searches_are_limited_with_a_safe_answer_and_a_retry_time():
    clock = Clock()
    with limited(clock) as client:
        assert [search(client).status_code for _ in range(3)] == [200, 200, 200]
        blocked = search(client)
    assert blocked.status_code == 429
    assert blocked.json() == {
        "error": {"code": "rate_limited", "message": "Too many requests. Try again in 60 seconds."}
    }
    assert blocked.headers["retry-after"] == "60"
    assert blocked.headers["ratelimit-limit"] == "3" and blocked.headers["ratelimit-remaining"] == "0"
    assert MARKER not in blocked.text


def test_the_limit_resets_as_the_window_moves():
    clock = Clock()
    with limited(clock) as client:
        for _ in range(3):
            search(client)
        assert search(client).status_code == 429
        clock.now += 30
        assert search(client).headers["retry-after"] == "30"  # the first request leaves the window in 30 seconds
        clock.now += 31
        assert search(client).status_code == 200


def test_a_refused_request_does_no_work_and_does_not_read_the_body():
    clock = Clock()
    with limited(clock) as client:
        for _ in range(3):
            search(client)
        response = client.post("/api/v1/discover/similar", content=b"{not json " + MARKER.encode())
    assert response.status_code == 429 and MARKER not in response.text


def test_the_error_answer_still_carries_the_security_headers_and_cors():
    clock = Clock()
    with limited(clock, allowed_origins=["https://example.org"]) as client:
        for _ in range(3):
            search(client, Origin="https://example.org")
        blocked = search(client, Origin="https://example.org")
    assert blocked.status_code == 429
    assert blocked.headers["x-content-type-options"] == "nosniff" and "strict-transport-security" in blocked.headers
    assert blocked.headers["access-control-allow-origin"] == "https://example.org"


def test_searches_and_other_reads_have_separate_budgets_and_health_is_exempt():
    clock = Clock()
    with limited(clock) as client:
        for _ in range(3):
            search(client)
        assert client.get("/api/v1/meta").status_code == 200  # the search budget is spent, reads are not
        assert [client.get("/api/v1/health").status_code for _ in range(20)] == [200] * 20
        for _ in range(4):
            client.get("/api/v1/meta")
        assert client.get("/api/v1/meta").status_code == 429


def test_the_classifier_endpoint_counts_as_a_search():
    clock = Clock()
    with limited(clock) as client:
        codes = [client.post("/api/v1/classify/predict", json={"example_id": STARTER}).status_code for _ in range(4)]
    assert codes == [403, 403, 403, 429]  # refused in public mode, and still counted


def test_a_visitor_cannot_choose_their_own_address_unless_a_trusted_proxy_is_set():
    clock = Clock()
    with limited(clock) as client:
        for i in range(3):
            search(client, **{"X-Forwarded-For": f"10.0.0.{i}"})
        assert search(client, **{"X-Forwarded-For": "10.0.0.99"}).status_code == 429  # the header was ignored


def test_behind_a_trusted_proxy_the_last_forwarded_address_is_used():
    clock = Clock()
    with limited(clock, trust_proxy=True) as client:
        for _ in range(3):
            search(client, **{"X-Forwarded-For": "1.1.1.1, 9.9.9.9"})  # a spoofed first entry changes nothing
        assert search(client, **{"X-Forwarded-For": "2.2.2.2, 9.9.9.9"}).status_code == 429
        assert search(client, **{"X-Forwarded-For": "2.2.2.2, 8.8.8.8"}).status_code == 200


def test_memory_is_bounded(monkeypatch):
    monkeypatch.setattr(ratelimit, "MAX_KEYS", 50)
    window = ratelimit.SlidingWindow(Clock())
    for i in range(500):
        window.check(f"client-{i}", "general", 10)
    assert len(window.hits) == 50
    assert ("client-499", "general") in window.hits and ("client-0", "general") not in window.hits


def test_the_limiter_stores_only_addresses_and_times():
    window = ratelimit.SlidingWindow(Clock())
    window.check("1.2.3.4", "search", 5)
    assert list(window.hits) == [("1.2.3.4", "search")]
    assert all(isinstance(t, float) for t in window.hits[("1.2.3.4", "search")])


def test_the_limiter_can_be_turned_off_for_development():
    settings = Settings(_env_file=None, app_mode="local", rate_limit_enabled=False, rate_limit_search_per_minute=1)
    with TestClient(create_app(settings)) as client:
        assert [search(client).status_code for _ in range(5)] == [200] * 5


# ------------------------------------------------------------------ documentation and the OpenAPI file
DOC_PATHS = [
    "/api/docs",
    "/api/redoc",
    "/api/openapi.json",
    "/openapi.json",
    "/docs",
    "/redoc",
    "/docs/oauth2-redirect",
]


@pytest.mark.parametrize("path", DOC_PATHS)
def test_public_mode_serves_no_documentation_or_openapi_file(path):
    with TestClient(create_app(Settings(_env_file=None, app_mode="public", rate_limit_enabled=False))) as client:
        assert client.get(path).status_code == 404


def test_local_mode_serves_the_documentation_with_a_looser_policy_only_there():
    with TestClient(create_app(Settings(_env_file=None, app_mode="local", rate_limit_enabled=False))) as client:
        assert client.get("/api/openapi.json").json()["info"]["title"] == "Profile Intelligence API"
        docs = client.get("/api/docs")
        assert docs.status_code == 200 and "cdn.jsdelivr.net" in docs.headers["content-security-policy"]
        assert client.get("/api/v1/health").headers["content-security-policy"].startswith("default-src 'none'")
        assert "strict-transport-security" not in docs.headers  # no https assumption on a local computer


def test_the_openapi_document_can_still_be_generated_for_the_frontend_types():
    document = create_app(Settings(_env_file=None, app_mode="local")).openapi()
    assert "/api/v1/classify/predict" in document["paths"]


# ------------------------------------------------------------------ headers and CORS
EXPECTED = {
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "x-frame-options": "DENY",
    "cache-control": "no-store",
    "cross-origin-opener-policy": "same-origin",
    "cross-origin-resource-policy": "same-origin",
}


@pytest.mark.parametrize(
    "path",
    ["/api/v1/health", "/api/v1/meta", "/api/v1/nothing", "/api/v1/lab/summary", "/api/v1/discover/profiles/bad"],
)
def test_every_public_answer_carries_the_security_headers(path):
    with TestClient(create_app(Settings(_env_file=None, app_mode="public", rate_limit_enabled=False))) as client:
        response = client.get(path)
    for name, value in EXPECTED.items():
        assert response.headers[name] == value, (path, name)
    assert response.headers["content-security-policy"] == "default-src 'none'; frame-ancestors 'none'"
    assert "max-age=31536000" in response.headers["strict-transport-security"]
    assert "camera=()" in response.headers["permissions-policy"]


def test_cors_allows_only_the_configured_origin_without_credentials():
    settings = Settings(
        _env_file=None, app_mode="public", allowed_origins=["https://app.example.org"], rate_limit_enabled=False
    )
    with TestClient(create_app(settings)) as client:
        good = client.get("/api/v1/health", headers={"Origin": "https://app.example.org"})
        bad = client.get("/api/v1/health", headers={"Origin": "https://evil.example"})
        preflight = client.options(
            "/api/v1/discover/similar",
            headers={"Origin": "https://app.example.org", "Access-Control-Request-Method": "POST"},
        )
        refused = client.options(
            "/api/v1/discover/similar",
            headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "POST"},
        )
        bad_method = client.options(
            "/api/v1/discover/similar",
            headers={"Origin": "https://app.example.org", "Access-Control-Request-Method": "DELETE"},
        )
    assert good.headers["access-control-allow-origin"] == "https://app.example.org"
    assert "access-control-allow-origin" not in bad.headers
    assert (
        "access-control-allow-credentials" not in good.headers
        and "access-control-allow-credentials" not in preflight.headers
    )
    assert preflight.status_code == 200 and set(preflight.headers["access-control-allow-methods"].split(", ")) == {
        "GET",
        "POST",
    }
    assert refused.status_code == 400 and bad_method.status_code == 400


@pytest.mark.parametrize("origin", ["*", "http://example.org", "ftp://example.org", "example.org"])
def test_public_mode_refuses_unsafe_origins(origin):
    with pytest.raises(ValueError, match="not acceptable in public mode"):
        Settings(_env_file=None, app_mode="public", allowed_origins=[origin])


def test_public_mode_accepts_https_and_localhost_origins():
    settings = Settings(
        _env_file=None,
        app_mode="public",
        allowed_origins=["https://a.example", "http://localhost:5173", "http://127.0.0.1:5173"],
    )
    assert len(settings.allowed_origins) == 3


# ------------------------------------------------------------------ every endpoint in every mode
ENDPOINTS = [
    ("GET", "/api/v1/health", None),
    ("GET", "/api/v1/meta", None),
    ("GET", "/api/v1/examples", None),
    ("POST", "/api/v1/discover/similar", {"text": "hiking with my dog and camping"}),
    ("GET", f"/api/v1/discover/profiles/{STARTER}", None),
    ("GET", "/api/v1/lab/summary", None),
    ("GET", "/api/v1/lab/figures/confusion_matrix", None),
    ("GET", "/api/v1/classify/examples", None),
    ("POST", "/api/v1/classify/predict", {"example_id": STARTER}),
]
EXPECTED_STATUS = {
    "public": [200, 200, 200, 200, 200, 200, 200, 403, 403],
    "local without classifier": [200, 200, 200, 200, 200, 200, 200, 503, 503],
}


@pytest.mark.parametrize("mode", EXPECTED_STATUS)
def test_the_mode_matrix(mode):
    settings = Settings(_env_file=None, app_mode="public" if mode == "public" else "local", rate_limit_enabled=False)
    with TestClient(create_app(settings)) as client:
        got = [client.request(m, p, json=b).status_code for m, p, b in ENDPOINTS]
    assert got == EXPECTED_STATUS[mode]


def test_public_mode_has_no_route_that_reaches_the_tier_one_folder():
    paths = create_app(Settings(_env_file=None, app_mode="public")).openapi()["paths"]
    assert paths and all("tier1" not in path and "artifact" not in path and "model" not in path for path in paths)


# ------------------------------------------------------------------ what can be deployed
def in_git_checkout() -> bool:
    result = subprocess.run(  # noqa: S603
        ["git", "rev-parse", "--is-inside-work-tree"],  # noqa: S607
        cwd=BACKEND_DIR,
        capture_output=True,
        text=True,
        check=False,
    )
    return result.returncode == 0 and result.stdout.strip() == "true"


@pytest.mark.skipif(not in_git_checkout(), reason="needs a git checkout (a clean copy of the files has none)")
def test_the_deployable_file_set_holds_no_tier_one_file_and_no_data():
    """Everything git would track or add, which is what a deployment is built from."""
    result = subprocess.run(
        ["git", "ls-files", "--cached", "--others", "--exclude-standard"],  # noqa: S607
        cwd=BACKEND_DIR.parents[1],
        capture_output=True,
        text=True,
        check=True,
    )
    files = result.stdout.splitlines()
    assert files, "git returned no files"
    forbidden = [
        f
        for f in files
        if "artifacts/tier1" in f
        or f.endswith((".joblib", "classifier_meta.json", "profiles.csv", ".npy", ".npz"))
        or "/.venv/" in f
        or f.startswith(".venv/")
        or f.endswith(".env")
    ]
    assert forbidden == []


# ------------------------------------------------------------------ a real server: logs and headers
def free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def test_a_real_server_run_the_production_way_logs_no_visitor_input_and_sends_no_server_banner(tmp_path):
    import urllib.error
    import urllib.request

    opener = urllib.request.build_opener(
        urllib.request.ProxyHandler({})
    )  # talk to localhost directly, never via a proxy
    port, log = free_port(), tmp_path / "server.log"
    env = {**os.environ, "PROFILE_APP_MODE": "public", "PROFILE_RATE_LIMIT_ENABLED": "false"}
    with log.open("wb") as out:
        server = subprocess.Popen(
            [
                sys.executable,
                "-m",
                "uvicorn",
                "profile_api.main:app",
                "--port",
                str(port),
                "--no-server-header",
                "--no-access-log",
            ],
            cwd=BACKEND_DIR,
            env=env,
            stdout=out,
            stderr=subprocess.STDOUT,
        )
        base = f"http://127.0.0.1:{port}"
        try:
            for _ in range(120):
                try:
                    opener.open(f"{base}/api/v1/health", timeout=1)  # noqa: S310
                    break
                except OSError:
                    time.sleep(0.5)
            else:
                pytest.fail("the server did not start")

            def call(path, data=None, headers=None):
                request = urllib.request.Request(  # noqa: S310
                    base + path, data=data, headers={"Content-Type": "application/json", **(headers or {})}
                )
                try:
                    return opener.open(request, timeout=10)  # noqa: S310
                except urllib.error.HTTPError as error:
                    return error

            ok = call(
                "/api/v1/discover/similar",
                json.dumps({"text": f"hiking {MARKER} with my dog", "answers": {"pets": "has a cat"}}).encode(),
            )
            call(
                "/api/v1/discover/similar", json.dumps({"text": MARKER, "extra": MARKER}).encode()
            )  # too short and unknown field
            call("/api/v1/discover/similar", b"{" + MARKER.encode())  # malformed
            call("/api/v1/discover/similar", MARKER.encode() * 5000)  # too large
            call(f"/api/v1/discover/profiles/{MARKER}")  # bad identifier
            call("/api/v1/classify/predict", json.dumps({"example_id": MARKER, "text": MARKER}).encode())
            call("/api/v1/meta", headers={"X-Visitor": MARKER, "User-Agent": MARKER})
            banner = ok.headers.get("server")
        finally:
            server.terminate()
            server.wait(timeout=20)
    text = log.read_text()
    assert "Application startup complete" in text
    # uvicorn's default access log writes every URL, including any text a visitor puts in it, so production turns it off.
    assert MARKER not in text, "visitor input reached the server log"
    assert banner is None


def test_an_unexpected_error_gives_a_generic_answer_and_leaks_nothing(monkeypatch):
    app = create_app(Settings(_env_file=None, app_mode="public", rate_limit_enabled=False))

    @app.get("/api/v1/boom")
    def boom():
        raise RuntimeError(f"secret {MARKER} /Users/someone/profiles.csv")

    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.get("/api/v1/boom")
    assert response.status_code == 500
    assert response.json() == {"error": {"code": "internal_error", "message": "Something went wrong on the server."}}
    assert MARKER not in response.text and "/Users" not in response.text and "Traceback" not in response.text


@pytest.mark.parametrize(
    ("method", "path", "kwargs"),
    [
        ("get", f"/api/v1/{MARKER}", {}),
        ("get", f"/api/v1/discover/profiles/ex_{MARKER[:8]}?q={MARKER}", {}),
        ("delete", "/api/v1/meta", {"headers": {"X-A": MARKER}}),
        ("post", "/api/v1/discover/similar", {"content": MARKER, "headers": {"Content-Type": "text/plain"}}),
        ("post", "/api/v1/discover/similar", {"content": b"{" + MARKER.encode()}),
        ("post", "/api/v1/discover/similar", {"json": {"text": MARKER, "k": MARKER}}),
        (
            "post",
            "/api/v1/discover/similar",
            {"json": {"text": "hiking with my dog today", "answers": {"pets": MARKER}}},
        ),
        ("post", "/api/v1/discover/similar", {"json": {"text": "hiking with my dog today", "method": MARKER}}),
        ("get", f"/api/v1/discover/profiles/{MARKER}", {}),
        ("get", f"/api/v1/lab/figures/{MARKER}", {}),
        ("post", "/api/v1/classify/predict", {"json": {"example_id": MARKER}}),
    ],
)
def test_no_error_message_echoes_what_the_visitor_sent(method, path, kwargs):
    with TestClient(create_app(Settings(_env_file=None, app_mode="local", rate_limit_enabled=False))) as client:
        response = getattr(client, method)(path, **kwargs)
    assert response.status_code >= 400
    assert MARKER not in response.text
    assert MARKER not in json.dumps(dict(response.headers))
    assert AppMode.LOCAL  # the strictest case: local mode, where more endpoints exist


# ------------------------------------------------------------------ the production configuration checker
def run_checker(**env):
    return subprocess.run(  # noqa: S603
        [sys.executable, str(BACKEND_DIR / "scripts" / "check_production_config.py")],
        cwd=BACKEND_DIR,
        env={**os.environ, **env},
        capture_output=True,
        text=True,
        timeout=120,
    )


def test_the_production_checker_passes_a_safe_public_configuration():
    result = run_checker(
        PROFILE_APP_MODE="public",
        PROFILE_ALLOWED_ORIGINS='["https://profiles.example.org"]',
        PROFILE_RATE_LIMIT_ENABLED="true",
    )
    assert result.returncode == 0, result.stdout
    assert "18 of 18 checks passed" in result.stdout


@pytest.mark.parametrize(
    ("env", "message"),
    [
        ({"PROFILE_APP_MODE": "local"}, "PROFILE_APP_MODE is public"),
        ({"PROFILE_RATE_LIMIT_ENABLED": "false"}, "rate limiting is on"),
        ({"PROFILE_ALLOWED_ORIGINS": '["http://localhost:5173"]'}, "at least one https origin"),
    ],
)
def test_the_production_checker_fails_an_unsafe_configuration(env, message):
    base = {
        "PROFILE_APP_MODE": "public",
        "PROFILE_ALLOWED_ORIGINS": '["https://profiles.example.org"]',
        "PROFILE_RATE_LIMIT_ENABLED": "true",
    }
    result = run_checker(**{**base, **env})
    assert result.returncode == 1
    assert any(line.startswith("FAIL") and message in line for line in result.stdout.splitlines())


def test_the_production_checker_refuses_a_tier_one_folder_in_public_mode():
    result = run_checker(PROFILE_APP_MODE="public", PROFILE_TIER1_ARTIFACT_DIR="artifacts/tier1")
    assert result.returncode == 1 and "not valid for this mode" in result.stdout


def test_the_production_checker_refuses_a_wildcard_origin():
    result = run_checker(PROFILE_APP_MODE="public", PROFILE_ALLOWED_ORIGINS='["*"]')
    assert result.returncode == 1 and "not valid for this mode" in result.stdout


# ------------------------------------------------------------------ the model download and the service agree
def test_the_download_script_and_the_service_share_one_definition_of_the_model():
    """A clean machine failed once because the script fetched fewer files than the service insisted on."""
    from profile_api.services import embedding

    script = (BACKEND_DIR / "scripts" / "download_model.py").read_text()
    for name in ("MODEL_NAME", "MODEL_REVISION", "MODEL_FILE_PATTERNS"):
        assert name in script, name
    assert "allow_patterns" in script and "revision=" in script
    assert len(embedding.MODEL_REVISION) == 40 and embedding.MODEL_NAME.startswith("sentence-transformers/")
    assert "*.safetensors" in embedding.MODEL_FILE_PATTERNS  # weights are never loaded from a pickle


def test_a_partial_model_cache_is_accepted_when_it_holds_the_needed_files(tmp_path, monkeypatch):
    """The exact failure from the clean room: only the needed files cached, then loaded offline."""
    from huggingface_hub import snapshot_download

    from profile_api.services import embedding

    cache = tmp_path / "hf"
    repo = cache / "hub" / "models--sentence-transformers--all-MiniLM-L6-v2"
    snapshot = repo / "snapshots" / embedding.MODEL_REVISION
    (snapshot / "1_Pooling").mkdir(parents=True)
    (repo / "refs").mkdir()
    (repo / "refs" / "main").write_text(embedding.MODEL_REVISION)
    for name in ("config.json", "modules.json", "tokenizer.json", "1_Pooling/config.json", "model.safetensors"):
        (snapshot / name).write_text("{}")
    monkeypatch.setenv("HF_HOME", str(cache))
    monkeypatch.setenv("HF_HUB_CACHE", str(cache / "hub"))
    import huggingface_hub.constants as constants

    monkeypatch.setattr(constants, "HF_HUB_CACHE", str(cache / "hub"), raising=False)
    path = snapshot_download(
        embedding.MODEL_NAME,
        revision=embedding.MODEL_REVISION,
        allow_patterns=embedding.MODEL_FILE_PATTERNS,
        local_files_only=True,
        cache_dir=str(cache / "hub"),
    )
    assert path.endswith(embedding.MODEL_REVISION)


def test_the_client_can_be_the_second_entry_from_the_right_for_platforms_with_two_proxies():
    clock = Clock()
    with limited(clock, trust_proxy=True, trusted_proxy_hops=2) as client:
        for _ in range(3):
            search(client, **{"X-Forwarded-For": "6.6.6.6, 10.0.0.1"})  # the client is the second entry from the right
        assert search(client, **{"X-Forwarded-For": "7.7.7.7, 10.0.0.1"}).status_code == 200  # another client
        assert (
            search(client, **{"X-Forwarded-For": "6.6.6.6, 10.0.0.2"}).status_code == 429
        )  # the same client, another proxy address


def test_a_header_with_too_few_entries_is_not_trusted_and_falls_back_to_the_socket():
    clock = Clock()
    with limited(clock, trust_proxy=True, trusted_proxy_hops=2) as client:
        for i in range(3):
            search(client, **{"X-Forwarded-For": f"9.9.9.{i}"})  # one entry where two proxies are expected
        assert search(client, **{"X-Forwarded-For": "9.9.9.99"}).status_code == 429  # all counted as one address


def test_the_production_checker_still_runs_where_git_is_not_installed(tmp_path):
    """A container image has no git. The check that needs it is skipped, and all the others still run."""
    result = run_checker(
        PROFILE_APP_MODE="public",
        PROFILE_ALLOWED_ORIGINS='["https://profiles.example.org"]',
        PROFILE_RATE_LIMIT_ENABLED="true",
        PATH=str(tmp_path),
    )
    assert result.returncode == 0, result.stdout + result.stderr
    assert "skip  deployable file set" in result.stdout and "17 of 17 checks passed" in result.stdout
