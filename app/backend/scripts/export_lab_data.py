"""Export the approved aggregate findings of the notebook to content/lab/lab_summary.json.

Run from app/backend:  .venv/bin/python scripts/export_lab_data.py

Reads only the notebook's saved outputs and text. It runs no model, opens no data file and reads no essay.
Every number is parsed from a printed output or from the notebook's own sentences, and the script stops with an
error if a pattern is missing, so a changed notebook can never silently produce different numbers.
The notebook's hash is stored in the file, and the two figures that exist only as pictures are copied out with
their hashes.
"""

import argparse
import base64
import hashlib
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from profile_api.paths import CONTENT_DIR, NOTEBOOK  # noqa: E402

OUT_DIR = CONTENT_DIR / "lab"
OUT = OUT_DIR / "lab_summary.json"
FIGURE_DIR = OUT_DIR / "figures"

nb = json.loads(NOTEBOOK.read_text())
CELLS = nb["cells"]


def output_text(cell) -> str:
    parts = []
    for out in cell.get("outputs", []):
        text = out.get("text") or out.get("data", {}).get("text/plain")
        if text:
            parts.append("".join(text))
    return "\n".join(parts)


OUTPUTS = [(i, output_text(c)) for i, c in enumerate(CELLS) if c["cell_type"] == "code"]
MARKDOWN = [(i, "".join(c["source"])) for i, c in enumerate(CELLS) if c["cell_type"] == "markdown"]


def find_output(marker: str) -> tuple[int, str]:
    hits = [(i, t) for i, t in OUTPUTS if marker in t]
    if len(hits) != 1:
        raise SystemExit(f"Expected exactly one output containing {marker!r}, found {len(hits)}")
    return hits[0]


def find_markdown(marker: str) -> tuple[int, str]:
    hits = [(i, t) for i, t in MARKDOWN if marker in t]
    if not hits:
        raise SystemExit(f"No markdown cell contains {marker!r}")
    return hits[0]


def num(text: str) -> float:
    return float(text.replace(",", ""))


def integer(text: str) -> int:
    return int(text.replace(",", ""))


def need(pattern: str, text: str, flags: int = 0):
    match = re.search(pattern, text, flags)
    if not match:
        raise SystemExit(f"Pattern not found: {pattern!r}")
    return match


def table_rows(text: str, first_col: str) -> list[list[str]]:
    """Rows of a printed pandas table, split on two or more spaces, after the header line starting with first_col."""
    lines = text.splitlines()
    start = next(i for i, line in enumerate(lines) if line.strip().startswith(first_col))
    rows = []
    for line in lines[start + 1 :]:
        if not line.strip():
            break
        rows.append(re.split(r"\s{2,}", line.strip()))
    return rows


# ---------------------------------------------------------------- overview
def overview() -> dict:
    _, shape = find_output("rows x 31 columns")
    _, target = find_output("Largest class is")
    _, split = find_output("Baseline always predicts")
    _, missing = find_output("Placeholder wording found")
    _, seg_users = find_output("Users placed in segments")
    _, hidden = find_output("Hidden missing codes")
    _, effects = find_output("effect_size  effect_low  effect_high")
    _, fields_md = find_markdown("Essay answers range from")
    scope_md = find_markdown("Profiles were last online between June 2011 and July 2012")[1]

    levels = []
    for name, count, share in re.findall(
        r"^(not at all|rarely|socially|often\+)\s+(\d[\d,]*)\s+([\d.]+)$", target, re.M
    ):
        levels.append({"level": name, "count": integer(count), "share_pct": num(share)})
    labelled = need(r"Labelled profiles: ([\d,]+) \| without a drinks answer: ([\d,]+)", target)
    ratio = need(r"Largest class is ([\d.]+) times", target)
    train = need(r"Train ([\d,]+) \| test ([\d,]+) \| unlabelled added for unsupervised work ([\d,]+)", split)
    base = need(r"accuracy ([\d.]+)\s+macro F1 ([\d.]+)", split)
    placed = need(r"Users placed in segments: ([\d,]+) \(left out, no text: ([\d,]+)\)", seg_users)
    rows = need(r"([\d,]+) rows x (\d+) columns", shape)
    income = need(r"income\s+-1\s+([\d,]+) profiles \(([\d.]+)%\)", hidden)
    california = need(r"([\d,]+) of ([\d,]+), are in California", scope_md.replace("\n", " "))
    essay_answers = need(r"from ([\d,]+) profiles for `essay8` to ([\d,]+) for `essay0`", fields_md)

    miss = []
    for line in missing.splitlines():
        m = re.match(r"^(\w+)\s+(\d+)\s+([\d.]+)$", line.strip())
        if m and not m.group(1).startswith("essay"):
            miss.append({"field": m.group(1), "missing_pct": num(m.group(3))})
    miss = miss[:10]

    names = {
        "H1 drug use": "Drug use",
        "H2 smoking": "Smoking",
        "H3 sex": "Sex",
        "H4 age": "Age",
        "H5 essay length": "Essay length",
    }
    associations = []
    for key, label in names.items():
        m = need(rf"^{re.escape(key)}\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)$", effects, re.M)
        associations.append(
            {
                "factor": label,
                "measure": "Cramér's V"
                if key in ("H1 drug use", "H2 smoking", "H3 sex")
                else "share of variation explained",
                "effect": num(m.group(1)),
                "low": num(m.group(2)),
                "high": num(m.group(3)),
            }
        )
    _, drug_text = find_output("Drink often: 43.7%")
    drugs = need(r"Drink often: ([\d.]+)% of users who use drugs often \(n=(\d+)\)", drug_text)
    never = need(r"Drink often: ([\d.]+)% of users who never use drugs \(n=([\d,]+)\)", drug_text)

    return {
        "dataset": {
            "profiles": integer(rows.group(1)),
            "columns": integer(rows.group(2)),
            "labelled": integer(labelled.group(1)),
            "unlabelled": integer(labelled.group(2)),
            "train": integer(train.group(1)),
            "test": integer(train.group(2)),
            "segmented": integer(placed.group(1)),
            "no_text": integer(placed.group(2)),
            "california": integer(california.group(1)),
            "essay_answers_min": integer(essay_answers.group(1)),
            "essay_answers_max": integer(essay_answers.group(2)),
            "income_not_given_pct": num(income.group(2)),
            "period": "June 2011 to July 2012",
        },
        "target": {"levels": levels, "largest_to_smallest": num(ratio.group(1))},
        "baseline_train": {"accuracy": num(base.group(1)), "macro_f1": num(base.group(2))},
        "missing": miss,
        "associations": associations,
        "drug_contrast": {
            "often_group_pct": num(drugs.group(1)),
            "often_group_n": integer(drugs.group(2)),
            "never_group_pct": num(never.group(1)),
            "never_group_n": integer(never.group(2)),
        },
    }


# ---------------------------------------------------------------- segments
def segments() -> dict:
    _, sizes = find_output("Stability for k = 6")
    _, stab = find_output("new_seed  new_80pct_sample")
    _, summary = find_output("mean_age  male_pct")
    _, words = find_output("Segment 1 (9,461 users)")
    _, lifestyle = find_output("Lifestyle answers most over represented")
    _, pca = find_output("keep 44% of the variation")
    _, assign = find_output("Same segment as before")
    _, desc_md = find_markdown("Segment 1, technical men")
    _, choose_md = find_markdown("Separation is weak at every number of groups")

    shares = {int(s): (integer(u), num(p)) for s, u, p in re.findall(r"^(\d)\s+(\d[\d,]*)\s+([\d.]+)$", sizes, re.M)}
    stability = [
        {"k": int(k), "new_seed": num(a), "new_sample": num(b)}
        for k, a, b in re.findall(r"^(\d)\s+([\d.]+)\s+([\d.]+)$", stab, re.M)
    ]
    people = {
        int(s): (num(a), num(m)) for s, _, a, m in re.findall(r"^(\d)\s+(\d+)\s+([\d.]+)\s+([\d.]+)$", summary, re.M)
    }
    overall = need(r"All users: mean age ([\d.]+), male (\d+)%", summary)
    names = dict(re.findall(r"\d\. \*\*Segment (\d), ([^(]+?) \(\d+%?[\d.]*%\)", desc_md))
    top_words = {int(s): w.split(", ") for s, w in re.findall(r"Segment (\d) \([\d,]+ users\): (.+)", words)}
    over = {}
    for s, line in re.findall(r"Segment (\d): (.+)", lifestyle):
        over[int(s)] = [
            {"answer": a.strip(), "ratio": num(r)}
            for a, r in re.findall(r"([^,]+?) \(([\d.]+)x\)", line.replace("’", "'"))
        ]

    drink_md = find_markdown("**Drinking check.**")[1].replace("\n", " ")
    hi = need(
        r"Segment (\d) has the highest share of users who drink often \((\d+)%\), and Segment (\d) has the lowest \((\d+)%\), with (\d+)% drinking rarely or not at all",
        drink_md,
    )
    others = need(r"with (\d+)% to (\d+)% drinking often", drink_md)
    male = need(r"\((\d+)% men\)|(\d+)% men", drink_md)  # existence check only
    del male
    sil = need(
        r"The silhouette score is (0\.\d+) for two groups and falls to (0\.\d+) for ten", choose_md.replace("\n", " ")
    )
    never_pass = need(
        r"never passes (0\.\d+) for any number of groups", find_markdown("never passes 0.085")[1].replace("\n", " ")
    )
    about = need(r"silhouette score is about (0\.\d+) at six groups", find_markdown("silhouette score is about")[1])
    stable6 = need(r"\((0\.\d+) for a new seed and (0\.\d+) for a new sample at k = 6\)", choose_md.replace("\n", " "))
    pca_m = need(r"Text: (\d+) components keep (\d+)% of the variation\s+Lifestyle: (\d+) components keep (\d+)%", pca)
    cols = need(r"Text block: (\d+) numbers per user\s+Lifestyle block: (\d+) columns", find_output("Text block: ")[1])
    assign_m = need(r"Same segment as before for ([\d.]+)% of (\d+) users checked", assign)

    items = []
    for sid in sorted(shares):
        items.append(
            {
                "id": sid,
                "name": names[str(sid)].strip(),
                "users": shares[sid][0],
                "share_pct": shares[sid][1],
                "mean_age": people[sid][0],
                "male_pct": people[sid][1],
                "top_words": top_words[sid],
                "over_represented": over[sid][:5],
            }
        )
    return {
        "items": items,
        "population": {"mean_age": num(overall.group(1)), "male_pct": num(overall.group(2))},
        "stability": stability,
        "stability_k6": {"new_seed": num(stable6.group(1)), "new_sample": num(stable6.group(2))},
        "silhouette": {
            "k2": num(sil.group(1)),
            "k6_about": num(about.group(1)),
            "k10": num(sil.group(2)),
            "maximum": num(never_pass.group(1)),
            "weak_below": 0.25,
            "clear_above": 0.5,
        },
        "reduction": {
            "text_components": integer(pca_m.group(1)),
            "text_variation_pct": integer(pca_m.group(2)),
            "lifestyle_components": integer(pca_m.group(3)),
            "lifestyle_variation_pct": integer(pca_m.group(4)),
            "text_columns": integer(cols.group(1)),
            "lifestyle_columns": integer(cols.group(2)),
        },
        "drinking_check": {
            "highest_segment": int(hi.group(1)),
            "highest_often_pct": integer(hi.group(2)),
            "lowest_segment": int(hi.group(3)),
            "lowest_often_pct": integer(hi.group(4)),
            "lowest_rarely_or_never_pct": integer(hi.group(5)),
            "others_often_low_pct": integer(others.group(1)),
            "others_often_high_pct": integer(others.group(2)),
        },
        "assignment_check": {"agreement_pct": num(assign_m.group(1)), "users_checked": integer(assign_m.group(2))},
    }


# ---------------------------------------------------------------- models
MODEL_LINE = re.compile(
    r"^(?P<name>.+?)\s+validation macro F1 (?P<f1>[\d.]+) \(spread (?P<spread>[\d.]+)\) \| training (?P<train>[\d.]+) \| accuracy (?P<acc>[\d.]+)",
    re.M,
)
FAMILY = {
    "baseline": ("Baseline", "Always predicts 'socially'"),
    "logistic: structured fields": ("Logistic regression", "Structured fields"),
    "logistic: TF-IDF text only": ("Logistic regression", "Essay words (TF-IDF)"),
    "logistic: embeddings only": ("Logistic regression", "Essay meaning (embeddings)"),
    "logistic: structured + TF-IDF": ("Logistic regression", "Structured fields and essay words"),
    "logistic: structured + embeddings": ("Logistic regression", "Structured fields and essay meaning"),
    "naive bayes: TF-IDF text only": ("Naive Bayes", "Essay words (TF-IDF)"),
    "gradient boosting: structured fields": ("Gradient boosting", "Structured fields"),
    "logistic: structured + TF-IDF + segment (tuned C)": (
        "Logistic regression",
        "Structured fields, essay words and segment",
    ),
    "logistic: structured + TF-IDF, drinking words removed": (
        "Logistic regression",
        "Structured fields and essay words, drinking words removed",
    ),
    "logistic: TF-IDF text only, drinking words removed": (
        "Logistic regression",
        "Essay words, drinking words removed",
    ),
}


def models() -> dict:
    wanted = {}
    for _, text in OUTPUTS:
        for m in MODEL_LINE.finditer(text):
            name = re.sub(r"\s+", " ", m["name"]).strip()
            if name.startswith("baseline"):
                name = "baseline"
            if name in FAMILY and name not in wanted:
                wanted[name] = {
                    "model": FAMILY[name][0],
                    "inputs": FAMILY[name][1],
                    "validation_macro_f1": num(m["f1"]),
                    "fold_spread": num(m["spread"]),
                    "training_macro_f1": num(m["train"]),
                    "validation_accuracy": num(m["acc"]),
                }
    missing = set(FAMILY) - set(wanted)
    if missing:
        raise SystemExit(f"Model lines not found: {sorted(missing)}")
    validation = sorted(wanted.values(), key=lambda r: -r["validation_macro_f1"])

    _, grid = find_output("Best C:")
    tuning = [
        {"c": num(c), "validation_macro_f1": num(v), "fold_spread": num(s), "training_macro_f1": num(t)}
        for c, v, s, t in re.findall(r"^([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)$", grid, re.M)
    ]
    _, seg = find_output("Change in macro F1 from adding the segment")
    folds = [num(x) for x in need(r"fold by fold: \[(.+?)\]", seg).group(1).split(",")]
    avg = need(r"Average change (-?[\d.]+), spread between folds ([\d.]+)", seg)
    _, words = find_output("Users whose text mentioned a drinking word")
    share = need(r"mentioned a drinking word: ([\d.]+)%", words)

    _, test = find_output("Scores for each drinking group (test)")
    t_base = need(r"Baseline \(test\)\s+([\d.]+)\s+([\d.]+)", test)
    t_final = need(r"Final model \(test\)\s+([\d.]+)\s+([\d.]+)", test)
    t_val = need(r"Final model \(validation, section 10\)\s+([\d.]+)", test)
    per_class = []
    for level in ("not at all", "rarely", "socially", "often+"):
        m = need(rf"^{re.escape(level)}\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+(\d+)$", test, re.M)
        per_class.append(
            {"level": level, "precision": num(m[1]), "recall": num(m[2]), "f1": num(m[3]), "support": integer(m[4])}
        )
    macro = need(r"macro avg\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+(\d+)", test)
    n_test = need(r"Test users: ([\d,]+) \| frozen setting: C = ([\d.]+)", find_output("Test users:")[1])
    _, ci = find_output("Test scores with 95% ranges")
    intervals = []
    for label in (
        "final model",
        "baseline",
        "recall not at all",
        "recall rarely",
        "recall socially",
        "recall often+",
        "gain over baseline",
    ):
        m = need(rf"^{re.escape(label)}\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)$", ci, re.M)
        intervals.append({"metric": label, "score": num(m[1]), "low": num(m[2]), "high": num(m[3])})
    sc_md = find_markdown("Mistakes mostly go to the neighbouring group")[1].replace("\n", " ")
    errs = need(
        r"(\d+)% of users who drink often are predicted \"socially\", and (\d+)% of non drinkers are predicted \"rarely\"",
        sc_md,
    )

    # The confusion matrix exists only as a figure. These are the whole number percentages printed on it, row by row
    # (rows are the true habit, columns the predicted habit). They are transcribed, not computed, and rounded as printed.
    confusion = [[40, 34, 20, 6], [24, 40, 28, 7], [11, 17, 54, 18], [6, 7, 34, 53]]
    return {
        "validation": validation,
        "tuning": tuning,
        "tuning_best_c": 1.0,
        "segment_effect": {"fold_changes": folds, "mean_change": num(avg.group(1)), "fold_spread": num(avg.group(2))},
        "drinking_words": {"users_mentioning_pct": num(share.group(1))},
        "test": {
            "users": integer(n_test.group(1)),
            "c": num(n_test.group(2)),
            "baseline": {"macro_f1": num(t_base.group(1)), "accuracy": num(t_base.group(2))},
            "final": {
                "macro_f1": num(t_final.group(1)),
                "accuracy": num(t_final.group(2)),
                "validation_macro_f1": num(t_val.group(1)),
            },
            "per_class": per_class,
            "macro_precision": num(macro.group(1)),
            "macro_recall": num(macro.group(2)),
            "intervals": intervals,
            "often_predicted_socially_pct": integer(errs.group(1)),
            "not_at_all_predicted_rarely_pct": integer(errs.group(2)),
        },
        "confusion_pct": {
            "labels": ["not at all", "rarely", "socially", "often+"],
            "rows": confusion,
            "source": "Rounded percentages transcribed by hand from the figure in notebook section 12.3. The notebook prints no table of them, and they were not recomputed.",
        },
    }


# ---------------------------------------------------------------- similarity
def similarity() -> dict:
    _, search = find_output("searchable users")
    _, queries = find_output("5,000 queries, 10 neighbours each")
    _, table = find_output("tfidf_lift")
    _, demo = find_output("hiking vs trekking")
    _, size = find_output("seconds_to_build")
    s = need(r"([\d,]+) searchable users\s+TF-IDF: ([\d,]+) columns \| embeddings: (\d+) columns", search)
    q = need(
        r"(\d[\d,]*) queries, (\d+) neighbours each\s+Average similarity of the neighbours: TF-IDF ([\d.]+), embeddings ([\d.]+)",
        queries,
    )
    fields = []
    for line in table.splitlines():
        m = re.match(r"^(\w+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)$", line.strip())
        if m:
            fields.append(
                {
                    "field": m[1],
                    "chance": num(m[2]),
                    "tfidf": num(m[3]),
                    "embeddings": num(m[4]),
                    "tfidf_lift": num(m[5]),
                    "embeddings_lift": num(m[6]),
                }
            )
    if len(fields) != 12:
        raise SystemExit(f"Expected 12 similarity rows, found {len(fields)}")
    sims = need(
        r"hiking vs trekking \(same meaning\)\s+([\d.]+)\s+([\d.]+)\s+hiking vs accountant \(different\)\s+([\d.]+)\s+([\d.]+)",
        demo,
    )
    sizes = {
        name: (integer(c), integer(m), integer(sec))
        for name, c, m, sec in re.findall(r"^(TF-IDF|sentence embeddings)\s+(\d+)\s+(\d+)\s+(\d+)$", size, re.M)
    }
    return {
        "searchable_users": integer(s.group(1)),
        "tfidf_columns": integer(s.group(2)),
        "embedding_columns": integer(s.group(3)),
        "queries": integer(q.group(1)),
        "neighbours": integer(q.group(2)),
        "average_similarity": {"tfidf": num(q.group(3)), "embeddings": num(q.group(4))},
        "fields": fields,
        "invented_profile_demo": {
            "same_meaning": {"tfidf": num(sims.group(1)), "embeddings": num(sims.group(2))},
            "different": {"tfidf": num(sims.group(3)), "embeddings": num(sims.group(4))},
        },
        "representation_cost": {k: {"columns": v[0], "memory_mb": v[1], "seconds": v[2]} for k, v in sizes.items()},
    }


# ---------------------------------------------------------------- fairness
def fairness() -> dict:
    _, table = find_output("segment: no text")
    _, privacy = find_output("web link")
    rows = []
    for line in table.splitlines():
        m = re.match(r"^(sex|age_band|essay_length|segment): (.+?)\s+(\d+)\s+([\d.]+)\s+([\d.]+)$", line.strip())
        if m:
            rows.append(
                {
                    "kind": m[1],
                    "group": m[2].strip(),
                    "users": integer(m[3]),
                    "often_share": num(m[4]),
                    "macro_f1": num(m[5]),
                }
            )
    if len(rows) != 18:
        raise SystemExit(f"Expected 18 subgroup rows, found {len(rows)}")
    flat = privacy.replace("\n\n", "\n")
    kinds = {
        k: integer(v)
        for k, v in re.findall(
            r"^(web link|social media handle|email address|phone number)\s+([\d,]+) profiles", flat, re.M
        )
    }
    u6 = need(r"6 fields: ([\d,]+) of ([\d,]+) complete profiles are unique \(([\d.]+)%\)", flat)
    u4 = need(r"4 fields: ([\d,]+) of ([\d,]+) complete profiles are unique \(([\d.]+)%\)", flat)
    return {
        "subgroups": rows,
        "privacy": {
            "essays_with_web_link": kinds["web link"],
            "essays_with_handle": kinds["social media handle"],
            "essays_with_email": kinds["email address"],
            "essays_with_phone": kinds["phone number"],
            "unique_on_six_fields": {
                "unique": integer(u6.group(1)),
                "of": integer(u6.group(2)),
                "pct": num(u6.group(3)),
            },
            "unique_on_four_fields": {
                "unique": integer(u4.group(1)),
                "of": integer(u4.group(2)),
                "pct": num(u4.group(3)),
            },
        },
    }


def figures() -> dict:
    """Copy out the two figures whose numbers exist only as pictures. They hold aggregates and no text from profiles."""
    FIGURE_DIR.mkdir(parents=True, exist_ok=True)
    wanted = {
        "clusters_vs_k.png": "Inertia falls smoothly, with no clear bend",
        "confusion_matrix.png": "Recall is highest for socially",
    }
    found = {}
    for cell in CELLS:
        if cell["cell_type"] != "code":
            continue
        for out in cell.get("outputs", []):
            png = out.get("data", {}).get("image/png")
            if not png:
                continue
            for filename, _ in wanted.items():
                src = "".join(cell["source"])
                key = "k_scores" if filename.startswith("clusters") else "Predicted drinking habit"
                if key in src and filename not in found:
                    data = base64.b64decode(png)
                    (FIGURE_DIR / filename).write_bytes(data)
                    found[filename] = {"sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data)}
    if set(found) != set(wanted):
        raise SystemExit(f"Figures not found: {set(wanted) - set(found)}")
    return found


def main() -> None:
    global OUT_DIR, OUT, FIGURE_DIR
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", type=Path, default=OUT_DIR, help="Folder to write to (default: content/lab)")
    args = parser.parse_args()
    OUT_DIR, OUT, FIGURE_DIR = args.out, args.out / "lab_summary.json", args.out / "figures"
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    summary = {
        "schema_version": 1,
        "provenance": {
            "source": "okcupid_profile_intelligence.ipynb saved outputs",
            "notebook_sha256": hashlib.sha256(NOTEBOOK.read_bytes()).hexdigest(),
            "contents": "Aggregate findings only. No profile, essay or row level record.",
            "figures": figures(),
        },
        "overview": overview(),
        "segments": segments(),
        "models": models(),
        "similarity": similarity(),
        "fairness": fairness(),
    }
    text = json.dumps(summary, indent=2, ensure_ascii=False) + "\n"
    OUT.write_text(text)
    (OUT_DIR / "lab_summary.sha256").write_text(hashlib.sha256(text.encode()).hexdigest() + "\n")
    print(f"Wrote {OUT} ({len(text)} bytes)")


if __name__ == "__main__":
    main()
