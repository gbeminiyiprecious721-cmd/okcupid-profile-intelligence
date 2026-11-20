"""Lab findings: numerical accuracy against the notebook, shape and privacy of the served aggregates."""

import hashlib
import json
import re
import subprocess
import sys

import pytest
from fastapi.testclient import TestClient

from profile_api.artifacts import ArtifactError
from profile_api.config import Settings
from profile_api.main import create_app
from profile_api.paths import BACKEND_DIR, NOTEBOOK
from profile_api.schemas.lab import LabSummary
from profile_api.services.lab_data import LAB_DIR, load_lab
from tests.test_privacy import notebook_names

SUMMARY_PATH = LAB_DIR / "lab_summary.json"
DATA = json.loads(SUMMARY_PATH.read_text())


@pytest.fixture(scope="module")
def lab_client():
    app = create_app(Settings(app_mode="public"))
    with TestClient(app) as client:
        yield client


# ------------------------------------------------------------------ headline numbers, typed from the notebook text
def test_headline_numbers_match_the_notebook():
    """These values were read off the notebook's own sentences (sections 4, 9, 10, 11, 12), not off the export."""
    d = DATA
    assert d["overview"]["dataset"]["profiles"] == 59946
    assert d["overview"]["dataset"]["labelled"] == 56961
    assert (d["overview"]["dataset"]["train"], d["overview"]["dataset"]["test"]) == (45568, 11393)
    assert d["overview"]["baseline_train"] == {"accuracy": 0.733, "macro_f1": 0.212}
    t = d["models"]["test"]
    assert (t["final"]["macro_f1"], t["baseline"]["macro_f1"], t["final"]["validation_macro_f1"]) == (
        0.386,
        0.212,
        0.387,
    )
    assert (t["final"]["accuracy"], t["baseline"]["accuracy"]) == (0.517, 0.734)
    by_metric = {i["metric"]: i for i in t["intervals"]}
    assert (by_metric["final model"]["low"], by_metric["final model"]["high"]) == (0.376, 0.397)
    assert by_metric["gain over baseline"]["score"] == 0.175
    s = d["segments"]
    assert [i["users"] for i in s["items"]] == [9461, 10522, 5727, 6960, 6964, 7154]
    assert s["stability_k6"] == {"new_seed": 0.98, "new_sample": 0.97}
    assert s["silhouette"]["k6_about"] == 0.05 and s["silhouette"]["maximum"] == 0.085
    assert [i["male_pct"] for i in s["items"]][:2] == [91.0, 18.0]
    assert d["models"]["segment_effect"]["mean_change"] == -0.0017
    sim = {f["field"]: f for f in d["similarity"]["fields"]}
    assert (sim["job"]["chance"], sim["job"]["tfidf"], sim["job"]["embeddings"]) == (0.082, 0.126, 0.126)
    assert (sim["drinks_level"]["chance"], sim["drinks_level"]["tfidf"], sim["drinks_level"]["embeddings"]) == (
        0.564,
        0.575,
        0.603,
    )
    groups = {(r["kind"], r["group"]): r["macro_f1"] for r in d["fairness"]["subgroups"]}
    assert groups[("sex", "f")] == 0.393 and groups[("sex", "m")] == 0.381
    assert groups[("age_band", "45 and over")] == 0.327 and groups[("segment", "no text")] == 0.275


def test_the_six_segments_add_up():
    items = DATA["segments"]["items"]
    assert sum(i["users"] for i in items) == DATA["overview"]["dataset"]["segmented"]
    assert abs(sum(i["share_pct"] for i in items) - 100) < 0.2


def test_the_split_adds_up():
    ds = DATA["overview"]["dataset"]
    assert ds["train"] + ds["test"] == ds["labelled"]
    assert ds["labelled"] + ds["unlabelled"] == ds["profiles"]
    assert sum(level["count"] for level in DATA["overview"]["target"]["levels"]) == ds["labelled"]
    assert (
        sum(c["support"] for c in DATA["models"]["test"]["per_class"]) == ds["test"] == DATA["models"]["test"]["users"]
    )


def test_subgroups_cover_the_test_set_once_per_kind():
    groups = DATA["fairness"]["subgroups"]
    for kind in ("sex", "age_band", "essay_length", "segment"):
        total = sum(g["users"] for g in groups if g["kind"] == kind)
        assert total == DATA["models"]["test"]["users"], kind


def test_confusion_matrix_agrees_with_recall_and_rows_sum_to_about_100():
    c = DATA["models"]["confusion_pct"]
    recall = {r["level"]: r["recall"] for r in DATA["models"]["test"]["per_class"]}
    for label, row, i in zip(c["labels"], c["rows"], range(4), strict=True):
        assert abs(row[i] - recall[label] * 100) <= 0.51, label  # the figure rounds to whole percent
        assert 99 <= sum(row) <= 101
    assert c["rows"][3][2] == DATA["models"]["test"]["often_predicted_socially_pct"]
    assert c["rows"][0][1] == DATA["models"]["test"]["not_at_all_predicted_rarely_pct"]


def test_lift_columns_are_agreement_over_chance():
    for f in DATA["similarity"]["fields"]:
        assert abs(f["tfidf"] / f["chance"] / f["tfidf_lift"] - 1) < 0.02, f["field"]  # inputs are rounded to 3 places
        assert abs(f["embeddings"] / f["chance"] / f["embeddings_lift"] - 1) < 0.02, f["field"]


def test_macro_f1_is_the_mean_of_class_f1():
    pc = DATA["models"]["test"]["per_class"]
    assert abs(sum(c["f1"] for c in pc) / 4 - DATA["models"]["test"]["final"]["macro_f1"]) < 0.001


# ------------------------------------------------------------------ every number is in the notebook
def notebook_numbers() -> set[float]:
    nb = json.loads(NOTEBOOK.read_text())
    texts = []
    for cell in nb["cells"]:
        if cell["cell_type"] == "markdown":
            texts.append("".join(cell["source"]))
        for out in cell.get("outputs", []):
            text = out.get("text") or out.get("data", {}).get("text/plain")
            if text:
                texts.append("".join(text))
    found = set()
    for token in re.findall(r"-?\d[\d,]*\.?\d*", "\n".join(texts)):
        try:
            found.add(float(token.replace(",", "").rstrip(".")))
        except ValueError:
            pass
    return found


def leaves(node, path=""):
    if isinstance(node, dict):
        for key, value in node.items():
            yield from leaves(value, f"{path}.{key}")
    elif isinstance(node, list):
        for i, value in enumerate(node):
            yield from leaves(value, f"{path}[{i}]")
    elif isinstance(node, (int, float)) and not isinstance(node, bool):
        yield path, node


def test_every_number_in_the_summary_appears_in_the_notebook():
    known = notebook_numbers()
    skipped = (
        "schema_version",
        "confusion_pct.rows",
        "provenance",
    )  # the matrix is read from a figure, see its own test
    missing = [
        (path, value)
        for path, value in leaves({k: v for k, v in DATA.items() if k != "provenance"})
        if not any(s in path for s in skipped) and float(value) not in known
    ]
    assert missing == []


def test_the_export_is_current_and_repeatable(tmp_path):
    subprocess.run(
        [sys.executable, str(BACKEND_DIR / "scripts" / "export_lab_data.py"), "--out", str(tmp_path)], check=True
    )
    assert (tmp_path / "lab_summary.json").read_bytes() == SUMMARY_PATH.read_bytes()
    for name in DATA["provenance"]["figures"]:
        assert (tmp_path / "figures" / name).read_bytes() == (LAB_DIR / "figures" / name).read_bytes()


def test_provenance_names_this_notebook():
    assert DATA["provenance"]["notebook_sha256"] == hashlib.sha256(NOTEBOOK.read_bytes()).hexdigest()


# ------------------------------------------------------------------ privacy
def strings(node):
    if isinstance(node, dict):
        for key, value in node.items():
            yield key
            yield from strings(value)
    elif isinstance(node, list):
        for value in node:
            yield from strings(value)
    elif isinstance(node, str):
        yield node


def test_the_summary_holds_no_free_text_contact_detail_or_name():
    names = notebook_names()
    body = json.loads(json.dumps({k: v for k, v in DATA.items() if k != "provenance"}))
    body["models"]["confusion_pct"].pop("source")  # one documented sentence, checked in its own test
    for text in strings(body):
        assert len(text) <= 70, text  # labels and words only, never a passage
        assert not re.search(r"@|https?://|www\.", text), text
    top_words = {w for s in DATA["segments"]["items"] for w in s["top_words"]}
    assert not {w for word in top_words for w in word.split()} & names


def test_no_record_level_data_is_present():
    for text in json.dumps(DATA).split('"'):
        assert not re.search(r"\b(essay\d|profile_id|row_id)\b", text), text
    sizes = [g["users"] for g in DATA["fairness"]["subgroups"]] + [s["users"] for s in DATA["segments"]["items"]]
    assert min(sizes) >= 300  # no small cell that could single anyone out


def test_the_schema_refuses_extra_fields():
    bad = json.loads(SUMMARY_PATH.read_text())
    bad["segments"]["items"][0]["example_essay"] = "should never be here"
    with pytest.raises(ValueError):
        LabSummary.model_validate(bad)


# ------------------------------------------------------------------ serving
def test_summary_endpoint_returns_the_file(lab_client):
    response = lab_client.get("/api/v1/lab/summary")
    assert response.status_code == 200
    assert response.json() == DATA
    assert lab_client.get("/api/v1/meta").json()["features"]["lab_summary"] is True


def test_public_mode_serves_the_same_aggregates():
    with TestClient(create_app(Settings(app_mode="public"))) as client:
        assert client.get("/api/v1/lab/summary").json() == DATA


def test_figures_are_served_by_name_only(lab_client):
    for name in ("confusion_matrix", "clusters_vs_k"):
        response = lab_client.get(f"/api/v1/lab/figures/{name}")
        assert response.status_code == 200 and response.headers["content-type"] == "image/png"
    assert lab_client.get("/api/v1/lab/figures/profiles").status_code == 404
    assert lab_client.get("/api/v1/lab/figures/..%2f..%2fprofiles").status_code in (404, 422)
    assert lab_client.get("/api/v1/lab/figures/Bad.Name").status_code == 422


def test_a_changed_file_stops_startup(tmp_path):
    for item in LAB_DIR.rglob("*"):
        if item.is_file():
            target = tmp_path / item.relative_to(LAB_DIR)
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(item.read_bytes())
    assert load_lab(tmp_path) is not None
    (tmp_path / "lab_summary.json").write_text((tmp_path / "lab_summary.json").read_text().replace("0.386", "0.486", 1))
    with pytest.raises(ArtifactError):
        load_lab(tmp_path)


def test_a_changed_figure_stops_startup(tmp_path):
    for item in LAB_DIR.rglob("*"):
        if item.is_file():
            target = tmp_path / item.relative_to(LAB_DIR)
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(item.read_bytes())
    (tmp_path / "figures" / "confusion_matrix.png").write_bytes(b"not the figure")
    with pytest.raises(ArtifactError):
        load_lab(tmp_path)


def test_missing_file_turns_the_feature_off(tmp_path):
    assert load_lab(tmp_path) is None


def test_lab_endpoint_is_unavailable_when_not_loaded():
    app = create_app(Settings(app_mode="public"))
    client = TestClient(app)  # no lifespan: nothing loaded
    response = client.get("/api/v1/lab/summary")
    assert response.status_code == 503 and response.json()["error"]["code"] == "feature_unavailable"


# ------------------------------------------------------------------ presentation choices that must stay verifiable
def test_standout_words_are_exactly_the_notebooks_printed_lists():
    """No word is added, removed or reordered. The notebook already removed common first names before printing."""
    nb = json.loads(NOTEBOOK.read_text())
    printed = next(
        "".join(out["text"])
        for cell in nb["cells"]
        for out in cell.get("outputs", [])
        if "Segment 1 (9,461 users)" in "".join(out.get("text", []))
    )
    expected = {int(n): words.split(", ") for n, words in re.findall(r"Segment (\d) \([\d,]+ users\): (.+)", printed)}
    shown = {s["id"]: s["top_words"] for s in DATA["segments"]["items"]}
    assert shown == expected
    assert all(len(words) == 10 for words in shown.values())
    assert not set(w for ws in shown.values() for word in ws for w in word.split()) & notebook_names()


def test_the_confusion_matrix_is_labelled_as_transcribed_and_rounded():
    source = DATA["models"]["confusion_pct"]["source"]
    assert "transcribed" in source and "figure" in source and "not recomputed" in source


def test_only_segments_five_and_six_have_drinking_figures_and_the_rest_a_range():
    check = DATA["segments"]["drinking_check"]
    assert (check["highest_segment"], check["highest_often_pct"]) == (5, 17)
    assert (check["lowest_segment"], check["lowest_often_pct"]) == (6, 5)
    assert (check["others_often_low_pct"], check["others_often_high_pct"]) == (8, 12)
    assert not any("drink" in key for item in DATA["segments"]["items"] for key in item)
