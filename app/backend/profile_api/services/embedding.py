"""Sentence embeddings with the model the notebook used (Section 8.3): all-MiniLM-L6-v2, run on this computer.

The model is found in the local Hugging Face cache and nothing is downloaded or sent anywhere. Vectors are
normalised, exactly as in the notebook, so cosine similarity is a dot product.

Two ways to run the same model, with the same numbers:

* ``"lean"`` (the default, used when serving). The tokenizer and the model come from ``transformers``, and the pooling
  and normalisation are written out here: mean of the token vectors under the attention mask, then L2 normalisation
  (the model's own Normalize step), then the normalisation ``encode(normalize_embeddings=True)`` applies again. One
  text is encoded at a time, as the search does. This does not import the ``sentence_transformers`` package, which
  adds about 100 MB of memory that serving never uses. A test compares it with the package, bit for bit.
* ``"sentence-transformers"``. The package's own ``encode``, the notebook's call. The index is built with this one,
  so the stored document vectors are exactly what they were.
"""

from pathlib import Path

import numpy as np

# The files the application needs from the model, and the exact version it was built and tested with. The download
# script and this service both use these, so a cache made by one is always accepted by the other.
MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"
MODEL_REVISION = "1110a243fdf4706b3f48f1d95db1a4f5529b4d41"
MODEL_FILE_PATTERNS = ["*.json", "*.txt", "*.safetensors", "1_Pooling/*"]
MAX_SEQUENCE_LENGTH = 256  # sentence_bert_config.json of the model


class EmbeddingService:
    def __init__(self, model_name: str, *, backend: str = "lean", torch_threads: int | None = None):
        from huggingface_hub import snapshot_download

        if backend not in ("lean", "sentence-transformers"):
            raise ValueError(f"Unknown embedding backend {backend!r}.")
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
        self.backend = backend
        if torch_threads is not None:
            import torch

            torch.set_num_threads(torch_threads)  # the same numbers at any thread count, only the speed differs
        if backend == "sentence-transformers":
            from sentence_transformers import SentenceTransformer

            self.model = SentenceTransformer(path)
        else:
            from transformers import AutoModel, AutoTokenizer

            self.tokenizer = AutoTokenizer.from_pretrained(path)
            self.model = AutoModel.from_pretrained(path).eval()

    @property
    def dimension(self) -> int:
        if self.backend == "sentence-transformers":
            return self.model.get_embedding_dimension()
        return int(self.model.config.hidden_size)

    def encode(self, texts: list[str]) -> np.ndarray:
        """One normalised vector per text. The notebook's call, with the same settings."""
        if self.backend == "sentence-transformers":
            return self.model.encode(texts, batch_size=64, normalize_embeddings=True, show_progress_bar=False)
        return np.vstack([self._encode_one(text) for text in texts])

    def _encode_one(self, text: str) -> np.ndarray:
        import torch

        with torch.inference_mode():
            features = self.tokenizer(
                [text], padding=True, truncation=True, max_length=MAX_SEQUENCE_LENGTH, return_tensors="pt"
            )
            tokens = self.model(**features).last_hidden_state
            mask = features["attention_mask"].unsqueeze(-1).expand(tokens.size()).to(tokens.dtype)
            pooled = (tokens * mask).sum(1) / torch.clamp(mask.sum(1), min=1e-9)
            normalised = torch.nn.functional.normalize(pooled, p=2, dim=1)  # the model's Normalize step
            normalised = torch.nn.functional.normalize(normalised, p=2, dim=1)  # encode(normalize_embeddings=True)
        return normalised.numpy()
