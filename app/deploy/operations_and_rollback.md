# Deployment configuration, release and rollback plan

> **Revised 16 November 2026.** Creating a Docker Space on Hugging Face needs a paid plan (PRO), and a private Space has no public address. The Hugging Face parts of this document are superseded by [`staging_options.md`](staging_options.md). Statements below that call a Space free, or say to open its direct address, are wrong.

Nothing has been deployed. This is the plan to follow, step by step, after approval.

## What a release is
A **release** is one immutable container image built from one bundle (`app/deploy/build/bundle`, 75 files). The bundle's `BUNDLE_MANIFEST.json` lists the SHA 256 of every file in it and is copied into the image at `/app/BUNDLE_MANIFEST.json`, so any running release can be traced to exact files.
- **Name it** `YYYYMMDD-HHMM-<short note>` (or the Git commit once commits are approved), for example `20261120-1400-staging1`.
- **No mutable tags.** Never deploy `latest`. Keep the three most recent releases available.
- **Configuration** is environment variables only (see `security_configuration.md`). There are no secrets, no database and no volume. The container writes nothing.

## Pre flight (on the development computer, before every release)
1. `cd app/backend && .venv/bin/python -m pytest -q` (all pass), `ruff check .`
2. `cd app/frontend && npm run check` (lint, types, 155+ tests, build) and the browser suites for the production build: `npx playwright test -c playwright.prod.config.ts`, `-c playwright.browsers.config.ts --project=webkit`, `-c playwright.local.config.ts`.
3. Audits: `pip-audit` on the backend environment, `npm audit` in the frontend. Zero known vulnerabilities, or a written exception.
4. `cd app/backend && .venv/bin/python scripts/audit_exposure.py --real-essays ../../profiles.csv` (zero matches).
5. `.venv/bin/python scripts/make_deploy_bundle.py` (must print "Bundle written"; it refuses on any private file, hash match, secret or oversize).
6. `PROFILE_APP_MODE=public PROFILE_ALLOWED_ORIGINS='["https://HOST"]' .venv/bin/python scripts/check_production_config.py` (all checks pass).
7. Read `BUNDLE_MANIFEST.json`: 75 files, none you do not recognise.

## Staging deployment steps (private Hugging Face Docker Space)
Each step marked **[approval]** creates something outside this computer and waits for your yes.
1. **[approval]** Create or confirm a Hugging Face account and a write token. Keep the token in your password manager only. Never paste it into a file, a command history or the repository.
2. **[approval]** Create a **private** Docker Space (hardware: CPU basic, free). Confirm on the Space settings page that it is private.
3. Prepare the Space contents: the bundle files plus `app/deploy/templates/huggingface_space_README.md` as `README.md` (it sets `sdk: docker` and `app_port: 8080`). Check that the Space folder holds exactly the bundle and that README, nothing else.
4. **[approval]** Push that folder to the Space's git repository. This publishes code to Hugging Face (private). It is separate from the GitHub repository, which stays private and is not touched.
5. Watch the Space's build log. Expect about 5 to 10 minutes: installing CPU only PyTorch and the pinned requirements, downloading the model at the pinned revision (about 87 MB), building the search index (about 13 s). **This is the first real run of the Dockerfile**, so allow for a fix or two (a base image detail, a package index, a size limit).
6. When the Space shows Running, open it through its **direct address** (`https://OWNER-SPACE.hf.space`) while logged in.
7. Run the smoke test with the token: `python app/backend/scripts/smoke_test.py https://OWNER-SPACE.hf.space --header "Authorization: Bearer $HF_TOKEN"` (22 checks pass).
8. Confirm the client address layout: use two networks and compare `RateLimit-Remaining` (see `security_configuration.md`). Set `PROFILE_TRUSTED_PROXY_HOPS` or switch `PROFILE_TRUST_PROXY` off accordingly, as Space variables, and re-test.
9. Read the Space's logs: request lines only, no input; note what the platform itself records about visitors and add it to the table in `monitoring.md`.
10. Run the VoiceOver checklist on the Space (Mac Safari and iPhone). Run Lighthouse in Chrome on the Space for a second opinion on performance and accessibility.
11. Measure a cold start (let it sleep, then time the first visit) and record it.
12. Do a **rollback drill** (below) once, on purpose, before calling staging done.
13. Write a short staging report: what passed, what failed, what changed, the measured cold start and memory. Then stop and ask whether to plan a public deployment.

## Rollback
The service is stateless, so rolling back is safe and loses nothing.
**Trigger:** the smoke test fails after a deploy, 5xx rate over 2%, the health check fails 3 times, or a privacy test fails.
| Platform | Roll back by | Time |
|---|---|---|
| Hugging Face Space | `git revert` the last commit in the Space repository (or reset to the previous release's commit) and push; the Space rebuilds that version | one rebuild, 5 to 10 minutes |
| Fly.io | `fly releases` then `fly deploy --image <previous image>` | about a minute |
| Cloud Run | shift traffic to the previous revision (`gcloud run services update-traffic --to-revisions=PREVIOUS=100`) | seconds |
| VPS | `docker run` the previous image tag; Caddy keeps the certificate | about a minute |
**After any rollback:** run the smoke test, then note the cause, the fix and the date in a release log. **Quick stop:** if something may be leaking, stop the service first (pause the Space, `fly machine stop`, or set Cloud Run traffic to zero), then investigate. There is nothing to restore because nothing is stored.
**Keep for 30 days:** the last three release bundles and their manifests (they are small, 1.7 MB each) so any release can be rebuilt exactly.

## Things that could go wrong on the first deployment, and the fix
| Risk | Why | Fix |
|---|---|---|
| The CPU PyTorch wheel index is unreachable from the builder | the Dockerfile installs it first from `download.pytorch.org/whl/cpu` | fall back to the default PyPI wheel (larger image) or pre download; the application does not care which |
| Image too large or build too slow for the free builder | torch and friends are large | confirm the builder's limits first; trim with `--no-cache-dir` (already), or use a paid builder for the first build |
| Memory kill at start up | 613 MB resident plus the platform's overhead | use a 1 GB machine or more; the free Space has 16 GB |
| Model download fails at build | network or rate limit | retry; set a read only token as a build secret if the host requires one (it must not be stored in the image) |
| All visitors share one rate limit | wrong proxy depth | the two network test above |
| Cold start too slow | models load at start | accept for staging; keep one instance warm for a public site |
| Framed view blocked | `frame-ancestors 'none'` | open the direct address (see `security_configuration.md`) |
