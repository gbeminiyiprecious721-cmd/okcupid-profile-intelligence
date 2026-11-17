"""Text cleaning, copied from the notebook (Section 8.1, cell 89) without changes to the rules.

A parity test runs the notebook's own source and checks that both give identical output.
`prepare_text` wraps it with a count of the personal details removed, which the notebook does not need.
"""

import html
import re

URL_PATTERN = r"https?://\S+|www\.\S+"
EMAIL_PATTERN = r"[\w.+]+@\w+\.[a-z]{2,}"
HANDLE_PATTERN = r"(?<!\w)@\w{3,}"
PHONE_PATTERN = r"\(?\d{3}\)?[\s.]\d{3}[\s.]\d{4}"


def clean_text(text):
    """Turn raw essay text into plain lowercase words. Fixed rules only."""
    text = re.sub(r"<[^>]+>", " ", text)  # HTML tags such as line breaks
    text = html.unescape(text)  # entities such as &amp;
    for pattern in (URL_PATTERN, EMAIL_PATTERN, HANDLE_PATTERN, PHONE_PATTERN):
        text = re.sub(pattern, " ", text, flags=re.IGNORECASE)  # personal details
    text = text.lower().replace("'", "")  # "don't" becomes "dont"
    text = re.sub(r"[^a-z ]", " ", text)  # letters only
    return " ".join(text.split())


_CONTROL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_CATEGORIES = {
    "link": URL_PATTERN,
    "email": EMAIL_PATTERN,
    "handle": HANDLE_PATTERN,
    "phone": PHONE_PATTERN,
}


def prepare_text(raw: str) -> tuple[str, dict[str, int]]:
    """Cleaned text, and how many personal details of each kind were removed. The details themselves are not kept."""
    raw = _CONTROL.sub(" ", raw)
    removed = {}
    for name, pattern in _CATEGORIES.items():
        found = len(re.findall(pattern, raw, flags=re.IGNORECASE))
        if found:
            removed[name] = found
    return clean_text(raw), removed
