# Synthetic demonstration profiles

Status: requirements for review (Phase 1). No profile has been generated yet.

## Why a synthetic pool

Discovery needs profiles to search. The only real ones are the 59,946 scraped profiles, and their authors did not agree to this use. Showing their text, their answers or even their embeddings in a public application would be the wrong kind of reuse. A pool of invented profiles lets the application demonstrate the method with no link to any real person.

## What the pool is and is not

* **It is** an illustration of how similarity search and explanations work.
* **It is not** evidence. The evidence that the method finds similar real profiles is in the notebook (Section 11) and the Lab. Because the pool is built from a theme bank, its clusters are cleaner than real life. Every Discover page says "Fictional profiles, illustration only" and links to the evidence.

## Requirements

### Privacy and provenance

1. **No real text.** Essay text is written by hand from a theme bank. No sentence is copied, paraphrased or generated from real essays, and no real essay is shown to any writer or generator.
2. **No overlap with real essays.** The notebook audit method is repeated: every window of seven words in the synthetic text is searched in the real essays on the local machine. The required result is zero hits. The check runs locally, and only its result (the count) is committed.
3. **No personal names, places or contact details.** Display handles are made from two common words ("Quiet Cartographer"), never from a first name. Locations are generic ("a coastal city"). The notebook's personal names list is checked against every synthetic text, and the notebook's email, phone, handle and link patterns must find nothing.
4. **Structured answers come from published aggregates only.** Answer frequencies are taken from aggregate tables the notebook already prints, rounded, with any cell under 100 users merged into "other". No row level data is read to build the pool.
5. **No sensitive fields.** Orientation, religion, ethnicity and sex are not in the schema.
6. **A fixed flag.** Every profile has `is_synthetic: true`. The API refuses to return a profile without it, and a test enforces this.

### Realism and usefulness

7. **Size.** 600 to 1,000 profiles. Enough for varied neighbours and a meaningful TF-IDF, small enough to commit and review.
8. **Themes.** About 12 themes (for example travel, cooking, music, fitness, outdoors, books, technology, family, humour, creative work, volunteering, pets). Each profile draws one main and one or two minor themes.
9. **Length.** 40 to 200 words per profile, similar to the median real essay length reported in the notebook. Some short profiles, so that thin text is represented.
10. **Varied voice.** Each theme has several phrasings and sentence shapes so that profiles do not repeat templates. A test measures near duplicate rates.
11. **Answers vary independently of theme,** apart from a small documented link where it is natural (a "cooking" profile is somewhat more likely to answer a diet question). Links are listed in the spec file so that nothing hidden drives similarity.
12. **Blank answers exist,** at rates taken from the published missing value percentages.
13. **Fixed seed.** The generator is deterministic. The same inputs always give the same file.

### Format and review

14. **Committed source of truth:** `content/synthetic/profiles.json`, plus the generator spec (theme bank, aggregate frequencies, link rules) and a short datasheet describing how the file was made.
15. **The search index is not committed.** It is rebuilt locally by `build_search_index.py` (embeddings plus TF-IDF), which takes seconds at this size.
16. **Human review.** The author reads a random sample of at least 50 profiles before the pool is approved.
17. **Licence.** The synthetic content is original work under the repository's MIT licence.

## Fields

| Field | Type | Source |
|---|---|---|
| `id` | string | generated |
| `handle` | string | two word combination |
| `is_synthetic` | always true | fixed |
| `text` | string, 40 to 200 words | theme bank |
| `themes` | list of theme names | generator |
| `answers` | smokes, drugs, diet_type, education_level, job, offspring, pets, status, body_type | aggregate frequencies |

The nine answer fields are the same nine lifestyle fields used in the notebook's similarity evaluation, so the explanations match what was measured. The drinking answer is left out of the form and the pool, because the Lab's classifier predicts it.

## Visitor input

* Visitor profiles are never added to the pool and never stored.
* The form uses the same nine fields, all optional, and the same cleaning rules as the notebook.
* A visitor can start from one of six committed starter profiles (flagged synthetic) or type their own text.

## Acceptance checks (Phase 3)

* Seven word overlap with real essays is zero (local check, count recorded).
* No match for any personal name, email, phone, handle or link pattern.
* Every profile has `is_synthetic: true` and passes schema validation.
* Near duplicate rate below an agreed limit.
* A reviewed sample of 50 profiles is approved by the author.
* Re running the generator gives a byte identical file.
