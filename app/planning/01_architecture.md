# Architecture

Status: proposal for review (Phase 1). Nothing described here is built yet.

## What the application is

An interactive companion to the notebook. It has two parts.

* **Profile Discovery.** A visitor writes a fictional profile and sees the most similar fictional profiles, each with a plain explanation. Two search methods can be compared side by side.
* **Data Science Lab.** The validated results from the notebook, shown interactively: segments, model performance, fairness checks and an educational demonstration of the drinking classifier.

The notebook stays the source of truth. The application reads its results and reuses its methods. It never changes them.

## Boundaries that shape every decision

1. **No real profile ever reaches the browser.** Not text, not rows, not embeddings of real users. Discovery searches a pool of synthetic profiles (see 03_synthetic_profiles.md).
2. **The notebook and its saved results are not modified.** Its SHA 256 is recorded before and after each phase.
3. **Nothing is retrained to build the application.** Where a model must be exported (the drinking classifier), that is a separate, approved step that re runs the notebook's own code with the same seed and proves it reproduces the published scores.
4. **No generative model.** Text is only embedded and counted. This removes the prompt injection risk class entirely.
5. **Stateless.** No database, no accounts, no stored input, no cookies, no analytics.

## System overview

```
 Browser: React + TypeScript single page app
   |  JSON over HTTPS, /api/v1, no cookies
   v
 FastAPI service  (profile_api)
   routers   thin: validate, call a service, return a schema
   services  embedding, tfidf, similarity, explain, lab_data, classify, segments
   ml        notebook functions copied verbatim (clean_text and others)
   security  input limits, personal detail guard, headers
   |
   |  read only, loaded once at startup, hash checked
   v
 Artifacts
   Tier 0 (public, committed or rebuilt from committed files)
     synthetic profiles, search index, lab summary JSON, MiniLM model files
   Tier 1 (derived from the real data, local only, never committed)
     drinking pipeline, segment model
   Tier 2 (never leaves the notebook machine)
     profiles.csv, essays, embeddings of real users

 Offline build scripts (run by hand, never at request time)
   export_lab_data, generate_synthetic_profiles, build_search_index, export_models
```

## Repository layout

```
app/
  README.md
  planning/                   planning documents and the design preview
  backend/
    profile_api/
      main.py                 application factory and startup loading
      config.py               settings from environment variables
      routers/                health, meta, discovery, lab
      schemas/                Pydantic request and response models
      services/               one module per capability
      ml/                     notebook functions, copied verbatim
      security/               limits, personal detail guard, headers
    scripts/                  offline builders (see below)
    tests/                    unit, contract and parity tests
    artifacts/                generated files, git ignored
  content/
    synthetic/                generator spec, theme bank, committed profiles
    lab/                      lab_summary.json exported from the notebook
  frontend/                   Vite project, created in Phase 2
```

Choices and reasons:

* **One repository, one `app/` folder.** The notebook remains at the root as the evidence. A reader sees the analysis and the application together.
* **The folder is called `content`, not `data`,** because the existing ignore rules exclude any folder named `data`.
* **Python code lives in a package called `profile_api`,** run from `app/backend`. Dependencies are pinned in the same style as the root `requirements.txt`.

## Backend design

Layers, in the order a request passes through them:

1. **Router.** Parses the request into a schema and returns a schema. No logic.
2. **Service.** One capability each. Services are plain functions that receive their artifacts as arguments, so they test without a server.
3. **ML helpers.** Copies of notebook functions. A parity test extracts the notebook's own source for each one (using `ast`) and checks that both give identical output on invented strings. If the notebook ever changes, the test fails and shows it.

Startup loads everything once into `app.state` and refuses to start if a required artifact is missing or its hash differs from the manifest. A missing optional artifact (Tier 1) disables only that feature, and the API reports this in `/meta`.

### Modes

| Setting | `APP_MODE=local` | `APP_MODE=public` |
|---|---|---|
| Discovery on synthetic pool | on | on |
| Lab pages from `lab_summary.json` | on | on |
| Drinking classifier demo | on if the artifact exists | off |
| Assign a fictional profile to a segment | on if the artifact exists | off |

`public` is the only mode that may be deployed, until a privacy review of the Tier 1 artifacts passes (see 04_implementation_plan.md, decision 2).

## API contract (version 1)

All paths start with `/api/v1`. Errors use one shape: `{"error": {"code": "...", "message": "..."}}`.

| Method and path | Purpose | Notes |
|---|---|---|
| GET `/health` | liveness and artifact versions | no secrets |
| GET `/meta` | limits, answer options, feature availability, caveats | the frontend builds its form from this |
| GET `/examples` | six starter fictional profiles | each marked `is_synthetic: true` |
| POST `/discover/similar` | similar synthetic profiles with explanations | body: `text`, `answers`, `method` (`embeddings`, `tfidf`, `both`), `k` (1 to 10) |
| GET `/discover/profiles/{id}` | one synthetic profile in full | for the detail view |
| GET `/lab/overview` | headline results and provenance | notebook hash, run date |
| GET `/lab/segments` | six segment profiles and stability numbers | |
| GET `/lab/models` | validation table and the single test result | every number labelled `validation` or `test` |
| GET `/lab/similarity` | agreement above chance for nine fields | proxy evaluation, labelled as such |
| GET `/lab/fairness` | subgroup scores on the test set | with group sizes |
| POST `/lab/classify` | educational drinking demo | probabilities for four groups, base rates, uncertainty note |

The OpenAPI document that FastAPI generates is the contract. The frontend types are generated from it, so the two cannot drift.

### `/discover/similar` in detail

* **Ranking uses the text only.** This is the method that was evaluated in notebook Section 11. The lifestyle answers a visitor selects do not change the ranking. They are used for the explanation, exactly as in Section 15.2 of the notebook, and the form says so.
* **Each result carries:** rank, score, display handle, `shared_answers` (fields where both profiles give the same answer), `shared_terms` (words from the visitor's own text that also matter in the candidate), `themes`, and the standing note that the score measures similar writing, not compatibility.
* **With `method: both`,** the response adds a comparison block: the two top lists, the overlap count and which profiles only one method found.

### `/lab/classify` in detail

* The input is the same fictional profile.
* The output is the probability for each of the four drinking groups next to the base rate of each group, the predicted group, and the published recall and precision for that group.
* **Contributions shown are only for words the visitor typed.** The vocabulary of the model is never returned.
* The page states that this is an educational demonstration and that the model is wrong for many individuals.

## How the existing models connect

| Notebook component | Application service | Artifact | How it is produced | Tier | Proof of equivalence |
|---|---|---|---|---|---|
| `clean_text` (cell 89) | `ml/text_cleaning.py` | none | copied verbatim | 0 | parity test against the notebook source |
| Sentence embeddings, `all-MiniLM-L6-v2` | `services/embedding.py` | model files from the Hugging Face hub, safetensors | downloaded once, then loaded offline | 0 | fixed sentence gives the same vector as the notebook |
| Cosine nearest neighbours (`nearest`) | `services/similarity.py` | search index over synthetic profiles | `build_search_index.py` | 0 | same neighbours as scikit learn `NearestNeighbors` on the same data |
| TF-IDF | `services/tfidf.py` | vectoriser fitted on the synthetic pool | `build_search_index.py` | 0 | settings from Section 8; `min_df` scaled to the pool size and documented |
| Explanations | `services/explain.py` | theme lexicon, nine answer fields | hand written | 0 | unit tests on invented pairs |
| Lab numbers | `services/lab_data.py` | `lab_summary.json` | `export_lab_data.py` reads the notebook's saved outputs | 0 | every number checked against the notebook text; provenance hash stored |
| Segment assignment (`assign_segments`) | `services/segments.py` | PCA, K means, lifestyle encoder | `export_models.py` | 1 | reproduces the notebook's segment check, locally |
| Drinking classifier (`best_pipeline`) | `services/classify.py` | fitted pipeline | `export_models.py` | 1 | reproduces test macro F1 0.386 and baseline 0.212 on the held out test set, locally |

Notes:

* **Why TF-IDF is fitted on the synthetic pool.** A vectoriser fitted on the real essays holds 20,000 words and word pairs taken from private profiles, including names. It would be a Tier 1 artifact. Fitting on synthetic text keeps the search entirely Tier 0.
* **What the demo therefore shows.** It shows the methods working on fictional profiles. The evidence that the methods work on real profiles is in the Lab, from the notebook. Discovery pages say so in one sentence, with a link to the evidence.
* **Query embedding at runtime** uses `sentence-transformers` and `torch`, as in the notebook, so numbers match. A lighter runtime (ONNX) is an option for deployment and would need its own parity test.
* **Loading model files.** Tier 0 and Tier 1 files are produced by this project and checked against a SHA 256 manifest before loading. Nothing is loaded from a visitor, a URL or an unverified path. The classifier is saved with `joblib`, which uses pickle, so the hash check and the local path rule are mandatory. Model weights from the hub are safetensors.

## Security and privacy controls

| Risk | Control |
|---|---|
| Visitor types real personal details | Text is checked on the client and the server with the notebook's patterns (email, phone, handle, link). Matches are removed server side and the visitor is told. A banner asks for invented profiles only. |
| Input stored or leaked | Nothing is stored. Request bodies are never logged. Access logs keep method, path and status only. |
| Oversized or malformed input | Text limit of 2,000 characters, answers validated against fixed lists, `k` limited to 1 to 10, request size cap, control characters removed. |
| Abuse and cost | Rate limit per client address, bounded model concurrency. |
| Cross site and browser risks | CORS allowlist, no cookies, security headers, a strict Content Security Policy, all fonts and scripts served from the same origin. |
| Third party requests | None at runtime. The embedding model runs offline after the first download. |
| Unsafe model files | Hash manifest, local paths only, safetensors for hub weights, `joblib` only for own files. |
| Dependency vulnerabilities | `pip-audit` and `npm audit` in the checks, versions pinned. |
| Sensitive traits | Orientation, religion and ethnicity are absent from the form, the API and the artifacts. Sex is not asked, because the notebook found that writing style already acts as a proxy for it. |
| Over trust in scores | Every score sits next to its limit sentence. Classifier output always shows base rates and uncertainty. |

## Testing strategy

* **Parity tests:** notebook functions against their copies, embedding vectors, classifier scores (local only).
* **Backend:** unit tests for services, contract tests against the OpenAPI document, tests that oversized and malformed input is rejected and that bodies are not logged.
* **Frontend:** component tests, accessibility checks with axe, keyboard walkthroughs, reduced motion checks.
* **End to end:** one Playwright journey per page, run against the local stack.
* **Privacy audit before any publish:** the same checks as the notebook audit (no contact details, no seven word overlap with any essay, no names from the personal names list), run on every committed content file.
