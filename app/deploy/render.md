# Deploying to Render (Free plan)

**Status: prepared, not applied.** No Render service exists for this application. Nothing was pushed, created or paid for. The measurements behind every number below are in `app/planning/phase11a/README.md`.

## What Render will run
One Docker web service, built by Render from the Git repository:

| Setting | Value | Why |
|---|---|---|
| Type, runtime, plan | web service, Docker, `free` | no payment method is needed |
| Dockerfile | `app/deploy/Dockerfile.render` | multi stage: web build, allowlisted bundle, Python environment with the index, runtime |
| Build context | repository root (`.dockerignore` limits it to `app/`) | the bundle script needs the repository layout |
| Health check | `/api/v1/health` | answers 200 in public mode when the service is up |
| Auto deploy | off | a deploy happens only when you start one, never because of a push |
| Port | Render sets `PORT` (10000); the service binds `0.0.0.0:$PORT` | no change needed |
| Secrets | none | public mode only, no credential, no database |
| Region | your choice at creation, cannot be changed later | choose near your visitors |

`render.yaml` at the repository root holds these settings. Using it as a Blueprint, or typing the same values in the dashboard, gives the same service.

## What is inside the image (and what is not)
The image is built from an **allowlist**: `make_deploy_bundle.py` runs inside the build and copies only listed files (the application code, the synthetic profiles and their spec, the Lab summary and two figures, the built web application). It refuses the build if any file is a data file, model or index file, environment file, notebook, Tier 1 file, local path or secret. The search index is built inside the image from the synthetic profiles. The embedding model is downloaded once during the build. At run time nothing is downloaded.
Not in the image: the OkCupid data, any essay, the notebook, the classifier and all Tier 1 files, tests, planning documents, credentials, network or device details.

## Memory (512 MB limit)
Measured under a 512 MB, 0.1 CPU container (Render's Free limits): about 345 MB anonymous memory after start and about 385 MB after sustained concurrent searching, with no out of memory kill. The savings come from three changes that leave every number unchanged: a leaner encoder instead of the `sentence_transformers` package, pandas removed, one PyTorch thread. Details and the evidence are in the Phase 11A report.

## Steps (each step that creates or publishes something needs your approval first)
1. **[approval] Push the branch to GitHub.** Render builds from Git, so the repository (private is fine) must be connected. This is the first time the application code leaves this computer.
2. **[approval] Create the service** in your existing Render account: New, Blueprint (or Web Service, Docker), choose the repository and branch, plan **Free**. Do not add a payment method or a paid plan. Leave other services alone.
3. Watch the build log (expect 10 to 20 minutes for the first build) and the deploy. The deploy must reach a healthy `/api/v1/health` within 15 minutes or Render cancels it.
4. Run the smoke test against the Render address: `python app/backend/scripts/smoke_test.py https://YOUR-SERVICE.onrender.com` (22 checks).
5. Open the address, run a search, and check Discovery and the Lab pages in light and dark.

## Free plan behaviour you should expect
- **Sleep:** after 15 minutes without traffic the service spins down. The next visit wakes it. Render says this takes about a minute. This application needs about 75 seconds to load its models on 0.1 CPU, so the first visit after a sleep can take longer than that.
- **Instance hours:** 750 free hours a month per workspace. A service that is awake all month uses about 720 hours, and your other service counts against the same 750 while it runs. Check the dashboard.
- **Restarts:** Render may restart a free service at any time. The application keeps no state, so nothing is lost.
- **Speed:** 0.1 CPU is slow. A single search takes about 0.6 seconds, and ten people searching at once would wait several seconds each.
- **Bandwidth and build minutes:** both are limited and shared with your other service. With no payment method, using up the bandwidth suspends free services for the rest of the month.

## Rollback and stopping
- Roll back from the dashboard (Events, Rollback) or redeploy an earlier commit.
- To stop it completely: Settings, Suspend (or delete the service). The local Docker version is unaffected.

## Open risks
See the Phase 11A report: cold start length, rate limiting behind Render's proxy (the address header), and no memory measurement on a real amd64 host.
