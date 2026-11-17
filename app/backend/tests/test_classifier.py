"""The educational classifier: consistency, probabilities, integrity, public mode refusal and privacy.

Most tests use a small stand-in pipeline with the same structure, fitted here on the synthetic profiles with random
labels, so they run anywhere. The tests marked `real` use the exported artefact and are skipped when it is absent.
"""

import hashlib
import json
import logging
import shutil
import subprocess

import joblib
import numpy as np
import pandas as pd
import pytest
import sklearn
from fastapi.testclient import TestClient

from profile_api.config import Settings
from profile_api.main import create_app
from profile_api.ml.classifier_features import ALL_FEATURES, CLASS_ORDER, build_pipeline
from profile_api.paths import BACKEND_DIR, CONTENT_DIR
from profile_api.services.classifier import (
    PETS_TO_DATA,
    ClassifierError,
    ClassifierService,
    example_row,
    load_classifier,
)

REAL_DIR = BACKEND_DIR / "artifacts" / "tier1"
real = pytest.mark.skipif(not (REAL_DIR / "manifest.json").exists(), reason="exported classifier not present")
PROFILES = json.loads((CONTENT_DIR / "synthetic" / "profiles.json").read_text())
PERSONAS = json.loads((CONTENT_DIR / "classifier" / "fictional_inputs.json").read_text())["personas"]
STARTER_IDS = [s["id"] for s in PROFILES["starters"]]
MARKER = "zz-visitor-marker-9f3"


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write_artifacts(directory, pipeline, base_rates):
    directory.mkdir(parents=True, exist_ok=True)
    joblib.dump(pipeline, directory / "classifier.joblib")
    (directory / "classifier_meta.json").write_text(json.dumps({"base_rates": base_rates, "class_order": CLASS_ORDER}))
    manifest = {
        "tier": 1,
        "kind": "drinking_classifier",
        "files": {n: {"sha256": sha(directory / n)} for n in ("classifier.joblib", "classifier_meta.json")},
        "versions": {"scikit-learn": sklearn.__version__},
    }
    (directory / "manifest.json").write_text(json.dumps(manifest))


@pytest.fixture(scope="session")
def standin_dir(tmp_path_factory):
    """A tiny classifier with the real structure, fitted on the synthetic pool with random labels."""
    rng = np.random.default_rng(0)
    rows = []
    for profile in PROFILES["pool"]:
        row = example_row(
            {"answers": profile["answers"], "text": profile["text"], "handle": "x", "id": "p"},
            {
                "age": int(rng.integers(20, 55)),
                "height": int(rng.integers(60, 76)),
                "languages_count": int(rng.integers(1, 4)),
                "education_status": "graduated",
                "income_answered": int(rng.integers(0, 2)),
                "sex": str(rng.choice(["f", "m"])),
                "location": str(rng.choice(["san francisco, california", "oakland, california"])),
            },
        )
        rows.append(row)
    frame = pd.concat(rows, ignore_index=True)
    labels = pd.Series(rng.choice(CLASS_ORDER, size=len(frame), p=[0.1, 0.15, 0.6, 0.15]))
    pipeline = build_pipeline().fit(frame[[*ALL_FEATURES, "clean_text"]], labels)
    directory = tmp_path_factory.mktemp("tier1") / "tier1"
    write_artifacts(directory, pipeline, {"socially": 60.0, "often+": 15.0, "rarely": 15.0, "not at all": 10.0})
    return directory


@pytest.fixture
def copy_of(standin_dir, tmp_path):
    target = tmp_path / "tier1"
    shutil.copytree(standin_dir, target)
    return target


def local_client(directory):
    settings = Settings(_env_file=None, app_mode="local", tier1_artifact_dir=directory)
    return TestClient(create_app(settings))


# ------------------------------------------------------------------ prediction consistency and probability validity
@pytest.mark.parametrize("example_id", STARTER_IDS)
def test_probabilities_are_valid_and_sum_to_one(standin_dir, example_id):
    with local_client(standin_dir) as client:
        body = client.post("/api/v1/classify/predict", json={"example_id": example_id}).json()
    probabilities = [c["probability"] for c in body["classes"]]
    assert [c["level"] for c in body["classes"]] == CLASS_ORDER
    assert all(0 <= p <= 1 for p in probabilities)
    assert sum(probabilities) == pytest.approx(1.0, abs=1e-9)


@pytest.mark.parametrize("example_id", STARTER_IDS)
def test_the_predicted_class_is_the_most_probable_one_and_the_same_every_time(standin_dir, example_id):
    with local_client(standin_dir) as client:
        first = client.post("/api/v1/classify/predict", json={"example_id": example_id}).json()
        second = client.post("/api/v1/classify/predict", json={"example_id": example_id}).json()
    assert first == second
    top = max(first["classes"], key=lambda c: c["probability"])
    assert first["predicted"] == top["level"] and [c["is_predicted"] for c in first["classes"]].count(True) == 1
    assert first["top_probability"] == top["probability"]
    ranked = sorted((c["probability"] for c in first["classes"]), reverse=True)
    assert first["margin"] == pytest.approx(ranked[0] - ranked[1], abs=1e-3)


def test_the_service_matches_the_pipeline_directly(standin_dir):
    service = load_classifier(standin_dir, CONTENT_DIR)
    pipeline = joblib.load(standin_dir / "classifier.joblib")
    for example_id in STARTER_IDS:
        starter = service.starters[example_id]
        raw = pipeline.predict_proba(example_row(starter, PERSONAS[example_id]))[0]
        by_level = dict(zip(pipeline.classes_, raw, strict=True))
        got = {c["level"]: c["probability"] for c in service.predict(example_id)["classes"]}
        assert {level: got[level] for level in CLASS_ORDER} == pytest.approx(
            {level: by_level[level] for level in CLASS_ORDER}, abs=1e-3
        )


def test_base_rates_are_returned_beside_each_probability(standin_dir):
    with local_client(standin_dir) as client:
        body = client.post("/api/v1/classify/predict", json={"example_id": STARTER_IDS[0]}).json()
    assert {c["level"]: c["base_rate"] for c in body["classes"]} == {
        "not at all": 10.0,
        "rarely": 15.0,
        "socially": 60.0,
        "often+": 15.0,
    }


def test_the_row_for_the_model_has_every_input_and_data_vocabulary():
    for starter in PROFILES["starters"]:
        row = example_row(starter, PERSONAS[starter["id"]])
        assert list(row.columns) == [*ALL_FEATURES, "clean_text"] and len(row) == 1
        assert row.at[0, "wrote_no_essay"] == 0 and row.at[0, "essays_answered"] == 1.0
        pets = starter["answers"].get("pets")
        assert row.at[0, "pets"] == (PETS_TO_DATA[pets] if pets else None) or pd.isna(row.at[0, "pets"])


# ------------------------------------------------------------------ examples and input restrictions
def test_only_the_six_fictional_examples_exist_and_carry_the_synthetic_text(standin_dir):
    with local_client(standin_dir) as client:
        body = client.get("/api/v1/classify/examples").json()
    assert [e["example_id"] for e in body["examples"]] == STARTER_IDS
    texts = {s["id"]: s["text"] for s in PROFILES["starters"]}
    assert all(e["text"] == texts[e["example_id"]] for e in body["examples"])
    assert "fictional" in body["notice"].lower() and "educational" in body["notice"].lower()


@pytest.mark.parametrize(
    "payload",
    [
        {"text": MARKER},
        {"example_id": STARTER_IDS[0], "sex": "f"},
        {"example_id": STARTER_IDS[0], "location": "elsewhere"},
        {"example_id": STARTER_IDS[0], "answers": {"job": MARKER}},
        {"example_id": MARKER},
        {"example_id": "ex_zzzzzzzz"},
        {},
    ],
)
def test_no_free_text_sex_or_location_can_be_sent(standin_dir, payload):
    with local_client(standin_dir) as client:
        response = client.post("/api/v1/classify/predict", json=payload)
    assert response.status_code == 422
    assert MARKER not in response.text  # errors never echo what was sent


def test_an_unknown_example_is_not_found(standin_dir):
    with local_client(standin_dir) as client:
        response = client.post("/api/v1/classify/predict", json={"example_id": "ex_00000000"})
    assert response.status_code == 404 and response.json()["error"]["code"] == "not_found"


# ------------------------------------------------------------------ integrity
def test_a_copy_of_the_artefacts_loads_and_the_hashes_are_checked(copy_of):
    assert load_classifier(copy_of, CONTENT_DIR) is not None


def test_a_changed_model_file_is_refused_before_it_is_read(copy_of):
    (copy_of / "classifier.joblib").write_bytes(b"not a pickle at all")
    with pytest.raises(ClassifierError, match="does not match the manifest"):
        load_classifier(copy_of, CONTENT_DIR)  # the hash is checked first, so joblib never sees the file


def test_a_changed_meta_file_is_refused(copy_of):
    (copy_of / "classifier_meta.json").write_text(json.dumps({"base_rates": {}}))
    with pytest.raises(ClassifierError, match="does not match the manifest"):
        load_classifier(copy_of, CONTENT_DIR)


def test_a_missing_file_is_refused(copy_of):
    (copy_of / "classifier.joblib").unlink()
    with pytest.raises(ClassifierError):
        load_classifier(copy_of, CONTENT_DIR)


@pytest.mark.parametrize("change", [{"tier": 0}, {"kind": "something_else"}, {"versions": {"scikit-learn": "0.0.1"}}])
def test_a_wrong_manifest_is_refused(copy_of, change):
    manifest = json.loads((copy_of / "manifest.json").read_text())
    manifest.update(change)
    (copy_of / "manifest.json").write_text(json.dumps(manifest))
    with pytest.raises(ClassifierError):
        load_classifier(copy_of, CONTENT_DIR)


def test_a_folder_without_a_manifest_turns_the_feature_off(tmp_path):
    assert load_classifier(tmp_path, CONTENT_DIR) is None


def test_a_tampered_file_stops_the_application_from_starting(copy_of):
    (copy_of / "classifier.joblib").write_bytes(b"tampered")
    with pytest.raises(ClassifierError), local_client(copy_of):
        pass


# ------------------------------------------------------------------ public mode and availability
def test_public_mode_refuses_the_classifier_endpoints():
    with TestClient(create_app(Settings(_env_file=None, app_mode="public"))) as client:
        for response in (
            client.get("/api/v1/classify/examples"),
            client.post("/api/v1/classify/predict", json={"example_id": STARTER_IDS[0]}),
        ):
            assert response.status_code == 403 and response.json()["error"]["code"] == "local_only"
        assert client.get("/api/v1/meta").json()["features"]["classifier_demo"] is False


def test_public_mode_refuses_a_tier_one_folder_at_startup(standin_dir):
    with pytest.raises(ValueError, match="public"):
        Settings(_env_file=None, app_mode="public", tier1_artifact_dir=standin_dir)


def test_public_mode_never_loads_the_classifier_even_when_files_exist(standin_dir, monkeypatch):
    loaded = []
    monkeypatch.setattr("profile_api.main.load_classifier", lambda *a, **k: loaded.append(a))
    with TestClient(create_app(Settings(_env_file=None, app_mode="public"))):
        pass
    assert loaded == []


def test_local_mode_without_files_says_so():
    with TestClient(create_app(Settings(_env_file=None, app_mode="local"))) as client:
        response = client.get("/api/v1/classify/examples")
        assert response.status_code == 503 and response.json()["error"]["code"] == "feature_unavailable"
        assert client.get("/api/v1/meta").json()["features"]["classifier_demo"] is False


def test_local_mode_with_files_turns_the_feature_on(standin_dir):
    with local_client(standin_dir) as client:
        assert client.get("/api/v1/meta").json()["features"]["classifier_demo"] is True


@pytest.mark.skipif(
    subprocess.run(["git", "rev-parse"], cwd=BACKEND_DIR, capture_output=True, check=False).returncode != 0,  # noqa: S603, S607
    reason="needs a git checkout",
)
def test_the_artefact_folder_is_git_ignored():
    import subprocess

    result = subprocess.run(
        ["git", "check-ignore", "app/backend/artifacts/tier1/classifier.joblib"],  # noqa: S607
        cwd=BACKEND_DIR.parents[1],
        capture_output=True,
    )
    assert result.returncode == 0


# ------------------------------------------------------------------ privacy
def test_nothing_is_logged_stored_or_written_while_classifying(standin_dir, caplog, tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    with local_client(standin_dir) as client:
        caplog.set_level(logging.DEBUG)
        before = sorted(p.name for p in tmp_path.iterdir())
        client.post("/api/v1/classify/predict", json={"example_id": STARTER_IDS[0]})
        client.post("/api/v1/classify/predict", json={"text": MARKER, "example_id": STARTER_IDS[1]})
        client.get("/api/v1/classify/examples")
    assert MARKER not in caplog.text
    assert all(PROFILES["starters"][0]["text"][:40] not in r.getMessage() for r in caplog.records)
    assert sorted(p.name for p in tmp_path.iterdir()) == before  # no file appeared


def test_responses_carry_no_real_profile_data(standin_dir):
    with local_client(standin_dir) as client:
        text = (
            client.get("/api/v1/classify/examples").text
            + client.post("/api/v1/classify/predict", json={"example_id": STARTER_IDS[0]}).text
        )
    assert "essay" not in text.lower() and "profile_id" not in text


# ------------------------------------------------------------------ the exported artefact itself
@real
def test_real_artefact_hashes_and_structure():
    manifest = json.loads((REAL_DIR / "manifest.json").read_text())
    assert manifest["tier"] == 1 and manifest["derived_from_real_data"] is True
    for name, info in manifest["files"].items():
        assert sha(REAL_DIR / name) == info["sha256"]
    meta = json.loads((REAL_DIR / "classifier_meta.json").read_text())
    assert meta["hyperparameters"]["C"] == 1.0 and meta["hyperparameters"]["class_weight"] == "balanced"
    assert meta["hyperparameters"]["max_iter"] == 3000 and meta["n_training_users"] == 45568
    assert meta["n_structured_columns"] == 124 and meta["n_tfidf_terms"] == 20000
    assert all(c["passed"] for c in meta["checks"])
    assert "never used" in meta["test_set"]


@real
def test_real_artefact_belongs_to_this_notebook():
    from profile_api.paths import NOTEBOOK

    manifest = json.loads((REAL_DIR / "manifest.json").read_text())
    assert manifest["notebook_sha256"] == hashlib.sha256(NOTEBOOK.read_bytes()).hexdigest()


@real
def test_real_artefact_base_rates_match_the_notebook_findings():
    lab = json.loads((CONTENT_DIR / "lab" / "lab_summary.json").read_text())
    meta = json.loads((REAL_DIR / "classifier_meta.json").read_text())
    notebook = {level["level"]: level["share_pct"] for level in lab["overview"]["target"]["levels"]}
    assert meta["base_rates"] == notebook


@real
def test_real_classifier_gives_valid_consistent_probabilities_for_every_example():
    service = load_classifier(REAL_DIR, CONTENT_DIR)
    assert isinstance(service, ClassifierService) and len(service.starters) == 6
    pipeline = joblib.load(REAL_DIR / "classifier.joblib")
    for example_id in STARTER_IDS:
        first, second = service.predict(example_id), service.predict(example_id)
        assert first == second
        probabilities = [c["probability"] for c in first["classes"]]
        assert sum(probabilities) == pytest.approx(1.0, abs=1e-9) and all(0 <= p <= 1 for p in probabilities)
        raw = pipeline.predict_proba(example_row(service.starters[example_id], PERSONAS[example_id]))[0]
        assert first["predicted"] == pipeline.classes_[raw.argmax()]
        assert first["top_probability"] == pytest.approx(raw.max(), abs=1e-3)


@real
def test_real_classifier_is_served_in_local_mode_and_refused_in_public_mode():
    with local_client(REAL_DIR) as client:
        assert client.get("/api/v1/meta").json()["features"]["classifier_demo"] is True
        assert client.post("/api/v1/classify/predict", json={"example_id": STARTER_IDS[0]}).status_code == 200
    with TestClient(create_app(Settings(_env_file=None, app_mode="public"))) as client:
        assert client.post("/api/v1/classify/predict", json={"example_id": STARTER_IDS[0]}).status_code == 403


def test_every_endpoint_in_local_mode_with_the_classifier_loaded(standin_dir):
    from test_hardening import ENDPOINTS

    with local_client(standin_dir) as client:
        got = [client.request(m, p, json=b).status_code for m, p, b in ENDPOINTS]
    assert got == [200] * 9
