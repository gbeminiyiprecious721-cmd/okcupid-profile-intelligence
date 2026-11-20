"""Generate the synthetic profile pool from the theme bank. Deterministic: the same inputs give the same file.

Run from app/backend:  .venv/bin/python scripts/generate_synthetic_profiles.py

No real profile, essay or row is read. Text is composed from hand written sentences in
content/synthetic/spec/theme_bank.json. Answers are sampled from the illustrative frequencies in
content/synthetic/spec/answer_model.json.
"""

import hashlib
import json
import random
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from profile_api.paths import CONTENT_DIR, SPEC_DIR  # noqa: E402

SEED = 42
WINDOW = 7
POOL_SIZE = 800
OUTPUT = CONTENT_DIR / "synthetic" / "profiles.json"

ADJECTIVES = """Quiet Late Patient Curious Wandering Gentle Brisk Sunny Clever Steady Restless Mellow Bright Careful Daring
Easygoing Humble Merry Nimble Plucky Rustic Silver Tender Vivid Warm Witty Amber Bold Calm Dapper Eager Fuzzy Golden Jolly
Kind Lively Modest Noble Peppy Playful Thoughtful Swift""".split()
NOUNS = """Cartographer Baker Gardener Navigator Violinist Lantern Compass Heron Otter Falcon Pilot Weaver Tinkerer Walker Painter
Sailor Ranger Dreamer Collector Wanderer Poet Botanist Climber Drummer Archer Mariner Potter Printer Skipper Forager Reader
Cyclist Swimmer Whistler Tailor Keeper Scribe Beekeeper Stargazer Fiddler Glider""".split()

# (share of the pool, main sentences, other theme main sentences, minor sentences, chance of opener, chance of closer)
LENGTHS = {
    "short": (0.20, (2, 2), 0, (1, 1), 0.4, 0.3),
    "medium": (0.55, (3, 4), 0, (1, 2), 0.7, 0.6),
    "long": (0.25, (4, 5), 2, (1, 1), 0.9, 0.9),
}


def words(text: str) -> int:
    return len(text.split())


def shingles(text: str, n: int = 5) -> set:
    tokens = re.sub(r"[^a-z ]", " ", text.lower()).split()
    return {" ".join(tokens[i : i + n]) for i in range(max(0, len(tokens) - n + 1))}


def weighted_choice(rng: random.Random, weights: dict):
    keys = list(weights)
    return rng.choices(keys, weights=[weights[k] for k in keys])[0]


class Generator:
    def __init__(self, seed: int):
        self.rng = random.Random(seed)
        bank = json.loads((SPEC_DIR / "theme_bank.json").read_text())
        self.themes, self.generic, self.theme_weights = (
            bank["themes"],
            bank["generic"],
            bank["weights"],
        )
        self.answer_model = json.loads((SPEC_DIR / "answer_model.json").read_text())
        # Seven word windows of our own text that were found to coincide with real essays by accident.
        # They are synthetic phrases, not real text. A profile containing one is never produced.
        blocked_file = SPEC_DIR / "blocked_windows.txt"
        self.blocked = set(blocked_file.read_text().split("\n")) - {""} if blocked_file.exists() else set()
        self.handles: set[str] = set()
        self.shingle_sets: list[set] = []

    def compose(self, primary: str, others: list[str], length: str) -> tuple[str, list[str]]:
        """Compose the text, and report which themes actually contributed a sentence."""
        rng = self.rng
        _, main_range, other_main, minor_range, p_open, p_close = LENGTHS[length]
        parts, used = [], [primary]
        if rng.random() < p_open:
            parts.append(rng.choice(self.generic["openers"]))
        parts += rng.sample(self.themes[primary]["main"], rng.randint(*main_range))
        if other_main:  # long profiles blend a second theme with its own main sentences
            parts += rng.sample(self.themes[others[0]]["main"], other_main)
            used.append(others[0])
            minor_themes = others[1:2]
        else:
            minor_themes = others[: rng.randint(*minor_range)]
        for theme in minor_themes:
            parts.append(rng.choice(self.themes[theme]["minor"]))
            used.append(theme)
        if rng.random() < p_close:
            parts.append(rng.choice(self.generic["closers"]))
        # Sentences stay grouped by theme, so a profile reads as one voice: opener, main theme, blended theme, asides, closer.
        text = " ".join(parts)
        return text, used

    def answers(self, theme_keys: list[str]) -> dict:
        out = {}
        for field, spec in self.answer_model["fields"].items():
            if self.rng.random() < spec["missing"]:
                out[field] = None
                continue
            weights = dict(spec["options"])
            for theme in theme_keys:
                for option, multiplier in self.answer_model["theme_links"].get(theme, {}).get(field, {}).items():
                    weights[option] = weights[option] * multiplier
            out[field] = weighted_choice(self.rng, weights)
        return out

    def handle(self) -> str:
        while True:
            name = f"{self.rng.choice(ADJECTIVES)} {self.rng.choice(NOUNS)}"
            if name not in self.handles:
                self.handles.add(name)
                return name

    def profile(self, primary=None, others=None, length=None) -> dict:
        rng = self.rng
        primary = primary or weighted_choice(rng, self.theme_weights)
        length = length or weighted_choice(rng, {k: v[0] for k, v in LENGTHS.items()})
        pool = [t for t in self.themes if t != primary]
        others = others or rng.sample(pool, 2)
        for _ in range(60):
            text, themes = self.compose(primary, others, length)
            if not 40 <= words(text) <= 200:
                continue
            tokens = re.sub(r"[^a-z ]", " ", text.lower().replace("'", "")).split()
            if any(" ".join(tokens[i : i + WINDOW]) in self.blocked for i in range(len(tokens) - WINDOW + 1)):
                continue
            candidate = shingles(text)
            # Reject near copies of an earlier profile (Jaccard similarity of 5 word shingles).
            if all(len(candidate & s) / max(1, len(candidate | s)) < 0.5 for s in self.shingle_sets):
                self.shingle_sets.append(candidate)
                break
        else:
            raise RuntimeError("could not compose a distinct profile")
        return {
            "handle": self.handle(),
            "text": text,
            "themes": themes,
            "answers": self.answers(themes),
            "is_synthetic": True,
        }


def anonymous_id(prefix: str, index: int) -> str:
    return f"{prefix}_{hashlib.sha256(f'{SEED}-{prefix}-{index}'.encode()).hexdigest()[:8]}"


def main() -> None:
    pool_gen = Generator(SEED)
    pool = []
    for i in range(POOL_SIZE):
        profile = pool_gen.profile()
        pool.append({"id": anonymous_id("syn", i), **profile})
    # Shuffle so that the order of ids says nothing about theme.
    pool_gen.rng.shuffle(pool)

    starter_gen = Generator(SEED + 1)
    starter_gen.handles = {p["handle"] for p in pool}  # starters get handles no pool profile has
    starter_gen.shingle_sets = list(pool_gen.shingle_sets)  # and text no pool profile resembles
    plans = [
        ("travel", ["cooking", "humour"]),
        ("music", ["humour", "books"]),
        ("outdoors", ["fitness", "pets"]),
        ("books", ["creative", "music"]),
        ("technology", ["family", "creative"]),
        ("pets", ["volunteering", "cooking"]),
    ]
    starters = []
    for i, (primary, others) in enumerate(plans):
        profile = starter_gen.profile(primary, others, "medium")
        starters.append({"id": anonymous_id("ex", i), **profile})

    document = {
        "version": 1,
        "seed": SEED,
        "generator": "app/backend/scripts/generate_synthetic_profiles.py",
        "is_synthetic": True,
        "note": "Every profile here is invented. Text is composed from hand written sentences. No real profile was read.",
        "pool": pool,
        "starters": starters,
    }
    OUTPUT.write_text(json.dumps(document, indent=1, ensure_ascii=False) + "\n")
    lengths = sorted(words(p["text"]) for p in pool)
    print(f"wrote {OUTPUT.relative_to(CONTENT_DIR.parent)}: {len(pool)} profiles, {len(starters)} starters")
    print(f"words per profile: min {lengths[0]}, median {lengths[len(lengths) // 2]}, max {lengths[-1]}")


if __name__ == "__main__":
    main()
