# Synthetic profiles: datasheet

**What it is.** 800 invented dating profiles (the search pool) and 6 invented starter profiles, in `profiles.json`. Every profile carries `is_synthetic: true`. The application refuses to load a pool in which any profile lacks that flag.

**Why it exists.** No source says that the people behind the real profiles agreed to this use, so the application never shows them. The pool lets visitors try the similarity methods on people who do not exist.

**How it was made.**
* Text is composed from 168 hand written theme sentences and 22 generic openers and closers (`spec/theme_bank.json`). Twelve themes: travel, cooking, music, fitness, outdoors, books, technology, family, humour, creative work, volunteering, pets. A profile has a main theme and one or two others, and holds 40 to 153 words.
* Lifestyle answers for nine fields are sampled from `spec/answer_model.json`. **Those frequencies are illustrative and hand chosen.** They are anchored only to the headline figures the notebook prints (the most common answer and the missing rate for each field). No row level data was read to build them, and they do not describe the real profiles.
* A few small links between a theme and an answer exist (for example a pets profile is more likely to like dogs). They are listed in the same file so that nothing hidden drives similarity.
* The generator (`app/backend/scripts/generate_synthetic_profiles.py`) is deterministic: the same inputs give a byte identical file. The seed is 42.
* Handles are two common words ("Quiet Cartographer"). Identifiers are random looking hashes, so the order and the name say nothing about content.

**What it is not.** It is not evidence. The pool is built from a theme bank, so it is cleaner and more clustered than real profiles, and a search on it looks better than a search on real data would. The evidence about real profiles is in the notebook and the Lab.

**Not included, by design.** Names, places, contact details, digits, age, sex or gendered words, orientation, religion, ethnicity, and any mention of drinking, smoking or drugs.

**Validation** (`validation_report.json`, written by `scripts/validate_synthetic.py`). Counts only.
* Schema, unique identifiers and handles, answers inside their allowed lists.
* No contact details, no digits, none of the 162 first names from the notebook's list, none of the sensitive, gendered or substance words in the script.
* No two profiles share more than 49.3% of their five word phrases (the limit is 50%).
* **No run of seven consecutive words occurs in any of 441,351 real essays** (18,207,860 distinct seven word windows were checked, locally, and nothing from the essays is stored). Shorter runs do occur: 4,753 of 63,452 five word windows (7.5%) also appear in real essays, because they are everyday phrases. Five words is reported for information only.
* Four seven word windows that coincided with real text by accident are listed in `spec/blocked_windows.txt`. They are phrases of our own, and the generator will not produce a profile that contains one.

**Reproduce.** From `app/backend`: `.venv/bin/python scripts/generate_synthetic_profiles.py`, then `.venv/bin/python scripts/validate_synthetic.py --real-essays ../../profiles.csv` (the second step needs the private data file, so only the author can run it).

**Licence.** Original work, released under the repository's MIT licence.
