"""The nine lifestyle fields and their allowed values.

One source for the generator, the API validation and the form: content/synthetic/spec/answer_model.json.
The nine fields are the ones used in the notebook's similarity evaluation (Section 11.3).
"""

import json

from profile_api.paths import SPEC_DIR

_model = json.loads((SPEC_DIR / "answer_model.json").read_text())

FIELDS: list[str] = list(_model["fields"])
OPTIONS: dict[str, list[str]] = {name: list(spec["options"]) for name, spec in _model["fields"].items()}
