"""One-off export of the notebook's validated drinking classifier, for the local educational page.

Run from app/backend:  .venv/bin/python scripts/export_classifier.py [--data ../../profiles.csv]

What it does: runs the notebook's own cleaning, target, split and feature code on the local profiles file, fits the
notebook's `best_pipeline` once on the training users (structured fields plus TF-IDF text, logistic regression with
C = 1.0 and balanced class weights), checks the result, and writes three files to artifacts/tier1/:
  classifier.joblib, classifier_meta.json, manifest.json (SHA 256 of the other two)

What it does not do: it does not predict, score or look at the test users, it tunes nothing, and it prints no profile
or essay. The files are derived from the real profiles (tier 1): they stay on this computer and are git ignored.
"""

import argparse
import datetime
import hashlib
import json
import sys
import time
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import scipy
import sklearn
from sklearn.model_selection import train_test_split

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from profile_api.ml.classifier_features import (  # noqa: E402
    ALL_FEATURES,
    CATEGORY_FEATURES,
    CLASS_ORDER,
    DRINKS_LEVELS,
    ESSAY_COLUMNS,
    NUMERIC_FEATURES,
    RANDOM_STATE,
    TARGET,
    TARGET_RAW,
    TEST_SIZE,
    add_essay_features,
    add_structured_features,
    build_pipeline,
    clean_profiles,
)
from profile_api.ml.text_cleaning import clean_text  # noqa: E402
from profile_api.paths import BACKEND_DIR, CONTENT_DIR, REPO_DIR  # noqa: E402
from profile_api.services.classifier import ClassifierService, sha256  # noqa: E402

OUT_DIR = BACKEND_DIR / "artifacts" / "tier1"


def check(condition: bool, message: str, results: list) -> None:
    results.append({"check": message, "passed": bool(condition)})
    print(f"  {'ok  ' if condition else 'FAIL'} {message}")
    if not condition:
        raise SystemExit(f"Check failed: {message}. Nothing was exported.")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", type=Path, default=REPO_DIR / "profiles.csv")
    parser.add_argument("--out", type=Path, default=OUT_DIR)
    args = parser.parse_args()
    started = time.time()

    # ---- the notebook's cleaning, target and split (sections 4.1 to 4.6). The test users are set aside, never used.
    df_raw = pd.read_csv(args.data)
    df_clean = clean_profiles(df_raw)
    df_clean[TARGET] = df_clean[TARGET_RAW].map(DRINKS_LEVELS)
    df_labelled = df_clean[df_clean[TARGET].notna()]
    df_train, _df_test_not_used = train_test_split(
        df_labelled, test_size=TEST_SIZE, stratify=df_labelled[TARGET], random_state=RANDOM_STATE
    )
    n_labelled, n_train = len(df_labelled), len(df_train)
    print(f"Labelled {n_labelled:,}, training users {n_train:,}")

    # ---- the notebook's training table (sections 7 and 8.1)
    X = add_essay_features(add_structured_features(df_train))[ALL_FEATURES].copy()
    X["clean_text"] = df_train[ESSAY_COLUMNS].fillna("").agg(" ".join, axis=1).map(clean_text)
    y = df_train[TARGET]

    # ---- the one fit
    fit_started = time.time()
    pipeline = build_pipeline().fit(X, y)
    fit_seconds = time.time() - fit_started
    print(f"Fitted in {fit_seconds:.0f} s\n\nChecks")

    results: list[dict] = []
    model = pipeline.named_steps["model"]
    inputs = pipeline.named_steps["inputs"]
    structured = inputs.named_transformers_["structured"]
    tfidf = inputs.named_transformers_["text"]

    # ---- structural checks, no test data involved
    check(n_train == 45568, "training set has 45,568 users, as in the notebook", results)
    check(list(model.classes_) == sorted(CLASS_ORDER), "four classes, in sklearn's sorted order", results)
    check(
        model.C == 1.0 and model.class_weight == "balanced" and model.max_iter == 3000,
        "C 1.0, balanced, 3000 iterations",
        results,
    )
    check(
        int(model.n_iter_.max()) < model.max_iter,
        f"the solver converged ({int(model.n_iter_.max())} iterations)",
        results,
    )
    n_structured = structured.get_feature_names_out().shape[0]
    check(n_structured == 124, "19 inputs became 124 structured columns, as in the notebook", results)
    check(len(tfidf.get_feature_names_out()) == 20000, "TF-IDF vocabulary has 20,000 words and word pairs", results)
    check(model.coef_.shape == (4, 124 + 20000), "coefficients are 4 classes by 20,124 columns", results)
    medians = structured.named_transformers_["numbers"].named_steps["fill_blanks"].statistics_
    check(np.allclose(medians, X[NUMERIC_FEATURES].median()), "learned medians are the training medians", results)
    probe = X.head(1).copy()
    probe["job"] = "astronaut"
    check(pipeline.predict_proba(probe).shape == (1, 4), "an unseen answer does not break the pipeline", results)
    refit_check = pipeline.predict_proba(X.head(5))
    check(
        np.allclose(refit_check.sum(axis=1), 1.0, atol=1e-9) and (refit_check >= 0).all(),
        "training rows give valid probabilities",
        results,
    )

    base = (y.value_counts(normalize=True) * 100).round(1).to_dict()
    check(
        base == {"socially": 73.3, "often+": 10.5, "rarely": 10.5, "not at all": 5.7},
        "training class shares match the notebook",
        results,
    )

    # ---- fixed fictional examples
    document = json.loads((CONTENT_DIR / "synthetic" / "profiles.json").read_text())
    personas = json.loads((CONTENT_DIR / "classifier" / "fictional_inputs.json").read_text())["personas"]
    meta = {
        "base_rates": {level: float(share) for level, share in base.items()},
        "class_order": CLASS_ORDER,
    }
    service = ClassifierService(pipeline, meta, document["starters"], personas)
    check(len(service.starters) == 6, "six fictional examples are available", results)

    known_levels = {}
    cat = structured.named_transformers_["categories"].named_steps["one_hot"]
    for field, categories, infrequent in zip(
        CATEGORY_FEATURES, cat.categories_, cat.infrequent_categories_, strict=True
    ):
        known_levels[field] = set(categories) - set(infrequent if infrequent is not None else [])
    from profile_api.services.classifier import example_row

    for sid, starter in service.starters.items():
        row = example_row(starter, personas[sid])
        unmatched = [f for f in CATEGORY_FEATURES if pd.notna(row.at[0, f]) and row.at[0, f] not in known_levels[f]]
        for f in unmatched:  # level names are aggregate labels, never profile text
            print(f"       {f}: {row.at[0, f]!r} is not one of {sorted(known_levels[f])}")
        check(
            not unmatched,
            f"{sid}: every answer is a level the model learned ({', '.join(unmatched) or 'all'})",
            results,
        )
        outcome = service.predict(sid)
        total = sum(c["probability"] for c in outcome["classes"])
        check(
            abs(total - 1) < 1e-3 and all(0 <= c["probability"] <= 1 for c in outcome["classes"]),
            f"{sid}: probabilities are valid and sum to 1 ({total:.4f})",
            results,
        )
        raw = pipeline.predict_proba(row)[0]
        check(
            np.isclose(raw.sum(), 1.0, atol=1e-12)
            and pipeline.classes_[raw.argmax()] == pipeline.predict(row)[0] == outcome["predicted"],
            f"{sid}: the predicted class is the most probable one",
            results,
        )
        check(
            np.array_equal(raw, pipeline.predict_proba(row)[0]), f"{sid}: the same input gives the same answer", results
        )

    # ---- write the files
    args.out.mkdir(parents=True, exist_ok=True)
    joblib.dump(pipeline, args.out / "classifier.joblib")
    full_meta = {
        "description": "Drinking classifier from okcupid_profile_intelligence.ipynb section 10 and 12: structured fields plus TF-IDF text, logistic regression.",
        "class_order": CLASS_ORDER,
        "sklearn_classes": [str(c) for c in model.classes_],
        "input_fields": ALL_FEATURES,
        "n_training_users": n_train,
        "n_structured_columns": int(n_structured),
        "n_tfidf_terms": 20000,
        "hyperparameters": {
            "C": model.C,
            "class_weight": model.class_weight,
            "max_iter": model.max_iter,
            "solver": model.solver,
            "iterations": int(model.n_iter_.max()),
        },
        "base_rates": meta["base_rates"],
        "base_rates_note": "Share of each drinking level among the training users, in percent.",
        "fit_seconds": round(fit_seconds, 1),
        "checks": results,
        "test_set": "The test users were set aside by the split and never used in this export. No score was computed.",
    }
    (args.out / "classifier_meta.json").write_text(json.dumps(full_meta, indent=2) + "\n")
    manifest = {
        "tier": 1,
        "kind": "drinking_classifier",
        "derived_from_real_data": True,
        "created": datetime.datetime.now(datetime.UTC).isoformat(timespec="seconds"),
        "source_data_sha256": sha256(args.data),
        "notebook_sha256": sha256(REPO_DIR / "okcupid_profile_intelligence.ipynb"),
        "files": {
            name: {"sha256": sha256(args.out / name), "bytes": (args.out / name).stat().st_size}
            for name in ("classifier.joblib", "classifier_meta.json")
        },
        "versions": {
            "scikit-learn": sklearn.__version__,
            "numpy": np.__version__,
            "scipy": scipy.__version__,
            "pandas": pd.__version__,
            "joblib": joblib.__version__,
        },
    }
    (args.out / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"\nWrote {args.out} in {time.time() - started:.0f} s")
    print(hashlib.sha256((args.out / "manifest.json").read_bytes()).hexdigest()[:16], "manifest")


if __name__ == "__main__":
    main()
