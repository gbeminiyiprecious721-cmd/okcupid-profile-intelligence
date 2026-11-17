"""Nearest neighbour search over the synthetic pool, with scikit learn NearestNeighbors and cosine distance.

This is the notebook's method (Section 11.2: NearestNeighbors(metric="cosine", algorithm="brute")), fitted on the
synthetic pool instead of the real profiles. The two methods are searched separately and their scores are never mixed,
because cosine similarity on TF-IDF vectors and on embeddings lies on different scales.
"""

import numpy as np
from sklearn.neighbors import NearestNeighbors


class NeighbourIndex:
    def __init__(self, matrix):
        self.size = matrix.shape[0]
        self._search = NearestNeighbors(metric="cosine", algorithm="brute").fit(matrix)

    def nearest(self, query, k: int) -> tuple[np.ndarray, np.ndarray]:
        """Positions and cosine similarities of the k nearest profiles, best first.

        Every profile is ranked and ties are broken by position, so the same input always gives the same answer.
        """
        distances, positions = self._search.kneighbors(query, n_neighbors=self.size)
        order = np.lexsort((positions[0], distances[0]))[:k]
        return positions[0][order], 1.0 - distances[0][order]
