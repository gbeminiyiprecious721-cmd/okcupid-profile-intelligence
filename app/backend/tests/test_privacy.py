"""Privacy: no real data, no echo, no logging of input, personal details removed, synthetic content clean."""

import ast
import json
import logging
import os
import re
from pathlib import Path

import pytest
from conftest import notebook_cells, similar

from profile_api.paths import BACKEND_DIR, CONTENT_DIR, REPO_DIR

CONTENT = json.loads((CONTENT_DIR / "synthetic" / "profiles.json").read_text())
EVERYONE = CONTENT["pool"] + CONTENT["starters"]
MARKER = "zebra7quartz-unique-marker"


# ----------------------------------------------------------------------------- the data the API can reach
def test_the_pool_is_flagged_synthetic_everywhere():
    assert CONTENT["is_synthetic"] is True
    assert all(p["is_synthetic"] is True for p in EVERYONE)
    assert len(CONTENT["pool"]) == 800 and 600 <= len(CONTENT["pool"]) <= 1000


def test_identifiers_are_anonymous_and_unrelated_to_content():
    assert all(re.fullmatch(r"(syn|ex)_[0-9a-f]{8}", p["id"]) for p in EVERYONE)
    assert len({p["id"] for p in EVERYONE}) == len(EVERYONE)


def test_starters_are_not_in_the_searchable_pool():
    assert not {p["id"] for p in CONTENT["starters"]} & {p["id"] for p in CONTENT["pool"]}
    assert not {p["text"] for p in CONTENT["starters"]} & {p["text"] for p in CONTENT["pool"]}


def test_public_mode_only_loads_tier_zero_synthetic_artifacts(client):
    manifest = json.loads((BACKEND_DIR / "artifacts" / "manifest.json").read_text())
    assert manifest["tier"] == 0 and manifest["source_is_synthetic"] is True
    assert client.get("/api/v1/health").json()["mode"] == "public"
    assert client.app.state.discovery.pool == CONTENT["pool"]


def test_no_real_data_file_is_opened_while_serving_requests(client, monkeypatch):
    opened = []
    real_open = open

    def spy(file, *args, **kwargs):
        opened.append(str(file))
        return real_open(file, *args, **kwargs)

    monkeypatch.setattr("builtins.open", spy)
    monkeypatch.setattr(Path, "open", lambda self, *a, **k: (opened.append(str(self)), real_open(self, *a, **k))[1])
    for _ in range(3):
        assert similar(client, "hiking with my dog and cooking soup afterwards", k=10).status_code == 200
        client.get("/api/v1/examples")
        client.get("/api/v1/meta")
    assert not [name for name in opened if name.endswith(".csv") or "profiles.csv" in name]


def test_requests_never_load_fit_or_train_anything(client, monkeypatch):
    import joblib
    from sentence_transformers import SentenceTransformer
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.neighbors import NearestNeighbors

    def forbidden(name):
        def refuse(*_a, **_k):
            raise AssertionError(f"{name} was called while serving a request")

        return refuse

    monkeypatch.setattr(TfidfVectorizer, "fit", forbidden("TfidfVectorizer.fit"))
    monkeypatch.setattr(TfidfVectorizer, "fit_transform", forbidden("TfidfVectorizer.fit_transform"))
    monkeypatch.setattr(NearestNeighbors, "fit", forbidden("NearestNeighbors.fit"))
    monkeypatch.setattr(joblib, "load", forbidden("joblib.load"))
    monkeypatch.setattr(SentenceTransformer, "__init__", forbidden("SentenceTransformer()"))
    assert similar(client, k=10).status_code == 200


# ----------------------------------------------------------------------------- what the API returns
def test_search_results_never_contain_profile_text(client):
    raw = similar(client, k=10).text
    assert '"text"' not in raw
    texts = {p["text"] for p in EVERYONE}
    assert not any(t[:40] in raw for t in texts)


def test_results_carry_only_safe_fields(client):
    neighbour = similar(client, k=1).json()["results"][0]["neighbours"][0]
    assert set(neighbour) == {
        "rank", "profile_id", "display_handle", "score", "lifestyle", "shared_answers", "shared_terms", "themes", "shared_themes",
    }  # fmt: skip
    assert set(neighbour["lifestyle"]) == {
        "smokes", "drugs", "diet_type", "education_level", "job", "offspring", "pets", "status", "body_type",
    }  # fmt: skip
    for sensitive in ("orientation", "religion", "ethnicity", "sex", "age", "location", "essay"):
        assert not re.search(rf"\b{sensitive}\b", json.dumps(neighbour).lower())


def test_the_detail_endpoint_returns_synthetic_profiles_only(client):
    for profile in (CONTENT["pool"][0], CONTENT["starters"][0]):
        body = client.get(f"/api/v1/discover/profiles/{profile['id']}").json()
        assert body["is_synthetic"] is True and body["text"] == profile["text"]


def test_examples_are_the_six_starters(client):
    examples = client.get("/api/v1/examples").json()["examples"]
    assert len(examples) == 6 and all(e["is_synthetic"] and e["profile_id"].startswith("ex_") for e in examples)


# ----------------------------------------------------------------------------- the visitor's input
def test_personal_details_are_removed_and_counted_but_never_returned(client):
    text = "I love hiking with my dog. Email me at secret.person@example.com or call 415.555.0199, see https://example.com/me or @secrethandle"
    response = similar(client, text, k=3)
    body = response.json()
    assert body["input"]["personal_details_removed"] == {"link": 1, "email": 1, "handle": 1, "phone": 1}
    for leaked in ("secret.person", "415.555.0199", "example.com", "secrethandle", "hiking with my dog"):
        assert leaked not in response.text


def test_a_hyphenated_phone_number_is_not_counted_but_its_digits_never_reach_the_output(client):
    """The notebook's phone rule needs a space or dot between digit groups, and parity keeps it. Digits are dropped by the
    letters only rule anyway, so nothing numeric is used or returned."""
    response = similar(client, "I love hiking with my dog, call 415-555-0199 tonight", k=3)
    assert "phone" not in response.json()["input"]["personal_details_removed"]
    assert "0199" not in response.text


def test_results_do_not_depend_on_removed_details(client):
    clean = similar(client, "I love hiking with my dog and camping outside", k=5).json()["results"]
    dirty = similar(client, "I love hiking with my dog and camping outside 415.555.0199 a@b.org", k=5).json()["results"]
    assert clean == dirty


def test_the_visitors_text_is_never_echoed(client):
    response = similar(client, f"{MARKER} hiking with my dog and camping")
    assert MARKER not in response.text


def test_errors_never_echo_input(client):
    for payload in ({"text": MARKER, "secret_field": MARKER}, {"text": MARKER * 200}, {"text": 5, "k": MARKER}):
        response = client.post("/api/v1/discover/similar", json=payload)
        assert MARKER not in response.text
    assert (
        MARKER
        not in client.post(
            "/api/v1/discover/similar", content=f"{{{MARKER}", headers={"Content-Type": "application/json"}
        ).text
    )


def test_input_is_never_logged(client, caplog):
    caplog.set_level(logging.DEBUG)
    similar(client, f"{MARKER} hiking with my dog and camping")
    similar(client, MARKER)  # too short, an error path
    client.post("/api/v1/discover/similar", json={"text": MARKER, "bogus": MARKER})
    assert MARKER not in caplog.text


# ----------------------------------------------------------------------------- the synthetic content
def notebook_names() -> set[str]:
    source = next(cell for cell in notebook_cells() if "PERSONAL_NAMES" in cell)
    node = next(
        n
        for n in ast.parse(source).body
        if isinstance(n, ast.Assign) and getattr(n.targets[0], "id", "") == "PERSONAL_NAMES"
    )
    return set(eval(ast.unparse(node.value)))  # noqa: S307


def words_of(profile) -> set[str]:
    return set(re.sub(r"[^a-z ]", " ", f"{profile['text']} {profile['handle']}".lower().replace("'", "")).split())


def test_no_personal_names_in_synthetic_content():
    names = notebook_names()
    assert len(names) > 100
    assert [p["id"] for p in EVERYONE if words_of(p) & names] == []


def test_no_contact_details_or_digits_in_synthetic_content():
    from profile_api.ml import text_cleaning as t

    patterns = [t.URL_PATTERN, t.EMAIL_PATTERN, t.HANDLE_PATTERN, t.PHONE_PATTERN]
    assert [
        p["id"] for p in EVERYONE if any(re.search(x, p["text"], re.I) for x in patterns) or re.search(r"\d", p["text"])
    ] == []


def test_no_sensitive_gendered_or_substance_terms_in_synthetic_content():
    banned = set(
        """christian muslim jewish catholic hindu buddhist atheist gay straight bisexual lesbian black white asian
        latino hispanic man men woman women guy girl male female he she his her him boyfriend girlfriend husband wife
        drink drinks drinking beer wine cocktail alcohol smoke smoking weed drug drugs""".split()
    )
    assert [p["id"] for p in EVERYONE if words_of(p) & banned] == []


def test_synthetic_answers_exclude_sensitive_fields():
    assert all(set(p["answers"]) == {
        "smokes", "drugs", "diet_type", "education_level", "job", "offspring", "pets", "status", "body_type",
    } for p in EVERYONE)  # fmt: skip


def test_the_validation_report_is_current_and_clean():
    report = json.loads((CONTENT_DIR / "synthetic" / "validation_report.json").read_text())
    import hashlib

    assert (
        report["profiles_sha256"]
        == hashlib.sha256((CONTENT_DIR / "synthetic" / "profiles.json").read_bytes()).hexdigest()
    )
    assert report["passed"] is True
    overlap = report["checks"]["real_essay_overlap"]
    assert overlap["checked"] is True and overlap["seven_word_hits"] == 0 and overlap["essays_scanned"] > 100_000


@pytest.mark.skipif(
    not os.environ.get("RUN_LOCAL_DATA_TESTS") or not (REPO_DIR / "profiles.csv").exists(),
    reason="reads the private data file. Set RUN_LOCAL_DATA_TESTS=1 on the author's computer",
)
def test_no_seven_word_overlap_with_the_real_essays_right_now():
    """Re-runs the overlap check against the real essays on this computer. Only a count is looked at."""
    import importlib.util

    spec = importlib.util.spec_from_file_location(
        "validate_synthetic", BACKEND_DIR / "scripts" / "validate_synthetic.py"
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    token_lists = [module.tokens(p["text"]) for p in EVERYONE]
    assert module.real_overlap(REPO_DIR / "profiles.csv", token_lists)["seven_word_hits"] == 0
