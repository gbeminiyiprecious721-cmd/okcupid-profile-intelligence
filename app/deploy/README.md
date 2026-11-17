# Phase 8A: private staging deployment preparation

> **Revised 16 November 2026.** Creating a Docker Space on Hugging Face needs a paid plan (PRO), and a private Space has no public address. The Hugging Face parts of this document are superseded by [`staging_options.md`](staging_options.md). Statements below that call a Space free, or say to open its direct address, are wrong.

**Status: prepared, not deployed.** No cloud resource exists, nothing was bought, nothing was committed or pushed, and the GitHub repository is still private. Public deployment is not authorised.

## Contents
| File | What it is |
|---|---|
| `staging_review.md` | **Phase 8C: the final staging review**: Tailscale decision and permissions, functionality, accessibility, Firefox, privacy, performance, problems fixed, public launch blockers |
| `run_firefox_linux.sh` | runs the browser tests and a standalone axe runner in Firefox on Linux, in a container, against the staging container |
| `local_staging.md` | **Phase 8B: the zero cost local staging that is running now**: address, results, privacy findings, Tailscale steps |
| `run_local_staging.sh` | starts the image strictly, on this computer only |
| `staging_options.md` | **the current staging recommendation**: verified Hugging Face requirements, no payment options, exact commands and permissions |
| `hosting_comparison.md` | seven hosting options compared, the recommended architecture, estimated costs, free tier limits, sources |
| `security_configuration.md` | HTTPS, HSTS, CSP, CORS, headers, rate limiting and proxy settings, environment variables, how to verify |
| `monitoring.md` | privacy safe uptime and error monitoring design |
| `operations_and_rollback.md` | release naming, pre flight list, the 13 step staging plan, rollback per platform, first run risks |
| `voiceover_checklist.md` | manual VoiceOver checks for Mac Safari and iPhone, with a results table |
| `Dockerfile`, `.dockerignore` | the container definition (written, **not yet built**: Docker is not installed on this computer) |
| `templates/` | a Hugging Face Space README and a Fly.io example, both unused |
| `ci/` | two draft GitHub Actions files (Firefox on Linux, scheduled smoke test), **inactive** because they are outside `.github` |
| `security_headers_reference.txt` | the header set, for a host that needs them entered by hand |

## Recommendation in one paragraph
Build **one stateless container that serves both the API and the web application on one origin**, with the model and search index baked in at build time and a single worker. Run **staging first on this computer, sharing it privately with Tailscale** (free, no card, see `staging_options.md`), and optionally rehearse on a **private Cloud Run service**. A private Hugging Face Docker Space is not free: it needs a PRO plan ($9 a month). Decide the **public host later**, between Fly.io (about $6.70 a month for 1 GB always on, much less with auto stop) and Google Cloud Run (can be $0 at low traffic), running the same image. Estimated ongoing cost: **$0 for staging, $0 to $5 for a quiet public demo, $7 to $20 for an always warm one.** Prices changed in 2026 and my sources disagree, so verify before creating anything.

## What I tested (all on this computer, no cloud)
| Task | Result |
|---|---|
| **Clean room test of `download_model.py` and the Tier 0 build** (new virtual environment, empty model cache, only the files git would deploy) | Found a real bug: the script downloaded only the files the app needs, but the app then demanded the full model snapshot, so a clean machine said "not in the local cache". It had always worked here because my cache held the full model. Fixed: one shared definition of the file patterns and the pinned revision (`1110a243...`), plus tests. After the fix: install 31 s (1.2 GB of packages), model download 9 s (87 MB), index build 13 s, 264 tests pass, production config check 18 of 18 |
| **Run from the bundle alone** (the Dockerfile's steps, without Docker) | Found a second real gap: the app reads `spec/answer_model.json` at start up and the allowlist missed it. Fixed and guarded by a test. Then: index built offline, config check 17 of 17, server started at **613 MB**, **22 of 22 smoke checks pass**, request log holds no input |
| **Nothing private can enter a deployment** | The bundle is built from an explicit **allowlist** (75 files, 1.7 MB), then refused if it holds a data, model, notebook or environment file, a Tier 1 folder, a file whose SHA 256 equals profiles.csv or any Tier 1 file (so a renamed copy is caught), a local path, a private key or a token, or if it is oversized. 22 tests, including a pretend repository full of decoys and the real repository. Private files are listed by name in `.dockerignore` as a second lock |
| **Firefox** | Still cannot run here. Playwright's Firefox (and the newer build from its pre release channel) fail at start up with "Could not find profile folder" plus a macOS sandbox "Operation not permitted" message, with new profiles, other folders, sandbox switches off and a re download. It looks like an incompatibility with this macOS build (27.2), not a project problem. WebKit and Chrome run fine. The fix is to run Firefox on Linux: a ready draft is `ci/browsers.yml` (needs your approval to use, because it runs on GitHub after a push) |
| **Backend tests** | 325 pass, 1 skipped |

New application features built for this phase (all tested): the container can serve the built web app itself with the right headers, caching and safe paths (18 tests); a privacy safe request log and an `X-Request-ID` header (8 tests); a configurable proxy depth for the rate limiter (2 tests); `scripts/smoke_test.py` (22 checks) and `scripts/summarise_logs.py`.

## Outstanding blockers before staging can run
1. **The Dockerfile has never been built.** The steps were proven in a clean room, but the first build on the host may need a fix. Plan for it.
2. **Approvals needed** (each creates something outside this computer): a Hugging Face account and token, creating the private Space, pushing the bundle to it. The GitHub repository stays private and untouched.
3. **Proxy depth is unknown for Hugging Face.** The rate limiter must see real client addresses, so the first staging task is a two network test. Until then keep `PROFILE_TRUST_PROXY` off or accept that all visitors share one limit.
4. **Hugging Face specifics I could not confirm** from official text: that free private Spaces have no extra restriction, the builder's size and time limits, and exact sleep behaviour. Check the Space settings page before pushing.
5. **A real screen reader pass** (`voiceover_checklist.md`) and **Firefox on Linux** are still to do. Neither blocks staging; both should finish before any public launch.
6. **Pricing is volatile.** Re check the provider pages when you decide on a public host.

## Staging plan, in short (details in `operations_and_rollback.md`)
Pre flight checks here, then: account and token, private Space, push the bundle with the Space README, watch the first build, open the direct address, run the smoke test with the token, confirm client addresses with two networks, read the platform's logs, run the VoiceOver checklist, measure a cold start, rollback drill, staging report. Then stop and ask about a public deployment.
