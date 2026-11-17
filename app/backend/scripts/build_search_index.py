"""Build the search artifacts from the committed synthetic profiles.

Run from app/backend:  .venv/bin/python scripts/build_search_index.py

Produces, in app/backend/artifacts/ (git ignored):
  embeddings.npy           sentence embeddings, one row per pool profile
  tfidf_matrix.npz         TF-IDF matrix, one row per pool profile
  tfidf_vectorizer.joblib  the vectoriser fitted on the pool, used to turn a visitor's text into the same space
  manifest.json            SHA 256 of every file, the source file, the model revision and library versions

Only synthetic profiles are read. No real profile, and no model trained on one, is involved.
"""

import hashlib
import json
import sys
from pathlib import Path

import joblib
import numpy as np
import scipy.sparse as sparse

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import sentence_transformers  # noqa: E402
import sklearn  # noqa: E402

from profile_api.config import Settings  # noqa: E402
from profile_api.ml import tfidf  # noqa: E402
from profile_api.ml.text_cleaning import clean_text  # noqa: E402
from profile_api.services.embedding import EmbeddingService  # noqa: E402


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    settings = Settings()
    profiles_path = settings.content_dir / "synthetic" / "profiles.json"
    document = json.loads(profiles_path.read_text())
    assert document["is_synthetic"] and all(p["is_synthetic"] for p in document["pool"]), "pool must be synthetic"

    texts = [clean_text(p["text"]) for p in document["pool"]]

    vectorizer = tfidf.make_tfidf().fit(texts)
    matrix = vectorizer.transform(texts)

    embedder = EmbeddingService(settings.embedding_model, backend="sentence-transformers")  # the notebook's call: the index vectors stay exactly as before
    embeddings = embedder.encode(texts).astype(np.float32)

    out = settings.artifact_dir
    out.mkdir(parents=True, exist_ok=True)
    np.save(out / "embeddings.npy", embeddings, allow_pickle=False)
    sparse.save_npz(out / "tfidf_matrix.npz", matrix)
    joblib.dump(vectorizer, out / "tfidf_vectorizer.joblib")

    manifest = {
        "schema": 1,
        "tier": 0,
        "source_is_synthetic": True,
        "pool_version": sha256(profiles_path)[:12],
        "pool_size": len(texts),
        "source": {"profiles.json": sha256(profiles_path)},
        "files": {
            name: {"sha256": sha256(out / name), "bytes": (out / name).stat().st_size}
            for name in ("embeddings.npy", "tfidf_matrix.npz", "tfidf_vectorizer.joblib")
        },
        "model": {
            "name": embedder.model_name,
            "revision": embedder.revision,
            "dimension": int(embeddings.shape[1]),
        },
        "tfidf": {
            **{k: list(v) if isinstance(v, tuple) else v for k, v in tfidf.SETTINGS.items()},
            "vocabulary_size": len(vectorizer.vocabulary_),
        },
        "versions": {
            "scikit-learn": sklearn.__version__,
            "sentence-transformers": sentence_transformers.__version__,
            "numpy": np.__version__,
        },
    }
    (out / "manifest.json").write_text(json.dumps(manifest, indent=1) + "\n")
    print(
        f"built {len(texts)} profiles: embeddings {embeddings.shape}, tfidf {matrix.shape}, pool version {manifest['pool_version']}"
    )


if __name__ == "__main__":
    main()
