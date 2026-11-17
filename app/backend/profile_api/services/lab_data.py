"""Load the approved aggregate findings once at startup. Public mode serves only this file.

The file is produced by scripts/export_lab_data.py from the notebook's saved outputs. At startup its hash is checked
against lab_summary.sha256 and its shape against schemas.lab, which allows aggregate numbers and labels only.
"""

import hashlib
import json
import logging

from profile_api.artifacts import ArtifactError
from profile_api.paths import CONTENT_DIR
from profile_api.schemas.lab import LabSummary

log = logging.getLogger("profile_api")

LAB_DIR = CONTENT_DIR / "lab"
FIGURES = {"clusters_vs_k": "clusters_vs_k.png", "confusion_matrix": "confusion_matrix.png"}


class LabData:
    def __init__(self, summary: LabSummary):
        self.summary = summary

    def figure_path(self, name: str):
        filename = FIGURES.get(name)
        return LAB_DIR / "figures" / filename if filename else None


def load_lab(directory=LAB_DIR) -> LabData | None:
    """The lab data, or None when the file has not been exported. A hash or shape mismatch is an error."""
    path = directory / "lab_summary.json"
    if not path.exists():
        log.warning("lab_summary.json not found: lab pages are off")
        return None
    raw = path.read_bytes()
    expected = (
        (directory / "lab_summary.sha256").read_text().strip() if (directory / "lab_summary.sha256").exists() else ""
    )
    if hashlib.sha256(raw).hexdigest() != expected:
        raise ArtifactError("lab_summary.json does not match its recorded hash. Run scripts/export_lab_data.py.")
    summary = LabSummary.model_validate(json.loads(raw))
    for filename, info in summary.provenance.figures.items():
        figure = directory / "figures" / filename
        if not figure.exists() or hashlib.sha256(figure.read_bytes()).hexdigest() != info["sha256"]:
            raise ArtifactError(f"Figure {filename} does not match its recorded hash.")
    return LabData(summary)
