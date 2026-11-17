"""Validate the synthetic pool for privacy and quality, and write content/synthetic/validation_report.json.

Run from app/backend:  .venv/bin/python scripts/validate_synthetic.py [--real-essays ../../profiles.csv]

With --real-essays the script reads the real essays on this computer, only to count overlapping word windows.
Nothing from them is printed or saved. The report holds counts only. Without the flag, the overlap check is
reported as not run and the report cannot be marked complete.
"""

import argparse
import ast
import csv
import datetime
import hashlib
import html
import itertools
import json
import re
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from profile_api import answers as answer_vocab  # noqa: E402
from profile_api.ml.text_cleaning import EMAIL_PATTERN, HANDLE_PATTERN, PHONE_PATTERN, URL_PATTERN  # noqa: E402
from profile_api.paths import CONTENT_DIR, NOTEBOOK, SPEC_DIR  # noqa: E402

PROFILES = CONTENT_DIR / "synthetic" / "profiles.json"
REPORT = CONTENT_DIR / "synthetic" / "validation_report.json"
ESSAYS = [f"essay{i}" for i in range(10)]
WINDOW = 7  # the required check: no run of seven words may appear in any real essay
INFO_WINDOW = 5  # informational: shorter runs are common phrases and are only counted

# Words that would make a profile reveal or imply a sensitive trait, or that belong to the drinking and drug
# answers the Lab predicts. None may appear in the synthetic text.
SENSITIVE = set(
    """christian muslim jewish catholic hindu buddhist atheist religious spiritual gay straight bisexual lesbian
black white asian latino hispanic man men woman women guy guys girl girls boy boys male female he she his her him hers himself
herself boyfriend girlfriend husband wife mother father mom dad""".split()
)
SUBSTANCE = set(
    """drink drinks drinking drank beer wine cocktail cocktails alcohol whiskey vodka tipsy drunk smoke smoking
smoker weed drug drugs cannabis""".split()
)


def tokens(text: str) -> list[str]:
    text = re.sub(r"<[^>]+>", " ", text)
    return re.sub(r"[^a-z ]", " ", html.unescape(text).lower().replace("'", "")).split()


def notebook_names() -> set[str]:
    source = "".join(json.loads(NOTEBOOK.read_text())["cells"][17]["source"])
    for node in ast.parse(source).body:
        if isinstance(node, ast.Assign) and getattr(node.targets[0], "id", "") == "PERSONAL_NAMES":
            return set(eval(ast.unparse(node.value)))  # noqa: S307 (a literal expression from our own notebook)
    raise SystemExit("PERSONAL_NAMES not found in the notebook")


MULT = np.uint64(0x9E3779B97F4A7C15)


def window_hashes(ids: np.ndarray, n: int) -> np.ndarray:
    """A 64 bit hash for every run of n consecutive word ids."""
    count = len(ids) - n + 1
    if count <= 0:
        return np.empty(0, dtype=np.uint64)
    h = ids[:count].copy()
    for j in range(1, n):
        h = h * MULT + ids[j : j + count]
    return h


def real_overlap(path: Path, synthetic_token_lists: list[list[str]]) -> dict:
    vocab: dict[str, int] = {}
    next_id = itertools.count(1)

    def to_ids(words: list[str]) -> np.ndarray:
        return np.fromiter((vocab.setdefault(w, next(next_id)) for w in words), dtype=np.uint64, count=len(words))

    real = {WINDOW: [], INFO_WINDOW: []}
    essays = 0
    csv.field_size_limit(sys.maxsize)
    with path.open(newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            for column in ESSAYS:
                text = row.get(column) or ""
                if not text:
                    continue
                words = tokens(text)
                if len(words) < INFO_WINDOW:
                    continue
                essays += 1
                ids = to_ids(words)
                for n in real:
                    real[n].append(window_hashes(ids, n))
    sorted_real = {n: np.unique(np.concatenate(parts)) for n, parts in real.items()}
    result = {"essays_scanned": essays, "real_windows_seven": int(len(sorted_real[WINDOW]))}
    hits = {}
    for n in real:
        synthetic = np.concatenate([window_hashes(to_ids(words), n) for words in synthetic_token_lists])
        position = np.searchsorted(sorted_real[n], synthetic)
        position[position == len(sorted_real[n])] = 0
        hits[n] = int((sorted_real[n][position] == synthetic).sum())
        result[f"synthetic_windows_{n}"] = int(len(synthetic))
    result["seven_word_hits"], result["five_word_hits_informational"] = (
        hits[WINDOW],
        hits[INFO_WINDOW],
    )
    # Which synthetic windows hit? These are our own words, so listing them is safe. Used to find sentences to rewrite.
    offending = {}
    for words in synthetic_token_lists:
        ids = to_ids(words)
        found = window_hashes(ids, WINDOW)
        position = np.searchsorted(sorted_real[WINDOW], found)
        position[position == len(sorted_real[WINDOW])] = 0
        for start in np.flatnonzero(sorted_real[WINDOW][position] == found):
            window = " ".join(words[start : start + WINDOW])
            offending[window] = offending.get(window, 0) + 1
    result["offending_windows"] = dict(sorted(offending.items(), key=lambda kv: -kv[1]))
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--real-essays", type=Path, default=None)
    parser.add_argument(
        "--update-blocklist",
        action="store_true",
        help="add offending synthetic windows to the generator blocklist",
    )
    args = parser.parse_args()

    raw = PROFILES.read_text()
    document = json.loads(raw)
    everything = document["pool"] + document["starters"]
    texts = [p["text"] for p in everything]
    token_lists = [tokens(t) for t in texts]
    names = notebook_names()
    checks: dict[str, object] = {}

    required = {"id", "handle", "text", "themes", "answers", "is_synthetic"}
    checks["schema_ok"] = all(required <= set(p) for p in everything)
    checks["all_flagged_synthetic"] = all(p["is_synthetic"] is True for p in everything)
    checks["ids_unique"] = len({p["id"] for p in everything}) == len(everything)
    checks["handles_unique"] = len({p["handle"] for p in everything}) == len(everything)
    checks["answers_in_vocabulary"] = all(
        set(p["answers"]) == set(answer_vocab.FIELDS)
        and all(v is None or v in answer_vocab.OPTIONS[f] for f, v in p["answers"].items())
        for p in everything
    )
    lengths = [len(t) for t in token_lists]
    checks["words_per_profile"] = {
        "min": min(lengths),
        "median": int(np.median(lengths)),
        "max": max(lengths),
    }
    checks["length_in_range_40_to_200"] = min(lengths) >= 40 and max(lengths) <= 200

    patterns = [URL_PATTERN, EMAIL_PATTERN, HANDLE_PATTERN, PHONE_PATTERN]
    checks["contact_pattern_hits"] = sum(len(re.findall(pat, t, re.I)) for t in texts for pat in patterns)
    checks["digit_characters"] = sum(ch.isdigit() for t in texts for ch in t)
    all_tokens = set(itertools.chain.from_iterable(token_lists))
    handle_tokens = {w for p in everything for w in tokens(p["handle"])}
    checks["personal_name_hits"] = sorted((all_tokens | handle_tokens) & names)
    checks["sensitive_or_gendered_term_hits"] = sorted(all_tokens & SENSITIVE)
    checks["drinking_or_drug_term_hits"] = sorted(all_tokens & SUBSTANCE)

    shingle_sets = [{" ".join(t[i : i + 5]) for i in range(len(t) - 4)} for t in token_lists]
    worst = 0.0
    for a, b in itertools.combinations(range(len(shingle_sets)), 2):
        union = len(shingle_sets[a] | shingle_sets[b])
        worst = max(worst, len(shingle_sets[a] & shingle_sets[b]) / union if union else 0)
    checks["max_near_duplicate_similarity"] = round(worst, 3)
    checks["near_duplicates_ok"] = worst < 0.5

    themes = json.loads((SPEC_DIR / "theme_bank.json").read_text())["themes"]
    checks["themes_used"] = len({t for p in document["pool"] for t in p["themes"]}) == len(themes)

    if args.real_essays:
        checks["real_essay_overlap"] = {
            "checked": True,
            **real_overlap(args.real_essays, token_lists),
        }
    else:
        checks["real_essay_overlap"] = {"checked": False}

    overlap = checks["real_essay_overlap"]
    passed = (
        all(
            checks[k]
            for k in (
                "schema_ok",
                "all_flagged_synthetic",
                "ids_unique",
                "handles_unique",
                "answers_in_vocabulary",
                "length_in_range_40_to_200",
                "near_duplicates_ok",
                "themes_used",
            )
        )
        and checks["contact_pattern_hits"] == 0
        and checks["digit_characters"] == 0
        and not checks["personal_name_hits"]
        and not checks["sensitive_or_gendered_term_hits"]
        and not checks["drinking_or_drug_term_hits"]
        and overlap["checked"]
        and overlap["seven_word_hits"] == 0
    )
    report = {
        "checked_on": datetime.date.today().isoformat(),
        "profiles_sha256": hashlib.sha256(raw.encode()).hexdigest(),
        "pool_size": len(document["pool"]),
        "starters": len(document["starters"]),
        "passed": bool(passed),
        "note": "Counts only. The real essays were read locally to count overlapping word windows and nothing from them is stored.",
        "checks": checks,
    }
    saved = json.loads(json.dumps(report))
    saved["checks"]["real_essay_overlap"].pop("offending_windows", None)
    REPORT.write_text(json.dumps(saved, indent=1) + "\n")
    print(json.dumps(report, indent=1))
    if overlap.get("offending_windows"):
        print("\nOFFENDING WINDOWS (synthetic text):")
        for window, count in overlap["offending_windows"].items():
            print(f"{count:4d}  {window}")
    if args.update_blocklist and overlap.get("offending_windows"):
        blocklist = SPEC_DIR / "blocked_windows.txt"
        known = set(blocklist.read_text().split("\n")) if blocklist.exists() else set()
        blocklist.write_text("\n".join(sorted((known | set(overlap["offending_windows"])) - {""})) + "\n")
        print(f"blocklist now has {len(known | set(overlap['offending_windows']))} windows")
    sys.exit(0 if passed else 1)


if __name__ == "__main__":
    main()
