"""Download the embedding model into the local cache once. After this the application runs without the network.

Run from app/backend:  .venv/bin/python scripts/download_model.py
Only the model files the application needs are fetched, at the exact version it was tested with. No text is sent
anywhere. Set HF_HOME to choose where the cache lives (a deployment image sets it to a folder inside the image).
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from huggingface_hub import snapshot_download  # noqa: E402

from profile_api.services.embedding import MODEL_FILE_PATTERNS, MODEL_NAME, MODEL_REVISION  # noqa: E402

path = snapshot_download(MODEL_NAME, revision=MODEL_REVISION, allow_patterns=MODEL_FILE_PATTERNS)
print(path)
