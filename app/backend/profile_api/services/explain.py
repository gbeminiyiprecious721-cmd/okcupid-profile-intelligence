"""Explanation features: shared lifestyle answers, shared terms and themes. All computed, none written by hand."""

import re

import numpy as np

from profile_api.answers import FIELDS


def shared_answers(query: dict, candidate: dict, shares: dict) -> list[dict]:
    """Fields where both profiles give the same answer, with how common that answer is in the pool."""
    found = []
    for field in FIELDS:
        value = query.get(field)
        if value is not None and value == candidate.get(field):
            found.append({"field": field, "value": value, "share_of_pool": round(shares[field][value], 3)})
    return found


def shared_terms(query_row, candidate_row, terms: np.ndarray, limit: int = 5) -> list[str]:
    """Words and word pairs that carry weight in both texts, strongest first (product of the two TF-IDF weights).

    A word pair replaces the single words inside it, so the list does not repeat itself.
    """
    both = query_row.multiply(candidate_row)
    if both.nnz == 0:
        return []
    both = both.tocoo()
    ranked = [str(terms[both.col[i]]) for i in np.lexsort((both.col, -both.data))]
    return dedupe_terms(ranked)[:limit]


def dedupe_terms(ranked: list[str]) -> list[str]:
    """Keep the strongest terms, dropping a single word that a kept word pair already contains, and the reverse."""
    kept: list[str] = []
    for term in ranked:
        words = term.split()
        if len(words) == 1 and any(term in other.split() for other in kept if " " in other):
            continue
        if len(words) > 1:
            kept = [k for k in kept if k not in words]
        kept.append(term)
    return kept


def detect_themes(cleaned_text: str, theme_keywords: dict[str, set[str]], limit: int = 3) -> list[str]:
    """Themes whose keywords appear in the text, most keyword hits first. A plain keyword match, nothing learned."""
    words = re.findall(r"[a-z]+", cleaned_text)
    counts = {theme: sum(word in keywords for word in words) for theme, keywords in theme_keywords.items()}
    ranked = sorted((t for t, c in counts.items() if c > 0), key=lambda t: (-counts[t], t))
    return ranked[:limit]
