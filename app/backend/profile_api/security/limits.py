"""Input limits, declared once so the frontend and the API agree."""

MAX_TEXT_CHARS = 2000
MIN_WORDS = 3  # after cleaning. Fewer words give an unreliable embedding and an empty TF-IDF vector.
MIN_NEIGHBOURS = 1
MAX_NEIGHBOURS = 10
DEFAULT_NEIGHBOURS = 5
MAX_REQUEST_BYTES = 16_384
