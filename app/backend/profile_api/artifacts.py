"""Load the search artifacts once, at startup, after checking every file against the manifest.

Nothing here retrains anything. The files are produced by scripts/build_search_index.py from the committed synthetic
profiles. Public mode only accepts tier 0 artifacts, which means files built from the synthetic pool alone.
"""

import hashlib
import json
import logging
from pathlib import Path

import joblib
import numpy as np
import scipy.sparse as sparse

from profile_api.config import AppMode, Settings
from profile_api.services.discovery import DiscoveryService
from profile_api.services.embedding import EmbeddingService

log = logging.getLogger("profile_api")

FILES = ("embeddings.npy", "tfidf_matrix.npz", "tfidf_vectorizer.joblib")


class ArtifactError(RuntimeError):
    pass


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def load_discovery(settings: Settings) -> DiscoveryService | None:
    """The discovery service, or None when no artifacts have been built. A mismatch is an error, never ignored."""
    manifest_path = settings.artifact_dir / "manifest.json"
    if not manifest_path.exists():
        log.info("No search artifacts found. Discovery is off. Build them with scripts/build_search_index.py.")
        return None
    manifest = json.loads(manifest_path.read_text())

    if manifest.get("tier") != 0:
        raise ArtifactError(
            "Only tier 0 artifacts (built from the synthetic pool) may be loaded by the discovery service."
        )
    if settings.app_mode is AppMode.PUBLIC and manifest.get("source_is_synthetic") is not True:
        raise ArtifactError("Public mode needs artifacts built from the synthetic pool.")

    profiles_path = settings.content_dir / "synthetic" / "profiles.json"
    if sha256(profiles_path) != manifest["source"]["profiles.json"]:
        raise ArtifactError("The synthetic profiles changed since the artifacts were built. Rebuild them.")
    for name in FILES:
        if sha256(settings.artifact_dir / name) != manifest["files"][name]["sha256"]:
            raise ArtifactError(f"{name} does not match the manifest. Rebuild the artifacts.")

    import sentence_transformers
    import sklearn

    built, running = (
        manifest["versions"],
        {
            "scikit-learn": sklearn.__version__,
            "sentence-transformers": sentence_transformers.__version__,
        },
    )
    for package, version in running.items():
        if built.get(package) != version:
            raise ArtifactError(
                f"Artifacts were built with {package} {built.get(package)}, this is {version}. Rebuild them."
            )

    document = json.loads(profiles_path.read_text())
    if not document.get("is_synthetic") or not all(
        p.get("is_synthetic") is True for p in document["pool"] + document["starters"]
    ):
        raise ArtifactError("Every profile in the pool must be flagged synthetic.")

    embedder = EmbeddingService(manifest["model"]["name"])
    if embedder.revision != manifest["model"]["revision"]:
        raise ArtifactError(
            "The embedding model revision differs from the one used to build the artifacts. Rebuild them."
        )

    embeddings = np.load(settings.artifact_dir / "embeddings.npy", allow_pickle=False)
    matrix = sparse.load_npz(settings.artifact_dir / "tfidf_matrix.npz")
    vectorizer = joblib.load(settings.artifact_dir / "tfidf_vectorizer.joblib")  # own file, hash checked above
    theme_bank = json.loads((settings.content_dir / "synthetic" / "spec" / "theme_bank.json").read_text())["themes"]

    service = DiscoveryService(
        document=document,
        embeddings=embeddings,
        tfidf_matrix=matrix,
        vectorizer=vectorizer,
        embedder=embedder,
        theme_bank=theme_bank,
        pool_version=manifest["pool_version"],
        max_concurrent=settings.max_concurrent_searches,
    )
    service.warm_up()
    return service
