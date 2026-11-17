# Dependencies, implementation plan and decisions

Status: proposal for review (Phase 1). Nothing has been installed.

## What the machine has today

| Item | State |
|---|---|
| Python 3.12 virtual environment `.venv` | present, with numpy, pandas, scikit learn, scipy, joblib, torch, safetensors, pydantic and httpx already installed and pinned |
| FastAPI, Uvicorn, pytest | not installed |
| Node.js and npm | **not installed**. The frontend cannot be created or built until it is. |

## Backend dependencies

Runtime packages already pinned in the root `requirements.txt` are reused at the same versions, so the application computes what the notebook computed.

| Package | Role | Status |
|---|---|---|
| numpy, scipy, scikit learn, joblib | vectors, TF-IDF, cosine search, loading the classifier | already pinned |
| sentence-transformers, torch, transformers, huggingface_hub | query embeddings with `all-MiniLM-L6-v2` | already pinned |
| safetensors | model weight format | already installed |
| pydantic | request and response schemas | already installed |
| **fastapi** | web framework and OpenAPI contract | new |
| **uvicorn** | server | new |
| **pydantic-settings** | typed configuration from environment variables | new |
| **slowapi** | rate limiting | new, added in Phase 7 |
| **pytest** | tests | new, development only |
| httpx | test client | already installed |
| **ruff** | lint and format | new, development only |
| **pip-audit** | dependency vulnerability check | new, development only |

Not needed, deliberately: a database, an ORM, a task queue, a cache server, an LLM client.

Exact versions are chosen and pinned at install time, after checking the current releases, in `app/backend/requirements.txt` and `requirements_dev.txt`.

## Frontend dependencies

| Package | Role | Why this one |
|---|---|---|
| react, react-dom | UI | requested |
| typescript | types | requested |
| vite and the React plugin | build and dev server | fast, simple, no framework lock in |
| tailwindcss with its Vite plugin | styling | requested |
| react-router | pages and navigation | standard |
| @tanstack/react-query | fetching, caching, loading and error states | removes hand written request state |
| @radix-ui primitives (tabs, dialog, select, tooltip) | accessible behaviour | keyboard and focus handled correctly |
| motion | the thread animation and drawer | small, supports reduced motion |
| recharts | Lab charts | declarative, themeable, SVG output |
| lucide-react | icons | consistent, tree shakeable |
| clsx, tailwind-merge | class composition | small |
| @fontsource-variable/fraunces, @fontsource-variable/public-sans | self hosted fonts | no third party requests |
| openapi-typescript | types generated from the FastAPI contract | one source of truth |

Development and test: vitest, @testing-library/react, @testing-library/user-event, jsdom, eslint with typescript-eslint, prettier, playwright and @axe-core/playwright (end to end and accessibility).

Exact versions are chosen and pinned at install time. The Node version is the current LTS release, recorded in `.nvmrc`.

## Phases

Each phase ends with a review. Nothing in a later phase starts without approval.

| Phase | Scope | Done when |
|---|---|---|
| **1. Architecture and planning** (this one) | Documents, folder skeleton, design preview, feature branch | You approve the plan and the open decisions |
| **2. Development setup and app shell** | Install Node (with your approval). Create the Vite project. Install the backend packages. FastAPI `/health` and `/meta`. Design tokens, fonts, AppShell, navigation, routing, empty pages. Generated API types. | Both servers run locally, shell passes axe, tests run |
| **3. Synthetic profiles and search backend** | Generator, the 600 to 1,000 profiles, privacy checks, `build_search_index.py`, embedding, TF-IDF and similarity services, `/discover/similar`, parity tests | Acceptance checks in 03_synthetic_profiles.md pass, API contract tests pass |
| **4. Profile Discovery experience** | Profile form, starter profiles, results, threads, explanation drawer, method comparison, error and empty states | One full journey works by keyboard and on a phone width |
| **5. Data Science Lab** | `export_lab_data.py` from the notebook's saved outputs, Lab API, charts with table views, segments, models, fairness | Every number on screen matches the notebook text output |
| **6. Classification demonstration** | Export of the drinking pipeline and segment model by re running the notebook code unchanged, `/lab/classify`, demo page | Exported model reproduces test macro F1 0.386 and baseline 0.212; privacy review of the artifact |
| **7. Hardening and polish** | Accessibility audit, performance, rate limits, security headers and CSP, dependency audit, README and screenshots | Checklist in this file passes |
| **8. Deployment** | Separate approval. Hosting choice, public mode only, monitoring | Not planned in detail yet |

### Phase 2 checks

* The notebook SHA 256 is unchanged.
* `GET /api/v1/health` answers locally. The frontend shows the navigation and every route without errors.
* Lint, type check and tests pass on both sides.
* No dependency outside the lists above is installed.

## Decisions for you

Each has my recommendation. Please confirm or change each one.

1. **Discovery searches synthetic profiles only.** Recommended. The alternative, searching real profiles, cannot be public and would expose derived personal data.
2. **The drinking classifier demo.** Recommended: export the validated pipeline for local use only, never commit it, and keep it off in public mode until a privacy review of its vocabulary passes. This needs a re run of the notebook's training code (about 16 minutes). It is not a retrain with new settings, and it needs your approval in Phase 6.
3. **Query embedding with torch** in the first version, to match the notebook exactly. A lighter ONNX runtime can be considered for deployment.
4. **The application lives in `app/` in this repository.** The alternative is a second repository.
5. **Charts extend the palette with one cool teal** so that six categories stay distinguishable. The alternative is to use only the brand colours and rely on patterns, which is harder to read.
6. **Install Node with Homebrew or nvm** in Phase 2. I will ask again before doing it.
7. **Application name.** Working title: "Profile Intelligence". Tell me if you prefer another.

## Risks

| Risk | Effect | Response |
|---|---|---|
| Some chart data exist only inside the notebook's images (segment drinking shares, validation bars) | Lab charts could not be rebuilt natively | Read the printed tables where they exist. Where they do not, show the notebook's own image with a text alternative. Do not re run or change the notebook. |
| Synthetic pool looks more clustered than real data | Visitors over estimate the method | Illustration labels on every page and a direct link to the real evidence |
| `torch` makes deployment heavy | Slow start, high memory | Decide in Phase 8. ONNX is a known option with a parity test. |
| Visitors type real personal details anyway | Privacy harm | Detection and removal, warning, nothing stored or logged |
| Classifier artifact reveals vocabulary from real profiles | Privacy harm | Local only, hash manifest, public mode disables it, review before any change |
| Scope grows | Late and unfinished | Phases end in review, features outside this plan wait for a new decision |

## Working rules for all phases

* Work on feature branches. Nothing is pushed or deployed without your explicit approval.
* The notebook, its saved outputs and `profiles.csv` are never modified.

## Changes made in Phase 2

* **Navigation is a sidebar plus a top bar,** as requested, instead of a top bar with Lab tabs. The sidebar lists every page along a gold thread. The top bar holds the mode badge, service status and theme control. On small screens the sidebar becomes a drawer.
* **Dark theme added.** Each colour is defined once for light and dark. Dark contrast was measured: body text 16.1:1, controls 4.8:1.
* **TypeScript is 5.9.3, not 7.** The linter (typescript-eslint) and the type generator (openapi-typescript) do not support TypeScript 6 or 7 yet.
* **The backend has its own virtual environment** in `app/backend/.venv`, so the notebook's environment stays untouched. The machine learning packages join it in Phase 3 at the versions pinned in the root `requirements.txt`.
* **`httpx` stays at 0.28.1.** The test client prints a deprecation warning that suggests `httpx2`. That package is not on the approved list, so it was not installed.
* **Eight routes, not six.** Home, Discovery, Lab overview, Segments, Models, Fairness, Classify and About.

## Changes made in Phase 3

* **The answer frequencies are illustrative, not published aggregates.** Phase 1 said they would come from aggregate tables the notebook prints. The notebook only prints the most common answer and the missing rate for each field, so the rest are hand chosen. This is safer: no row level data was read to build the pool. It is recorded in the datasheet.
* **The seven word overlap check needed a blocklist.** The first pool had 849 matching windows with real essays, from stock phrases such as "I am a work in progress and". Sentences were rewritten, and the few accidental cross sentence windows left are blocked in the generator. The check now finds zero.
* **The search returns two separate result lists** (embeddings and TF-IDF), each with its own score, instead of one list. The scales differ, so the numbers are never combined.
* **The index is built, not trained.** `NearestNeighbors` is fitted from the stored matrices when the server starts, which takes milliseconds. TF-IDF is fitted on the synthetic pool at build time with the notebook's settings except `min_df` (3 instead of 10, because the pool is 800 profiles, not 48,553 users).
* **Hyphenated phone numbers are not counted as removed.** The notebook's phone rule needs a space or dot between digit groups and parity keeps it. Digits are dropped by the letters only rule anyway, so nothing numeric reaches the search.
* **The classifier and segment assignment are untouched.** No supervised model was retrained, exported or loaded.

## Changes made in Phase 4
Discovery page connected to the API (form, method switch, result cards, explanations, profile dialog, two profile comparison, skeletons, error states, gold thread layer). `/meta` gained `answer_shares`. Inverse frequency weighting is documented in `app/frontend/src/lib/weighting.ts` and in `phase4_test_report.md`. Two lists sit side by side from 1536px and become tabs below that.

## Changes made in Phase 5
Lab pages built from `content/lab/lab_summary.json`, produced by `backend/scripts/export_lab_data.py` from the notebook's saved outputs and served by `GET /api/v1/lab/summary` and `GET /api/v1/lab/figures/{name}`. A new page `/lab/similarity` was added. Charts are HTML and SVG with no chart library. See `phase5_test_report.md`.

## Changes made in Phase 6
Educational classification page (`/lab/classify`), tier 1 classifier export (`scripts/export_classifier.py`), classifier service and endpoints (`/api/v1/classify/examples`, `/predict`, local mode only), fictional inputs in `content/classifier/fictional_inputs.json`, `pandas` added to the backend. See `phase6_export_and_test_report.md`.

## Changes made in Phase 7
Rate limiting, documentation off in public mode, origin validation, extra headers, route level code splitting, a web application Content Security Policy, httpx2, an npm override for an advisory, focus and layout fixes, a production configuration checker, an exposure audit, a performance measurement script, and new browser suites (CSP on the production build, accessibility, WebKit, performance). See `phase7_security_audit.md`.

## Changes made in Phase 8A
Deployment preparation only, nothing deployed: `app/deploy/` (hosting comparison, security configuration, monitoring, VoiceOver checklist, operations and rollback, Dockerfile, templates, draft CI), an allowlist bundle builder, a smoke test, a log summary, single origin web serving, a privacy safe request log, a configurable proxy depth, and a fix to the model download (found by a clean room test).
