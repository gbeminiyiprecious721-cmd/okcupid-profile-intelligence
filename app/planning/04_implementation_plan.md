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
