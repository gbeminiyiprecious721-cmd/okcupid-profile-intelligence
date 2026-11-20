"""Artifacts are verified before use, and tampering stops the application from starting."""

import json
import shutil

import pytest
from conftest import similar
from fastapi.testclient import TestClient

from profile_api.artifacts import ArtifactError
from profile_api.config import Settings
from profile_api.main import create_app
from profile_api.paths import BACKEND_DIR, CONTENT_DIR


@pytest.fixture
def copy_of_artifacts(tmp_path, built_artifacts):
    target = tmp_path / "artifacts"
    shutil.copytree(built_artifacts, target)
    return target


def start(artifact_dir):
    with TestClient(create_app(Settings(_env_file=None, artifact_dir=artifact_dir))):
        pass


def test_a_copy_of_the_real_artifacts_loads(copy_of_artifacts):
    with TestClient(create_app(Settings(_env_file=None, artifact_dir=copy_of_artifacts))) as client:
        assert similar(client).status_code == 200


def test_a_changed_artifact_file_stops_startup(copy_of_artifacts):
    with (copy_of_artifacts / "embeddings.npy").open("ab") as handle:
        handle.write(b"tamper")
    with pytest.raises(ArtifactError, match="embeddings.npy does not match"):
        start(copy_of_artifacts)


def test_a_changed_vectorizer_is_never_unpickled(copy_of_artifacts):
    (copy_of_artifacts / "tfidf_vectorizer.joblib").write_bytes(b"not a real pickle")
    with pytest.raises(ArtifactError, match="does not match the manifest"):
        start(copy_of_artifacts)  # the hash is checked first, so the file is refused before joblib reads it


def test_artifacts_that_do_not_match_the_profiles_stop_startup(copy_of_artifacts):
    manifest = json.loads((copy_of_artifacts / "manifest.json").read_text())
    manifest["source"]["profiles.json"] = "0" * 64
    (copy_of_artifacts / "manifest.json").write_text(json.dumps(manifest))
    with pytest.raises(ArtifactError, match="profiles changed"):
        start(copy_of_artifacts)


def test_a_non_synthetic_manifest_is_refused_in_public_mode(copy_of_artifacts):
    manifest = json.loads((copy_of_artifacts / "manifest.json").read_text())
    manifest["source_is_synthetic"] = False
    (copy_of_artifacts / "manifest.json").write_text(json.dumps(manifest))
    with pytest.raises(ArtifactError, match="synthetic pool"):
        start(copy_of_artifacts)


def test_only_tier_zero_artifacts_are_accepted(copy_of_artifacts):
    manifest = json.loads((copy_of_artifacts / "manifest.json").read_text())
    manifest["tier"] = 1
    (copy_of_artifacts / "manifest.json").write_text(json.dumps(manifest))
    with pytest.raises(ArtifactError, match="tier 0"):
        start(copy_of_artifacts)


def test_a_library_version_mismatch_asks_for_a_rebuild(copy_of_artifacts):
    manifest = json.loads((copy_of_artifacts / "manifest.json").read_text())
    manifest["versions"]["scikit-learn"] = "0.0.1"
    (copy_of_artifacts / "manifest.json").write_text(json.dumps(manifest))
    with pytest.raises(ArtifactError, match="Rebuild"):
        start(copy_of_artifacts)


def test_a_profile_not_flagged_synthetic_is_refused(tmp_path, copy_of_artifacts):
    content = tmp_path / "content"
    shutil.copytree(CONTENT_DIR, content)
    path = content / "synthetic" / "profiles.json"
    document = json.loads(path.read_text())
    document["pool"][0]["is_synthetic"] = False
    path.write_text(json.dumps(document))
    manifest = json.loads((copy_of_artifacts / "manifest.json").read_text())
    import hashlib

    manifest["source"]["profiles.json"] = hashlib.sha256(path.read_bytes()).hexdigest()
    (copy_of_artifacts / "manifest.json").write_text(json.dumps(manifest))
    with pytest.raises(ArtifactError, match="flagged synthetic"):
        with TestClient(create_app(Settings(_env_file=None, artifact_dir=copy_of_artifacts, content_dir=content))):
            pass


def test_without_artifacts_the_app_starts_with_discovery_off(tmp_path):
    with TestClient(create_app(Settings(_env_file=None, artifact_dir=tmp_path / "none"))) as client:
        assert client.get("/api/v1/meta").json()["features"]["discovery"] is False
        response = similar(client)
        assert response.status_code == 503 and response.json()["error"]["code"] == "feature_unavailable"
        assert client.get("/api/v1/examples").status_code == 503


def test_artifact_files_are_ignored_by_git():
    ignore = (BACKEND_DIR.parent.parent / ".gitignore").read_text()
    assert "app/backend/artifacts/*" in ignore
