"""Ranking correctness. The expected values are computed independently of the service code."""

import json

import numpy as np
import pytest
import scipy.sparse as sparse
from conftest import SAMPLE, similar
from paraphrases import PARAPHRASES
from sklearn.neighbors import NearestNeighbors

from profile_api.ml.text_cleaning import clean_text
from profile_api.paths import BACKEND_DIR, CONTENT_DIR

POOL = json.loads((CONTENT_DIR / "synthetic" / "profiles.json").read_text())["pool"]
BY_ID = {p["id"]: p for p in POOL}


def result(response, method):
    return next(r for r in response.json()["results"] if r["method"] == method)


def test_embedding_ranking_matches_an_independent_cosine_computation(client, service):
    query = service.embedder.encode([clean_text(SAMPLE)])[0]
    matrix = np.load(BACKEND_DIR / "artifacts" / "embeddings.npy")
    expected = np.argsort(-(matrix @ query), kind="stable")[:10]
    got = [n["profile_id"] for n in result(similar(client, k=10), "embeddings")["neighbours"]]
    assert got == [POOL[i]["id"] for i in expected]


def test_tfidf_ranking_matches_an_independent_cosine_computation(client, service):
    matrix = sparse.load_npz(BACKEND_DIR / "artifacts" / "tfidf_matrix.npz").toarray()
    query = service.vectorizer.transform([clean_text(SAMPLE)]).toarray()[0]
    norms = np.linalg.norm(matrix, axis=1) * np.linalg.norm(query)
    scores = matrix @ query / norms
    expected = np.argsort(-scores, kind="stable")[:10]
    got = result(similar(client, k=10), "tfidf")["neighbours"]
    assert [n["profile_id"] for n in got] == [POOL[i]["id"] for i in expected]
    assert [n["score"] for n in got] == pytest.approx([round(float(scores[i]), 4) for i in expected], abs=1e-4)


def test_same_neighbours_as_scikit_learn_nearest_neighbors_directly(service):
    query = service.embedder.encode([clean_text(SAMPLE)])
    reference = NearestNeighbors(metric="cosine", algorithm="brute").fit(
        np.load(BACKEND_DIR / "artifacts" / "embeddings.npy")
    )
    distances, positions = reference.kneighbors(query, n_neighbors=5)
    ours_positions, ours_scores = service.embedding_index.nearest(query, 5)
    assert list(ours_positions) == list(positions[0])
    assert ours_scores == pytest.approx(1 - distances[0], abs=1e-6)


@pytest.mark.parametrize("method", ["embeddings", "tfidf"])
def test_scores_are_sorted_best_first_with_consecutive_ranks(client, method):
    neighbours = result(similar(client, k=10), method)["neighbours"]
    scores = [n["score"] for n in neighbours]
    assert scores == sorted(scores, reverse=True)
    assert [n["rank"] for n in neighbours] == list(range(1, 11))
    assert all(-1.0 <= s <= 1.0 for s in scores)


@pytest.mark.parametrize("method", ["embeddings", "tfidf"])
def test_a_pool_profile_used_as_a_query_comes_back_first_with_a_near_perfect_score(client, method):
    profile = POOL[123]
    first = result(similar(client, profile["text"], k=3), method)["neighbours"][0]
    assert first["profile_id"] == profile["id"]
    assert first["score"] > 0.99


def test_the_answer_is_deterministic(client):
    assert similar(client, k=10).json() == similar(client, k=10).json()


def test_the_two_methods_are_reported_separately_with_their_own_scale(client):
    body = similar(client, k=5).json()
    assert [r["method"] for r in body["results"]] == ["embeddings", "tfidf"]
    emb, tfidf = (r["neighbours"][0]["score"] for r in body["results"])
    assert emb != tfidf  # the scales differ, so the numbers must not be merged or averaged
    assert "different scales" in body["comparison"]["note"]
    assert body["results"][0]["score_name"] != body["results"][1]["score_name"]
    ids = {m: [n["profile_id"] for n in r["neighbours"]] for m, r in ((r["method"], r) for r in body["results"])}
    comparison = body["comparison"]
    assert comparison["overlap_count"] == len(set(ids["embeddings"]) & set(ids["tfidf"]))


def test_a_single_method_returns_only_that_method(client):
    for method in ("embeddings", "tfidf"):
        body = similar(client, method=method).json()
        assert [r["method"] for r in body["results"]] == [method]
        assert body["comparison"] is None


def test_k_is_honoured(client):
    for k in (1, 5, 10):
        assert len(result(similar(client, k=k), "embeddings")["neighbours"]) == k


def test_text_with_no_vocabulary_overlap_gives_an_explicit_empty_tfidf_result(client):
    body = similar(client, "zzyzx qwertyuiop blorptastic flibbertigibbet", k=5).json()
    tfidf = next(r for r in body["results"] if r["method"] == "tfidf")
    assert tfidf["neighbours"] == [] and "nothing to compare by word" in tfidf["note"]
    embeddings = next(r for r in body["results"] if r["method"] == "embeddings")
    assert len(embeddings["neighbours"]) == 5  # meaning based search still answers


def test_paraphrases_find_the_right_theme_far_above_chance(client):
    """Independent paraphrases. The pool is clean by construction, so this shows the mechanics work, not real world accuracy."""
    precision = {"embeddings": [], "tfidf": []}
    base = []
    for theme, texts in PARAPHRASES.items():
        base.append(sum(theme in p["themes"] for p in POOL) / len(POOL))
        for method in precision:
            scores = []
            for text in texts:
                neighbours = result(similar(client, text, k=10, method=method), method)["neighbours"]
                scores.append(
                    sum(theme in BY_ID[n["profile_id"]]["themes"] for n in neighbours) / 10 if neighbours else 0
                )
            precision[method].append(np.mean(scores))
    mean_base, emb, tfidf = np.mean(base), np.mean(precision["embeddings"]), np.mean(precision["tfidf"])
    assert emb > 0.85 and tfidf > 0.5
    assert emb > 3 * mean_base and tfidf > 2.5 * mean_base
    assert emb > tfidf  # embeddings match meaning, TF-IDF needs shared words (notebook Section 11)


def test_shared_terms_do_not_repeat_themselves():
    from profile_api.services.explain import dedupe_terms

    assert dedupe_terms(["allows does", "camp", "camp forecast", "does", "forecast"]) == [
        "allows does",
        "camp forecast",
    ]
    assert dedupe_terms(["soup", "cooking", "friends"]) == ["soup", "cooking", "friends"]
    assert dedupe_terms(["pot", "soup pot", "soup"]) == ["soup pot"]


def test_shared_terms_in_a_response_are_deduplicated(client):
    for res in similar(client, SAMPLE, k=10).json()["results"]:
        for neighbour in res["neighbours"]:
            terms = neighbour["shared_terms"]
            pairs = [t for t in terms if " " in t]
            singles = [t for t in terms if " " not in t]
            assert not any(s in p.split() for s in singles for p in pairs)
            assert len(terms) == len(set(terms)) <= 5
