"""The application reuses the notebook's methods. These tests run the notebook's own source and compare."""

import ast
import json
import re

import numpy as np
import pytest
from conftest import notebook_cells

from profile_api import artifacts
from profile_api.ml import tfidf as app_tfidf
from profile_api.ml.text_cleaning import clean_text
from profile_api.paths import BACKEND_DIR, CONTENT_DIR, REPO_DIR

STRINGS = [
    "I love hiking, cooking &amp; long walks with my dog!",
    "Email me at someone@example.com or call (415) 555-1234 for a chat.",
    "Check www.example.org and https://example.com/page?x=1 now",
    "Follow @someone_handle and say hi <br /> new line <b>bold</b>",
    "It's what's-it: don't you'll can't, ÉCOLE café naïve 日本語 and 123 numbers 4.5",
    "   spaced     out\t\ttext\nacross lines   ",
    "",
    "&lt;script&gt;alert(1)&lt;/script&gt; and &quot;quotes&quot; &#39;apostrophes&#39;",
]


def notebook_namespace() -> dict:
    """Execute only the cleaning patterns and `clean_text` from the notebook, in an empty namespace."""
    source = next(cell for cell in notebook_cells() if "def clean_text" in cell)
    keep = [
        node for node in ast.parse(source).body
        if isinstance(node, ast.FunctionDef) and node.name == "clean_text"
        or isinstance(node, ast.Assign) and getattr(node.targets[0], "id", "").endswith("_PATTERN")
    ]  # fmt: skip
    namespace: dict = {"re": re, "html": __import__("html")}
    exec(compile(ast.Module(body=keep, type_ignores=[]), "notebook", "exec"), namespace)  # noqa: S102
    return namespace


@pytest.mark.parametrize("text", STRINGS)
def test_clean_text_matches_the_notebook(text):
    assert clean_text(text) == notebook_namespace()["clean_text"](text)


def test_cleaning_patterns_match_the_notebook():
    from profile_api.ml import text_cleaning

    namespace = notebook_namespace()
    for name in ("URL_PATTERN", "EMAIL_PATTERN", "HANDLE_PATTERN", "PHONE_PATTERN"):
        assert getattr(text_cleaning, name) == namespace[name]


def test_the_embedding_model_is_the_notebooks(client):
    constants = next(cell for cell in notebook_cells() if "EMBEDDING_MODEL =" in cell)
    assert (
        re.search(r'EMBEDDING_MODEL = "([^"]+)"', constants).group(1) == client.app.state.discovery.embedder.model_name
    )


def test_tfidf_settings_match_the_notebook_except_min_df():
    constants = next(cell for cell in notebook_cells() if "TFIDF_MIN_DOCS =" in cell)
    notebook_max_features = int(re.search(r"TFIDF_MAX_FEATURES = (\d+)", constants).group(1))
    source = next(cell for cell in notebook_cells() if "def make_tfidf" in cell)
    call = next(
        n
        for n in ast.walk(ast.parse(source))
        if isinstance(n, ast.Call) and getattr(n.func, "id", "") == "TfidfVectorizer"
    )
    notebook = {k.arg: ast.literal_eval(k.value) if not isinstance(k.value, ast.Name) else None for k in call.keywords}
    ours = dict(app_tfidf.SETTINGS)
    assert notebook.pop("min_df") is None  # a named constant in the notebook (10)
    assert notebook.pop("max_features") is None
    assert ours.pop("max_features") == notebook_max_features
    assert ours.pop("min_df") == app_tfidf.POOL_MIN_DOCS < int(re.search(r"TFIDF_MIN_DOCS = (\d+)", constants).group(1))
    assert ours == notebook


def test_the_search_is_the_notebooks_nearest_neighbors_call():
    source = next(cell for cell in notebook_cells() if "NearestNeighbors(" in cell)
    assert 'NearestNeighbors(metric="cosine", algorithm="brute")' in source
    assert (
        'NearestNeighbors(metric="cosine", algorithm="brute")'
        in (BACKEND_DIR / "profile_api" / "services" / "search.py").read_text()
    )


def test_stored_embeddings_equal_what_the_live_model_produces(service):
    stored = np.load(BACKEND_DIR / "artifacts" / "embeddings.npy")
    profiles = json.loads((CONTENT_DIR / "synthetic" / "profiles.json").read_text())["pool"]
    sample = [3, 250, 799]
    live = service.embedder.encode([clean_text(profiles[i]["text"]) for i in sample])
    assert np.abs(live - stored[sample]).max() < 1e-5


def test_stored_embeddings_are_unit_length(service):
    stored = np.load(BACKEND_DIR / "artifacts" / "embeddings.npy")
    assert np.allclose(np.linalg.norm(stored, axis=1), 1.0, atol=1e-5)


def test_pinned_versions_match_the_notebook_requirements():
    def pins(path):
        return dict(re.findall(r"^([A-Za-z0-9_.-]+)==([^\s#]+)", path.read_text(), re.M))

    root, backend = pins(REPO_DIR / "requirements.txt"), pins(BACKEND_DIR / "requirements.txt")
    shared = {
        "numpy",
        "scipy",
        "scikit-learn",
        "joblib",
        "sentence-transformers",
        "torch",
        "transformers",
        "huggingface_hub",
    }
    assert shared <= set(backend)
    assert {name: backend[name] for name in shared} == {name: root[name] for name in shared}


def test_manifest_records_the_model_and_library_versions():
    manifest = json.loads((BACKEND_DIR / "artifacts" / "manifest.json").read_text())
    assert manifest["tier"] == 0 and manifest["source_is_synthetic"] is True
    assert manifest["model"]["dimension"] == 384
    assert set(manifest["versions"]) >= {"scikit-learn", "sentence-transformers"}
    assert artifacts.FILES == tuple(manifest["files"])
