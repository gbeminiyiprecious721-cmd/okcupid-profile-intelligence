"""The real essay exposure audit: one narrow allowance, and everything else still fails.

These tests use a tiny invented stand in for the real essays file. The real file is never read here.
"""

import csv
import sys

from profile_api.paths import BACKEND_DIR

sys.path.insert(0, str(BACKEND_DIR / "scripts"))
import audit_exposure as audit  # noqa: E402
import validate_synthetic as check  # noqa: E402

COUNTING = "one two three four five six seven eight nine ten"
UNRELATED = "we spent every sunday morning baking bread together"  # invented, 8 words


def run_audit(tmp_path, essays: list[str], served: list[str]):
    """Write invented 'real' essays, find the overlaps with the served text, and sort them as the audit does."""
    path = tmp_path / "essays.csv"
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=["essay0"])
        writer.writeheader()
        writer.writerows({"essay0": text} for text in essays)
    outcome = check.real_overlap(path, [check.tokens(text) for text in served])
    return audit.split_matches(outcome["offending_windows"], audit.answer_label_windows())


def test_the_number_words_in_our_code_are_counted_apart_not_failed(tmp_path):
    failures, labels, counting = run_audit(tmp_path, [f"I can count: {COUNTING} and so on."], [COUNTING])
    assert failures == []
    assert labels == []
    assert len(counting) == 4  # exactly the four windows of "one ... ten"


def test_an_unrelated_overlap_with_a_real_essay_still_fails(tmp_path):
    failures, _, counting = run_audit(tmp_path, [f"Honestly, {UNRELATED}."], [f"Our page says {UNRELATED}."])
    assert failures, "an overlap that is not the counting sequence must fail"
    assert counting == []


def test_the_exception_is_exactly_the_sequence_and_nothing_near_it(tmp_path):
    # a different order of the same words, and the sequence with one word changed, are not the allowed windows
    shuffled = "ten nine eight seven six five four three two one"
    changed = "one two three four five six eight nine ten seven"
    failures, _, counting = run_audit(tmp_path, [f"{shuffled} {changed}"], [shuffled, changed])
    assert counting == []
    assert failures


def test_a_real_overlap_next_to_the_counting_sequence_still_fails(tmp_path):
    served = f"{UNRELATED} {COUNTING}"
    failures, _, counting = run_audit(tmp_path, [f"{UNRELATED} {COUNTING}"], [served])
    assert counting and failures  # the sequence is allowed, the unrelated words are not


def test_the_allowed_windows_are_only_the_four_counting_windows():
    assert audit.counting_windows() == {
        "one two three four five six seven",
        "two three four five six seven eight",
        "three four five six seven eight nine",
        "four five six seven eight nine ten",
    }
