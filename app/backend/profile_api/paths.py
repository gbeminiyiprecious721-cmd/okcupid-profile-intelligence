"""Where things live, relative to this package."""

from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
APP_DIR = BACKEND_DIR.parent
REPO_DIR = APP_DIR.parent
CONTENT_DIR = APP_DIR / "content"
SPEC_DIR = CONTENT_DIR / "synthetic" / "spec"
NOTEBOOK = REPO_DIR / "okcupid_profile_intelligence.ipynb"
