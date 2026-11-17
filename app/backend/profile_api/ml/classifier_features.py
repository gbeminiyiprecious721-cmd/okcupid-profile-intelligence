"""The feature code of the validated drinking classifier, copied from okcupid_profile_intelligence.ipynb.

Nothing here is new. Each function and constant is the notebook's own (sections 3, 4, 7 and 10), and
tests/test_classifier_parity.py compares them with the notebook's source so they cannot drift apart.
`clean_text` is the one in text_cleaning.py, which is already checked the same way.
"""

import html

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

# ---- section 3.2 parameters
RANDOM_STATE = 42
TARGET_RAW = "drinks"
TARGET = "drinks_level"
TEST_SIZE = 0.2
ESSAY_COLUMNS = [f"essay{i}" for i in range(10)]
TFIDF_MIN_DOCS = 10
TFIDF_MAX_FEATURES = 20000
LOGISTIC_MAX_ITER = 3000
CLASS_ORDER = ["not at all", "rarely", "socially", "often+"]

DRINKS_LEVELS = {
    "not at all": "not at all",
    "rarely": "rarely",
    "socially": "socially",
    "often": "often+",
    "very often": "often+",
    "desperately": "often+",
}

# ---- section 4.1 and 4.2
HIDDEN_CODES = [
    ("income", -1),
    ("status", "unknown"),
    ("body_type", "rather not say"),
    ("job", "rather not say"),
]
VALID_RANGES = {"age": (18, 100), "height": (48, 84)}
HTML_COLUMNS = ["offspring", "sign"]


def clean_profiles(df):
    """Apply fixed cleaning rules that learn nothing from the data."""
    out = df.copy()
    for column, value in HIDDEN_CODES:
        out[column] = out[column].mask(out[column] == value)
    for column, (low, high) in VALID_RANGES.items():
        out[column] = out[column].where(out[column].between(low, high))
    for column in HTML_COLUMNS:
        out[column] = out[column].map(html.unescape, na_action="ignore")
    return out


# ---- section 7
def group_by_keyword(series, rules):
    """Label each value with the first rule whose keyword it contains. Blank values stay blank."""
    labels = pd.Series(np.nan, index=series.index, dtype="object")
    for keyword, label in rules:
        matches = series.str.contains(keyword, regex=False, na=False) & labels.isna()
        labels[matches] = label
    return labels


# Each rule is (keyword to look for, label to give). The first matching rule wins.
DIET_RULES = [
    ("vegetarian", "vegetarian"),
    ("vegan", "vegan"),
    ("kosher", "kosher"),
    ("halal", "halal"),
    ("anything", "anything"),
    ("other", "other"),
]
EDUCATION_LEVEL_RULES = [
    ("high school", "high school"),
    ("year college", "two year college"),
    ("college/university", "college"),
    ("masters", "masters"),
    ("ph.d", "phd"),
    ("law school", "law school"),
    ("med school", "med school"),
    ("space camp", "space camp"),
]
EDUCATION_STATUS_RULES = [("graduated", "graduated"), ("working on", "working on"), ("dropped out", "dropped out")]


def add_structured_features(df):
    """Add the new fields described above. Fixed rules only, nothing is learned from the data."""
    out = df.copy()
    out["diet_type"] = group_by_keyword(out["diet"], DIET_RULES)
    out["education_level"] = group_by_keyword(out["education"], EDUCATION_LEVEL_RULES)
    out["education_status"] = group_by_keyword(out["education"], EDUCATION_STATUS_RULES)
    # An answer with no status word, such as "college/university", gets the status "unspecified"
    out.loc[out["education"].notna() & out["education_status"].isna(), "education_status"] = "unspecified"
    out["languages_count"] = out["speaks"].str.count(",") + 1
    out["income_answered"] = out["income"].notna().astype(int)
    return out


def add_essay_features(df):
    """Add simple measures of how much a user wrote. Fixed rules only."""
    out = df.copy()
    essays = out[ESSAY_COLUMNS]
    word_count = essays.fillna("").agg(" ".join, axis=1).str.split().str.len()
    out["essays_answered"] = essays.notna().sum(axis=1)
    out["essay_log_words"] = np.log1p(word_count)
    out["wrote_no_essay"] = (out["essays_answered"] == 0).astype(int)
    return out


# Which fields become inputs. Every other field is left out, as explained in the notebook.
NUMERIC_FEATURES = ["age", "height", "languages_count", "essays_answered", "essay_log_words"]
FLAG_FEATURES = ["income_answered", "wrote_no_essay"]
CATEGORY_FEATURES = [
    "sex",
    "status",
    "smokes",
    "drugs",
    "body_type",
    "diet_type",
    "education_level",
    "education_status",
    "job",
    "offspring",
    "pets",
    "location",
]
ALL_FEATURES = NUMERIC_FEATURES + FLAG_FEATURES + CATEGORY_FEATURES

# Answers used by fewer than this share of training users are grouped into one "infrequent" level
MIN_LEVEL_SHARE = 0.005


def build_pipeline() -> Pipeline:
    """The unfitted pipeline: the notebook's `best_pipeline` (structured fields plus TF-IDF text, C = 1.0)."""
    numeric_steps = Pipeline(
        [
            ("fill_blanks", SimpleImputer(strategy="median")),
            ("scale", StandardScaler()),
        ]
    )
    category_steps = Pipeline(
        [
            ("fill_blanks", SimpleImputer(strategy="constant", fill_value="missing")),
            (
                "one_hot",
                OneHotEncoder(handle_unknown="infrequent_if_exist", min_frequency=MIN_LEVEL_SHARE, sparse_output=False),
            ),
        ]
    )
    preprocessor = ColumnTransformer(
        [
            ("numbers", numeric_steps, NUMERIC_FEATURES),
            ("categories", category_steps, CATEGORY_FEATURES),
            ("flags", "passthrough", FLAG_FEATURES),
        ]
    )
    tfidf = TfidfVectorizer(
        stop_words="english",
        ngram_range=(1, 2),
        min_df=TFIDF_MIN_DOCS,
        max_df=0.5,
        max_features=TFIDF_MAX_FEATURES,
        sublinear_tf=True,
    )
    inputs = ColumnTransformer([("structured", preprocessor, ALL_FEATURES), ("text", tfidf, "clean_text")])
    model = LogisticRegression(C=1.0, class_weight="balanced", max_iter=LOGISTIC_MAX_ITER)
    return Pipeline([("inputs", inputs), ("model", model)])
