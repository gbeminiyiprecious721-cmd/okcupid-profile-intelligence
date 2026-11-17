"""Sentence embeddings with the model the notebook used (Section 8.3): all-MiniLM-L6-v2, run on this computer.

The model is found in the local Hugging Face cache and nothing is downloaded or sent anywhere. Vectors are
normalised, exactly as in the notebook, so cosine similarity is a dot product.
"""

from pathlib import Path

import numpy as np

# The files the application needs from the model, and the exact version it was built and tested with. The download
# script and this service both use these, so a cache made by one is always accepted by the other.
MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"
MODEL_REVISION = "1110a243fdf4706b3f48f1d95db1a4f5529b4d41"
MODEL_FILE_PATTERNS = ["*.json", "*.txt", "*.safetensors", "1_Pooling/*"]


class EmbeddingService:
    def __init__(self, model_name: str):
        from huggingface_hub import snapshot_download
        from sentence_transformers import SentenceTransformer

        try:
            path = snapshot_download(
                model_name, revision=MODEL_REVISION, allow_patterns=MODEL_FILE_PATTERNS, local_files_only=True
            )
        except Exception as error:  # the cache is empty: say how to fix it, do not reach out to the network
            raise RuntimeError(
                f"The embedding model {model_name} is not in the local cache. "
                "Download it once with app/backend/scripts/download_model.py."
            ) from error
        self.model_name = model_name
        self.revision = Path(path).name
        self.model = SentenceTransformer(path)

    @property
    def dimension(self) -> int:
        return self.model.get_embedding_dimension()

    def encode(self, texts: list[str]) -> np.ndarray:
        """One normalised vector per text. The notebook's call, with the same settings."""
        return self.model.encode(texts, batch_size=64, normalize_embeddings=True, show_progress_bar=False)
