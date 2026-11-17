import json
import os
import subprocess
import sys
import time

import pytest
from fastapi.testclient import TestClient

from profile_api.config import Settings
from profile_api.main import create_app
from profile_api.paths import BACKEND_DIR, NOTEBOOK

# The shared test application sends hundreds of requests from one address. Tests of the limiter turn it on themselves.
os.environ.setdefault("PROFILE_RATE_LIMIT_ENABLED", "false")
os.environ.setdefault("PROFILE_REQUEST_LOG", "false")  # tests of the request log turn it on themselves

SAMPLE = "I love long hikes with my dog, camping under the stars and cooking a big pot of soup afterwards."


def notebook_cells() -> list[str]:
    return [
        "".join(cell["source"]) for cell in json.loads(NOTEBOOK.read_text())["cells"] if cell["cell_type"] == "code"
    ]


@pytest.fixture(scope="session")
def built_artifacts():
    """The search artifacts. Built from the committed synthetic profiles if they are not there yet."""
    if not (BACKEND_DIR / "artifacts" / "manifest.json").exists():
        subprocess.run([sys.executable, str(BACKEND_DIR / "scripts" / "build_search_index.py")], check=True)
    return BACKEND_DIR / "artifacts"


@pytest.fixture(scope="session")
def startup_seconds():
    return {}


@pytest.fixture(scope="session")
def client(built_artifacts, startup_seconds):
    """One running application for the whole session, so the model is loaded once, as in production."""
    app = create_app(Settings(_env_file=None))
    started = time.perf_counter()
    with TestClient(app) as running:
        startup_seconds["value"] = time.perf_counter() - started
        yield running


@pytest.fixture(scope="session")
def service(client):
    return client.app.state.discovery


def similar(client, text=SAMPLE, **extra):
    return client.post("/api/v1/discover/similar", json={"text": text, **extra})
