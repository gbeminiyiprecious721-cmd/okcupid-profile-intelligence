"""Serving uses less memory without changing any number.

The lean encoder replaces the sentence_transformers package when serving. These tests hold it to bit for bit equality
with the package, and check that public mode no longer imports what only the classifier or the build needs.
"""

import json
import subprocess
import sys

import numpy as np
import pytest

from profile_api.paths import BACKEND_DIR, CONTENT_DIR
from profile_api.services.embedding import MODEL_NAME, EmbeddingService

SYNTHETIC = json.loads((CONTENT_DIR / "synthetic" / "profiles.json").read_text())
TEXTS = [p["text"] for p in SYNTHETIC["pool"][::4] + SYNTHETIC["starters"]] + [
    "a",
    "hi there",
    "word " * 400,  # far past the 256 token limit: truncated the same way
    "héllo wörld ñandú 🙂 日本語 " * 20,
    "  spaced   out  ",
]


@pytest.fixture(scope="module")
def both():
    try:
        package = EmbeddingService(MODEL_NAME, backend="sentence-transformers")
        lean = EmbeddingService(MODEL_NAME, backend="lean")
    except RuntimeError:
        pytest.skip("the embedding model is not in the local cache")
    package.model.to("cpu")  # the package picks the Apple GPU on a Mac, which rounds differently; the lean encoder is CPU
    return package, lean


def test_the_lean_encoder_gives_exactly_the_packages_vectors(both):
    package, lean = both
    for text in TEXTS:
        assert np.array_equal(package.encode([text]), lean.encode([text])), text[:40]


def test_the_lean_encoder_gives_the_same_vectors_at_any_thread_count(both):
    import torch

    _, lean = both
    before = torch.get_num_threads()
    try:
        results = {}
        for threads in (1, 2, 4):
            torch.set_num_threads(threads)
            results[threads] = np.vstack([lean.encode([t]) for t in TEXTS[:60]])
    finally:
        torch.set_num_threads(before)
    assert np.array_equal(results[1], results[2]) and np.array_equal(results[1], results[4])


def test_the_dimension_and_revision_agree(both):
    package, lean = both
    assert package.dimension == lean.dimension == 384
    assert package.revision == lean.revision


def test_public_mode_loads_neither_sentence_transformers_nor_the_classifier():
    """Pandas itself cannot be tested here: scikit-learn imports it whenever it is installed. The container image removes
    it (see deploy/Dockerfile.render) and its smoke test checks that it cannot be imported."""
    code = (
        "import sys\n"
        "from fastapi.testclient import TestClient\n"
        "from profile_api.config import Settings\n"
        "from profile_api.main import create_app\n"
        "with TestClient(create_app(Settings(_env_file=None, app_mode='public', rate_limit_enabled=False))) as c:\n"
        "    r = c.post('/api/v1/discover/similar', json={'text': 'hiking with my dog and baking bread on sundays', 'method': 'both', 'k': 3})\n"
        "    assert r.status_code == 200, r.text\n"
        "assert 'sentence_transformers' not in sys.modules, 'sentence_transformers was imported while serving'\n"
        "assert 'profile_api.services.classifier' not in sys.modules, 'the classifier module was imported in public mode'\n"
        "print('ok')\n"
    )
    done = subprocess.run([sys.executable, "-c", code], cwd=BACKEND_DIR, capture_output=True, text=True)
    assert done.returncode == 0 and "ok" in done.stdout, done.stderr[-800:]
