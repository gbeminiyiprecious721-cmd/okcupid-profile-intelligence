# Profile Intelligence application

An interactive companion to the notebook in the parent folder. It runs locally: Profile Discovery searches a pool of invented profiles with two methods, and the Data Science Lab shows the notebook's verified findings. It is for demonstration only. A live copy runs at https://profile-intelligence.onrender.com, on Render's free plan.

**Profile Discovery.** Write a fictional profile and see the most similar fictional profiles, each with an explanation, comparing TF-IDF with sentence embeddings.

**Data Science Lab.** The notebook's validated results, shown interactively: segments, model performance, fairness checks and an educational demonstration of the drinking classifier.

The application never shows a real profile. Discovery searches a pool of invented profiles, and the Lab shows aggregate results only.

## Stack

React, TypeScript and Tailwind CSS in the browser. FastAPI (Python) on the server, reusing the methods and package versions from the notebook.

## Layout

```
backend/    FastAPI service, offline build scripts and tests
content/    synthetic profiles, their datasheet and validation report, and the generator's inputs
frontend/   React, TypeScript and Tailwind CSS project built with Vite
planning/   architecture, design system, synthetic data rules, plan, design preview
```

## Documents

1. [Architecture](planning/01_architecture.md)
2. [Pages, journey and design system](planning/02_ux_and_design_system.md)
3. [Synthetic demonstration profiles](planning/03_synthetic_profiles.md)
4. [Dependencies, implementation plan and decisions](planning/04_implementation_plan.md)
5. [Design preview](planning/design_preview.html), a static page to open in a browser

## Run it locally

You need Node.js (current LTS, see `frontend/.nvmrc`) and Python 3.12.

```
# Terminal 1: the API (public mode is the default)
cd app/backend
python3 -m venv .venv
.venv/bin/pip install -r requirements_dev.txt
.venv/bin/python scripts/download_model.py       # once: the embedding model, about 90 MB
.venv/bin/python scripts/build_search_index.py   # a few seconds: embeddings and TF-IDF for the synthetic pool
.venv/bin/python -m uvicorn profile_api.main:app --port 8000

# Terminal 2: the web app, on http://localhost:5173
cd app/frontend
npm install
npm run dev
```

Without the build step the API still starts, with discovery switched off. Interactive API documentation is at
`http://127.0.0.1:8000/api/docs` while developing.

Checks:

```
cd app/backend && .venv/bin/ruff check . && .venv/bin/python -m pytest
cd app/frontend && npm run check        # types, lint, unit tests, production build
cd app/frontend && npx playwright test  # browser tests with accessibility scans, uses installed Chrome
```

## API (version 1)

All paths start with `/api/v1`. Every error has the shape `{"error": {"code", "message", "details"?}}`, and no error ever repeats what you sent.

| Method and path | What it does |
|---|---|
| GET `/health` | liveness, mode and version |
| GET `/meta` | mode, which features are on, the pool, limits and the allowed answers for each lifestyle field |
| GET `/examples` | six invented starter profiles (not part of the searchable pool) |
| POST `/discover/similar` | the 1 to 10 nearest profiles in the synthetic pool for a fictional profile |
| GET `/discover/profiles/{id}` | one invented profile in full |
| GET `/lab/summary`, GET `/lab/figures/{name}` | the verified aggregate findings and two notebook figures |
| GET `/classify/examples`, POST `/classify/predict` | the drinking classifier demonstration, on fixed fictional examples, local mode only (public mode refuses) |

`POST /discover/similar` takes `text` (up to 2,000 characters, at least 3 words once links and contact details are removed),
optional `answers`, `method` (`embeddings`, `tfidf` or `both`, default `both`) and `k` (1 to 10, default 5).

* **Ranking uses the text only.** The lifestyle answers never change the order. They are used for the explanation.
* **The two methods are never merged.** Each has its own list and its own score, because cosine similarity on TF-IDF vectors and on embeddings lies on different scales. Compare ranks within a method, not numbers across methods.
* **Each neighbour carries** an anonymous identifier, a display handle, the score, nine lifestyle answers, the answers you share (with how common each is in the pool), shared words and word pairs, themes and shared themes. It never carries profile text.
* **Nothing you type is stored, logged or returned.** Links, emails, handles and phone numbers are removed first, and only counts are reported.

## Regenerating the pieces

```
cd app/backend
.venv/bin/python scripts/generate_synthetic_profiles.py     # deterministic, writes content/synthetic/profiles.json
.venv/bin/python scripts/validate_synthetic.py --real-essays ../../profiles.csv   # author only: needs the private data file
.venv/bin/python scripts/build_search_index.py              # writes artifacts/ (git ignored)
.venv/bin/python -m profile_api.export_openapi ../frontend/openapi.json   # then: cd ../frontend && npm run gen:api
```

The API reads `PROFILE_APP_MODE`. `public` is the default and the only mode that may be deployed. `local` is for features
that use files derived from the real profiles, none of which exist yet. Public mode refuses to start if a real data folder
is configured, and the search only ever loads artifacts built from the synthetic pool.

## Status

Phases 1 and 2 (architecture and application shell) are written. Phase 3 (synthetic profiles and the search API) is written and awaiting review. See [the plan](planning/04_implementation_plan.md).

## Classification demonstration (local mode only)
The page at `/lab/classify` needs a model fitted on the real profiles, so it works only in local mode with files that stay on your computer.

```
cd app/backend
.venv/bin/python scripts/export_classifier.py            # one fit, about a minute, writes artifacts/tier1/ (git ignored)
PROFILE_APP_MODE=local PROFILE_TIER1_ARTIFACT_DIR=artifacts/tier1 .venv/bin/python -m uvicorn profile_api.main:app --port 8000
```
Public mode refuses the classifier endpoints and never loads the files. See `planning/phase6_export_and_test_report.md`.

## Running in production (public mode)
```
cd app/backend
PROFILE_APP_MODE=public PROFILE_ALLOWED_ORIGINS='["https://your.site"]' \
  .venv/bin/python scripts/check_production_config.py        # 18 checks, must all pass
PROFILE_APP_MODE=public PROFILE_ALLOWED_ORIGINS='["https://your.site"]' \
  .venv/bin/python -m uvicorn profile_api.main:app --no-server-header --no-access-log
cd ../frontend && npm run build && npm run headers           # serve dist/ with these headers, over https
```
`--no-access-log` matters: uvicorn's default log writes every URL. The API serves no documentation in public mode, limits requests per client (set `PROFILE_RATE_LIMIT_*`, and `PROFILE_TRUST_PROXY=true` only behind a proxy you control), and never loads files derived from the real profiles. See `planning/phase7_security_audit.md`.

Checks: `scripts/audit_exposure.py --real-essays ../../profiles.csv` (nothing served matches a real essay), `scripts/measure_performance.py`, and in the frontend `npx playwright test -c playwright.prod.config.ts` (production build with the policy), `-c playwright.browsers.config.ts` (WebKit and Firefox) and `-c playwright.local.config.ts` (classifier, local mode).

## Deployment preparation
The live service is built from `deploy/Dockerfile.render`. The documents in `deploy/` cover the security configuration (`security_configuration.md`), releases and rollback (`operations_and_rollback.md`), monitoring (`monitoring.md`) and the VoiceOver checklist (`voiceover_checklist.md`). Build the allowlisted bundle with `backend/scripts/make_deploy_bundle.py`. Check a running deployment with `backend/scripts/smoke_test.py`.
