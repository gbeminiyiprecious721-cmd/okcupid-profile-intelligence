import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from profile_api import __version__
from profile_api.config import AppMode, Settings
from profile_api.main import create_app


def bare_client(**overrides) -> TestClient:
    """An application whose lifespan has not run, so no artifacts are loaded."""
    return TestClient(create_app(Settings(_env_file=None, **overrides)))


def test_health_reports_ok_mode_and_version():
    assert bare_client().get("/api/v1/health").json() == {"status": "ok", "mode": "public", "version": __version__}


def test_default_mode_is_public():
    assert Settings(_env_file=None).app_mode is AppMode.PUBLIC


def test_meta_says_discovery_is_off_until_artifacts_are_loaded():
    body = bare_client().get("/api/v1/meta").json()
    assert body["features"]["discovery"] is False
    assert body["pool"] is None


def test_meta_reports_the_loaded_pool(client):
    body = client.get("/api/v1/meta").json()
    assert body["features"] == {
        "discovery": True,
        "lab_summary": True,  # the lab findings file is committed, so it is always loaded
        "classifier_demo": False,
        "segment_assignment": False,
    }
    assert body["pool"]["synthetic"] is True and body["pool"]["size"] == 800
    assert body["limits"] == {"max_text_chars": 2000, "min_words": 3, "min_neighbours": 1, "max_neighbours": 10}
    assert set(body["answer_options"]) == {
        "smokes", "drugs", "diet_type", "education_level", "job", "offspring", "pets", "status", "body_type",
    }  # fmt: skip
    assert set(body["local_only_features"]) == {"classifier_demo", "segment_assignment"}


def test_local_mode_is_reported():
    assert bare_client(app_mode="local").get("/api/v1/meta").json()["mode"] == "local"


def test_public_mode_refuses_real_data_artifacts():
    with pytest.raises(ValidationError, match="Public mode must never load"):
        Settings(_env_file=None, app_mode="public", tier1_artifact_dir="artifacts/tier1")


def test_local_mode_accepts_a_tier1_folder():
    assert Settings(_env_file=None, app_mode="local", tier1_artifact_dir="x").tier1_artifact_dir


def test_security_headers_are_present():
    response = bare_client().get("/api/v1/health")
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["referrer-policy"] == "no-referrer"
    assert "default-src 'none'" in response.headers["content-security-policy"]


def test_cors_allows_the_dev_origin_only():
    app_client = bare_client()
    ok = app_client.get("/api/v1/health", headers={"Origin": "http://localhost:5173"})
    other = app_client.get("/api/v1/health", headers={"Origin": "https://example.org"})
    assert ok.headers.get("access-control-allow-origin") == "http://localhost:5173"
    assert "access-control-allow-origin" not in other.headers


def test_meta_reports_answer_shares_from_the_pool(client):
    body = client.get("/api/v1/meta").json()
    shares = body["answer_shares"]
    assert set(shares) == set(body["answer_options"])
    for field, by_value in shares.items():
        assert abs(sum(by_value.values()) - 1) < 0.02, field  # rounded to 3 places
        assert set(by_value) <= set(body["answer_options"][field])
