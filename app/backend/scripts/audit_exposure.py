"""Check that nothing the public application serves contains text from a real essay.

Run from app/backend:  .venv/bin/python scripts/audit_exposure.py --real-essays ../../profiles.csv

It starts the application in public mode, asks every GET endpoint for everything it can return (all 806 profile
pages, the examples, the lab summary, the meta data, error answers) plus searches and classifier calls, and also reads
the built web application in ../frontend/dist. All of that text is cut into runs of seven words and compared, by hash,
with every run of seven words in the real essays on this computer. The real essays are never printed or saved.
The report holds counts only. A single match is a failure.
"""

import argparse
import json
import sys
from pathlib import Path

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import validate_synthetic as check  # noqa: E402

from profile_api.answers import OPTIONS  # noqa: E402
from profile_api.config import Settings  # noqa: E402
from profile_api.main import create_app  # noqa: E402
from profile_api.paths import APP_DIR, CONTENT_DIR  # noqa: E402

DIST = APP_DIR / "frontend" / "dist"
REPORT = APP_DIR / "planning" / "phase7_exposure_audit.json"

# The web application writes small counts as words ("two groups"), so its code holds the list "one two ... ten".
# That is a counting sequence in our own code, not essay text, and a real essay can count to ten. It is the only
# allowance besides the fixed answer labels, and it is exactly these windows, nothing broader.
COUNTING_WORDS = "one two three four five six seven eight nine ten"


def _windows(words: list[str]) -> set[str]:
    return {" ".join(words[i : i + check.WINDOW]) for i in range(len(words) - check.WINDOW + 1)}


def counting_windows() -> set[str]:
    return _windows(check.tokens(COUNTING_WORDS))


def answer_label_windows() -> set[str]:
    """Fixed lifestyle answer labels, such as "doesn't have kids, but might want them", are public vocabulary of the
    data's answer columns, not essay text, and a real essay can happen to contain one. They are allowed, and counted apart."""
    windows: set[str] = set()
    for options in OPTIONS.values():
        for value in options:
            windows |= _windows(check.tokens(value))
    return windows


def split_matches(offending: list[str], label_windows: set[str]) -> tuple[list[str], list[str], list[str]]:
    """Sort windows found in real essays into (failures, fixed answer labels, number words in our code)."""
    counting = counting_windows()
    failures = [w for w in offending if w not in label_windows and w not in counting]
    labels = [w for w in offending if w in label_windows]
    counted = [w for w in offending if w in counting and w not in label_windows]
    return failures, labels, counted


def strings(node):
    if isinstance(node, dict):
        for key, value in node.items():
            yield str(key)
            yield from strings(value)
    elif isinstance(node, list):
        for value in node:
            yield from strings(value)
    elif isinstance(node, str):
        yield node


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--real-essays", type=Path, required=True)
    parser.add_argument("--report", type=Path, default=REPORT, help="where to write the counts (default: the Phase 7 report)")
    args = parser.parse_args()

    served: dict[str, list[str]] = {"api": [], "frontend": []}
    requests = 0
    document = json.loads((CONTENT_DIR / "synthetic" / "profiles.json").read_text())
    ids = [p["id"] for p in document["pool"] + document["starters"]]
    queries = [p["text"] for p in document["pool"][::50]] + [
        "hiking with my dog and camping under the stars",
        "I love reading novels, drinking tea and writing poems",
    ]
    with TestClient(create_app(Settings(_env_file=None, app_mode="public", rate_limit_enabled=False))) as client:

        def take(response):
            nonlocal requests
            requests += 1
            try:
                served["api"].extend(strings(response.json()))
            except ValueError:
                served["api"].append(response.text)  # not JSON

        for path in [
            "/api/v1/health",
            "/api/v1/meta",
            "/api/v1/examples",
            "/api/v1/lab/summary",
            "/api/v1/classify/examples",
        ]:
            take(client.get(path))
        for pid in ids:
            take(client.get(f"/api/v1/discover/profiles/{pid}"))
        for text in queries:
            for method in ("both", "tfidf", "embeddings"):
                take(client.post("/api/v1/discover/similar", json={"text": text, "method": method, "k": 10}))
        take(client.post("/api/v1/classify/predict", json={"example_id": ids[-1]}))
        for path in ["/api/v1/nothing", "/api/docs", "/api/openapi.json"]:
            take(client.get(path))
    if DIST.exists():
        for file in sorted(DIST.rglob("*")):
            if file.suffix in {".js", ".css", ".html", ".json", ".svg", ".txt"}:
                served["frontend"].append(file.read_text(errors="ignore"))
    else:
        print("The built web application was not found in ../frontend/dist, so only the API was checked.")

    token_lists = [check.tokens(text) for texts in served.values() for text in texts]
    token_lists = [t for t in token_lists if len(t) >= check.WINDOW]
    outcome = check.real_overlap(args.real_essays, token_lists)
    windows_checked = sum(len(t) - check.WINDOW + 1 for t in token_lists)
    label_windows = answer_label_windows()
    matches, label_hits, counting_hits = split_matches(outcome["offending_windows"], label_windows)
    report = {
        "requests_made": requests,
        "api_text_items": len(served["api"]),
        "frontend_files": len(served["frontend"]),
        "seven_word_windows_checked": windows_checked,
        "real_essays_scanned": outcome["essays_scanned"],
        "real_seven_word_windows": outcome["real_windows_seven"],
        "seven_word_matches_raw": outcome["seven_word_hits"],
        "matches_that_are_fixed_answer_labels": len(label_hits),
        "matches_that_are_the_number_words_in_our_code": len(counting_hits),
        "seven_word_matches_that_are_not_labels": len(matches),
        "matching_windows": matches,  # these are our own served words
        "five_word_matches_informational": outcome["five_word_hits_informational"],
        "result": "pass" if not matches else "FAIL",
    }
    args.report.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({k: v for k, v in report.items() if k != "matching_windows"}, indent=2))
    if matches:
        print("Matching windows (served text):", report["matching_windows"][:20])
        raise SystemExit(1)


if __name__ == "__main__":
    main()
