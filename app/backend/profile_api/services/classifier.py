"""The educational drinking classifier: the notebook's validated pipeline, loaded from a verified local file.

Only fixed fictional examples can be classified. A request names an example, it never carries text or answers,
so no visitor input exists to collect, log or store. The artefact is derived from the real profiles (tier 1)
and is loaded in local mode only.
"""

import hashlib
import json
import logging
import math
from pathlib import Path

import numpy as np
import pandas as pd

from profile_api.errors import ApiError
from profile_api.ml.classifier_features import ALL_FEATURES, CLASS_ORDER
from profile_api.ml.text_cleaning import clean_text

log = logging.getLogger("profile_api")

LIFESTYLE_FIELDS = [
    "smokes",
    "drugs",
    "diet_type",
    "education_level",
    "job",
    "offspring",
    "pets",
    "status",
    "body_type",
]


# The fictional answers use friendlier wording for pets than the data does. This maps them to the data's levels.
PETS_TO_DATA = {
    "likes dogs and cats": "likes dogs and likes cats",
    "likes dogs": "likes dogs",
    "likes cats": "likes cats",
    "has a dog": "has dogs",
    "has a cat": "has cats",
    "has both": "has dogs and has cats",
}


class ClassifierError(RuntimeError):
    """The classifier files are missing, changed or do not match this environment. The application will not start."""


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def example_row(starter: dict, persona: dict) -> pd.DataFrame:
    """One input row for the model: the starter's own answers and text, plus the fixed fictional persona fields.

    The same cleaning and essay measures as the notebook are applied: `clean_text` for the text, and the word count
    of the raw text for `essay_log_words`. The starter counts as one answered essay.
    """
    answers = starter["answers"]
    text = starter["text"]
    row = {
        "age": float(persona["age"]),
        "height": float(persona["height"]),
        "languages_count": float(persona["languages_count"]),
        "essays_answered": 1.0,
        "essay_log_words": math.log1p(len(text.split())),
        "income_answered": persona["income_answered"],
        "wrote_no_essay": 0,
        "sex": persona["sex"],
        "education_status": persona["education_status"],
        "location": persona["location"],
        "clean_text": clean_text(text),
    }
    for field in LIFESTYLE_FIELDS:
        value = answers.get(field)
        if field == "offspring" and value:
            # The data holds a typographic apostrophe in these answers, written as &rsquo; and decoded by the notebook
            value = value.replace("'", "’")
        if field == "pets" and value:
            value = PETS_TO_DATA.get(value)
        row[field] = value
    frame = pd.DataFrame([row])
    return frame[[*ALL_FEATURES, "clean_text"]]


class ClassifierService:
    def __init__(self, pipeline, meta: dict, starters: list[dict], personas: dict):
        self.pipeline = pipeline
        self.meta = meta
        self.starters = {s["id"]: s for s in starters if s["id"] in personas}
        self.personas = personas
        classes = list(pipeline.classes_)
        self.order = [classes.index(level) for level in CLASS_ORDER]  # columns of predict_proba, in display order
        self.base_rates = meta["base_rates"]

    def examples(self) -> list[dict]:
        return [
            {
                "example_id": sid,
                "display_handle": s["handle"],
                "text": s["text"],
                "lifestyle": s["answers"],
                "persona": self.personas[sid],
            }
            for sid, s in self.starters.items()
        ]

    def predict(self, example_id: str) -> dict:
        starter = self.starters.get(example_id)
        if starter is None:
            raise ApiError(404, "not_found", "There is no fictional example with this identifier.")
        frame = example_row(starter, self.personas[example_id])
        probabilities = self.pipeline.predict_proba(frame)[0][self.order]
        probabilities = probabilities / probabilities.sum()  # already sums to 1, this removes rounding error only
        best = int(np.argmax(probabilities))
        ranked = np.sort(probabilities)[::-1]
        shown = np.round(probabilities, 4)
        shown[best] += round(
            1.0 - float(shown.sum()), 4
        )  # rounding can leave 0.0001 over or under, so the shown values add to 1
        return {
            "example_id": example_id,
            "display_handle": starter["handle"],
            "classes": [
                {
                    "level": level,
                    "probability": float(p),
                    "base_rate": self.base_rates[level],
                    "is_predicted": i == best,
                }
                for i, (level, p) in enumerate(zip(CLASS_ORDER, shown, strict=True))
            ],
            "predicted": CLASS_ORDER[best],
            "top_probability": round(float(ranked[0]), 4),
            "margin": round(float(ranked[0] - ranked[1]), 4),
        }


def load_classifier(directory: Path, content_dir: Path) -> ClassifierService | None:
    """The service, or None when no classifier has been exported. A changed or mismatched file is an error."""
    import joblib
    import sklearn

    manifest_path = directory / "manifest.json"
    if not manifest_path.exists():
        log.info("No classifier artefacts found: the classification demonstration is off.")
        return None
    manifest = json.loads(manifest_path.read_text())
    if manifest.get("tier") != 1 or manifest.get("kind") != "drinking_classifier":
        raise ClassifierError("This folder does not hold the tier 1 drinking classifier.")
    for name, info in manifest["files"].items():
        path = directory / name
        if not path.exists() or sha256(path) != info["sha256"]:
            raise ClassifierError(f"{name} does not match the manifest. Export it again.")
    if manifest["versions"].get("scikit-learn") != sklearn.__version__:
        raise ClassifierError("The classifier was built with a different scikit-learn. Export it again.")
    meta = json.loads((directory / "classifier_meta.json").read_text())
    pipeline = joblib.load(directory / "classifier.joblib")  # our own file, hash checked above
    document = json.loads((content_dir / "synthetic" / "profiles.json").read_text())
    inputs = json.loads((content_dir / "classifier" / "fictional_inputs.json").read_text())
    return ClassifierService(pipeline, meta, document["starters"], inputs["personas"])
