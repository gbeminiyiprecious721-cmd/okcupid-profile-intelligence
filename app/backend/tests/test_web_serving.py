"""The API container can serve the built web application: one origin, safe paths, the right headers and caching."""

import re

import pytest
from fastapi.testclient import TestClient

from profile_api.config import Settings
from profile_api.main import create_app
from profile_api.paths import APP_DIR
from profile_api.security import web_headers

DIST = APP_DIR / "frontend" / "dist"


@pytest.fixture
def dist(tmp_path):
    site = tmp_path / "dist"
    (site / "assets").mkdir(parents=True)
    (site / "index.html").write_text(
        '<!doctype html><title>Profile Intelligence</title><script src="/assets/app-1a2b3c.js"></script>'
    )
    (site / "assets" / "app-1a2b3c.js").write_text("console.log('app')")
    (site / "favicon.svg").write_text("<svg xmlns='http://www.w3.org/2000/svg'/>")
    (tmp_path / "secret.txt").write_text("outside the site")
    return site


def serving(dist, mode="public", **extra):
    settings = Settings(_env_file=None, app_mode=mode, rate_limit_enabled=False, static_dir=dist, **extra)
    return TestClient(create_app(settings))


def test_the_home_page_and_any_page_route_get_the_web_page(dist):
    with serving(dist) as client:
        for path in ("/", "/lab/models", "/discover", "/no/such/page"):
            response = client.get(path)
            assert response.status_code == 200 and "Profile Intelligence" in response.text, path
            assert response.headers["cache-control"] == "no-cache"
            assert response.headers["content-type"].startswith("text/html")


def test_assets_are_served_with_long_lived_caching_and_missing_files_are_404(dist):
    with serving(dist) as client:
        asset = client.get("/assets/app-1a2b3c.js")
        assert asset.status_code == 200 and "immutable" in asset.headers["cache-control"]
        assert client.get("/favicon.svg").status_code == 200
        missing = client.get("/assets/old-9f9f9f.js")
        assert missing.status_code == 404 and "<title>" not in missing.text  # not the web page


def test_unknown_api_paths_stay_json_errors_and_never_return_the_web_page(dist):
    with serving(dist) as client:
        for path in ("/api", "/api/", "/api/v1/nothing", "/api/v1/discover/profiles/ex_00000000"):
            response = client.get(path)
            assert response.status_code == 404 and response.json()["error"]["code"] == "not_found", path
        assert client.get("/api/v1/health").json()["status"] == "ok"  # real routes still win


def test_the_api_and_the_web_files_get_their_own_policies(dist):
    with serving(dist) as client:
        api = client.get("/api/v1/health").headers
        page = client.get("/").headers
        asset = client.get("/assets/app-1a2b3c.js").headers
    assert (
        api["content-security-policy"] == "default-src 'none'; frame-ancestors 'none'"
        and api["cache-control"] == "no-store"
    )
    for headers in (page, asset):
        assert headers["content-security-policy"] == web_headers.CSP
        assert (
            "script-src 'self'" in headers["content-security-policy"]
            and "unsafe-eval" not in headers["content-security-policy"]
        )
        assert headers["x-content-type-options"] == "nosniff" and headers["x-frame-options"] == "DENY"
        assert "max-age=31536000" in headers["strict-transport-security"]  # public mode


def test_local_mode_does_not_send_hsts(dist):
    with serving(dist, mode="local") as client:
        assert "strict-transport-security" not in client.get("/").headers


@pytest.mark.parametrize(
    "path",
    [
        "/../secret.txt",
        "/%2e%2e/secret.txt",
        "/assets/../../secret.txt",
        "/..%2fsecret.txt",
        "//etc/passwd",
        "/assets/%2e%2e/%2e%2e/secret.txt",
        "/link-to-secret.txt",
    ],
)
def test_nothing_outside_the_site_folder_can_be_read(dist, path):
    (dist / "link-to-secret.txt").symlink_to(dist.parent / "secret.txt")
    with serving(dist) as client:
        response = client.get(path)
    assert "outside the site" not in response.text
    assert "root:" not in response.text


def test_head_requests_work_and_other_methods_are_refused(dist):
    with serving(dist) as client:
        assert client.head("/").status_code == 200
        assert client.post("/", json={}).status_code == 405
        assert client.delete("/lab/models").status_code == 405


def test_rate_limiting_applies_to_the_api_only(dist):
    settings = Settings(
        _env_file=None, app_mode="public", static_dir=dist, rate_limit_enabled=True, rate_limit_general_per_minute=3
    )
    with TestClient(create_app(settings)) as client:
        assert [client.get("/").status_code for _ in range(10)] == [200] * 10
        assert [client.get("/api/v1/meta").status_code for _ in range(4)] == [200, 200, 200, 429]


def test_a_missing_index_stops_startup(tmp_path):
    with pytest.raises(RuntimeError, match="no index.html"):
        create_app(Settings(_env_file=None, static_dir=tmp_path))


def test_without_a_static_folder_the_application_serves_no_web_page():
    with TestClient(create_app(Settings(_env_file=None, rate_limit_enabled=False))) as client:
        assert client.get("/").status_code == 404


def test_the_python_and_javascript_header_lists_are_the_same():
    """frontend/security-headers.mjs (used by vite preview and the browser tests) must equal the Python copy."""
    source = (APP_DIR / "frontend" / "security-headers.mjs").read_text()
    csp = re.search(r"export const CSP = \[(.*?)\]\.join", source, re.S).group(1)
    assert "; ".join(re.findall(r'"([^"]+)"', csp)) == web_headers.CSP
    block = re.search(r"export const SECURITY_HEADERS = \{(.*?)\n\};", source, re.S).group(1)
    pairs = dict(re.findall(r'^\s+"([A-Za-z-]+)": "([^"]+)",?$', block, re.M))
    pairs.pop("Content-Security-Policy", None)
    assert pairs == {k: v for k, v in web_headers.HEADERS.items() if k != "Content-Security-Policy"}


@pytest.mark.skipif(not (DIST / "index.html").exists(), reason="web application not built")
def test_the_real_build_is_served_in_full():
    settings = Settings(_env_file=None, app_mode="public", rate_limit_enabled=False, static_dir=DIST)
    with TestClient(create_app(settings)) as client:
        html = client.get("/lab/segments").text
        references = re.findall(r'(?:src|href)="(/[^"]+)"', html)
        assert references
        for reference in references:
            response = client.get(reference)
            assert response.status_code == 200, reference
        assert client.get("/theme-init.js").headers["content-type"].split(";")[0] in {
            "text/javascript",
            "application/javascript",
        }
