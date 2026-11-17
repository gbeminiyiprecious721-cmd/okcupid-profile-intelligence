"""Find the most similar synthetic profiles for a fictional profile description."""

import threading

from profile_api.answers import FIELDS
from profile_api.errors import ApiError
from profile_api.ml.text_cleaning import prepare_text
from profile_api.security import limits
from profile_api.services import explain
from profile_api.services.search import NeighbourIndex

NOTICE = "These are fictional profiles. Similar writing is not compatibility."
SCORE_NAMES = {
    "embeddings": "Cosine similarity of sentence embeddings",
    "tfidf": "Cosine similarity of TF-IDF vectors",
}
SCALE_NOTE = "The two scores are on different scales. Compare ranks within one method, not numbers across methods."


class DiscoveryService:
    def __init__(
        self,
        document,
        embeddings,
        tfidf_matrix,
        vectorizer,
        embedder,
        theme_bank,
        pool_version,
        max_concurrent,
    ):
        self.pool: list[dict] = document["pool"]
        self.by_id = {p["id"]: p for p in document["pool"] + document["starters"]}
        self.starters = document["starters"]
        self.embedder, self.vectorizer = embedder, vectorizer
        self.pool_version = pool_version
        self.tfidf_matrix = tfidf_matrix.tocsr()
        self.terms = vectorizer.get_feature_names_out()
        # Fitted here from the artifacts, once. Requests only query them.
        self.embedding_index = NeighbourIndex(embeddings)
        self.tfidf_index = NeighbourIndex(self.tfidf_matrix)
        self.theme_labels = {key: theme["label"] for key, theme in theme_bank.items()}
        self.theme_keywords = {key: set(theme["keywords"]) for key, theme in theme_bank.items()}
        self.shares = self._answer_shares()
        self._gate = threading.BoundedSemaphore(max_concurrent)  # bounds how many searches run at once

    def _answer_shares(self) -> dict[str, dict[str, float]]:
        shares = {}
        for field in FIELDS:
            answered = [p["answers"][field] for p in self.pool if p["answers"].get(field) is not None]
            shares[field] = {value: answered.count(value) / len(answered) for value in set(answered)}
        return shares

    def warm_up(self) -> None:
        self.embedder.encode(["warm up the model before the first request"])

    # ------------------------------------------------------------------ lookups
    def detail(self, profile_id: str) -> dict:
        profile = self.by_id.get(profile_id)
        if profile is None:
            raise ApiError(404, "not_found", "There is no profile with this identifier.")
        return self._detail(profile)

    def examples(self) -> list[dict]:
        return [self._detail(p) for p in self.starters]

    def _detail(self, profile: dict) -> dict:
        return {
            "profile_id": profile["id"],
            "display_handle": profile["handle"],
            "text": profile["text"],
            "themes": [self.theme_labels[t] for t in profile["themes"]],
            "lifestyle": profile["answers"],
            "is_synthetic": True,
        }

    # ------------------------------------------------------------------ search
    def similar(self, text: str, answers: dict, method: str, k: int) -> dict:
        cleaned, removed = prepare_text(text)
        n_words = len(cleaned.split())
        if n_words == 0:
            raise ApiError(
                422,
                "no_usable_text",
                "There are no words left to compare. Links and contact details are removed before searching.",
            )
        if n_words < limits.MIN_WORDS:
            raise ApiError(
                422,
                "text_too_short",
                f"Write at least {limits.MIN_WORDS} words so there is something to compare.",
            )

        query_tfidf = self.vectorizer.transform([cleaned])
        query_themes = explain.detect_themes(cleaned, self.theme_keywords)
        results = []
        with self._gate:
            if method in ("embeddings", "both"):
                positions, scores = self.embedding_index.nearest(self.embedder.encode([cleaned]), k)
                results.append(self._result("embeddings", positions, scores, answers, query_tfidf, query_themes))
            if method in ("tfidf", "both"):
                if query_tfidf.nnz == 0:
                    results.append(
                        {
                            "method": "tfidf",
                            "score_name": SCORE_NAMES["tfidf"],
                            "neighbours": [],
                            "note": (
                                "None of your words appear in the vocabulary of the pool, "
                                "so there is nothing to compare by word. "
                                "Try the embedding method, which compares meaning."
                            ),
                        }
                    )
                else:
                    positions, scores = self.tfidf_index.nearest(query_tfidf, k)
                    results.append(self._result("tfidf", positions, scores, answers, query_tfidf, query_themes))

        comparison = None
        if method == "both":
            ids = {r["method"]: [n["profile_id"] for n in r["neighbours"]] for r in results}
            both = [i for i in ids["embeddings"] if i in ids["tfidf"]]
            comparison = {
                "overlap_count": len(both),
                "in_both": both,
                "only_embeddings": [i for i in ids["embeddings"] if i not in ids["tfidf"]],
                "only_tfidf": [i for i in ids["tfidf"] if i not in ids["embeddings"]],
                "note": SCALE_NOTE,
            }
        return {
            "pool": {"size": len(self.pool), "version": self.pool_version, "synthetic": True},
            "input": {
                "characters_received": len(text),
                "words_used": n_words,
                "personal_details_removed": removed,
                "themes_detected": [self.theme_labels[t] for t in query_themes],
            },
            "results": results,
            "comparison": comparison,
            "notice": NOTICE,
        }

    def _result(self, method, positions, scores, answers, query_tfidf, query_themes) -> dict:
        neighbours = []
        for rank, (position, score) in enumerate(zip(positions, scores, strict=True), start=1):
            profile = self.pool[int(position)]
            terms = (
                explain.shared_terms(query_tfidf, self.tfidf_matrix[int(position)], self.terms)
                if query_tfidf.nnz
                else []
            )
            neighbours.append(
                {
                    "rank": rank,
                    "profile_id": profile["id"],
                    "display_handle": profile["handle"],
                    "score": round(float(score), 4),
                    "lifestyle": profile["answers"],
                    "shared_answers": explain.shared_answers(answers, profile["answers"], self.shares),
                    "shared_terms": terms,
                    "themes": [self.theme_labels[t] for t in profile["themes"]],
                    "shared_themes": [self.theme_labels[t] for t in profile["themes"] if t in query_themes],
                }
            )
        return {
            "method": method,
            "score_name": SCORE_NAMES[method],
            "neighbours": neighbours,
            "note": None,
        }
