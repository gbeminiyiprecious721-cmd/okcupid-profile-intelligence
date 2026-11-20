"""TF-IDF settings from the notebook (Section 8.2, `make_tfidf`).

Identical except min_df. The notebook uses 10 documents on 48,553 users. The pool has 800 profiles, so the same
share of the corpus is about 3 documents. A parity test checks every other setting against the notebook source.
"""

from sklearn.feature_extraction.text import TfidfVectorizer

POOL_MIN_DOCS = 3

SETTINGS = dict(
    stop_words="english",
    ngram_range=(1, 2),
    min_df=POOL_MIN_DOCS,
    max_df=0.5,
    max_features=20000,
    sublinear_tf=True,
)


def make_tfidf() -> TfidfVectorizer:
    return TfidfVectorizer(**SETTINGS)
