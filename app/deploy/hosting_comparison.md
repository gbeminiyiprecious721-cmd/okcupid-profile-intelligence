# Hosting comparison and recommendation

> **Revised 16 November 2026.** Creating a Docker Space on Hugging Face needs a paid plan (PRO), and a private Space has no public address. The Hugging Face parts of this document are superseded by [`staging_options.md`](staging_options.md). Statements below that call a Space free, or say to open its direct address, are wrong.

Written 16 November 2026. Nothing here has been created or bought. **Prices and limits changed during 2026 and my sources partly disagree** (search summaries and third party articles, not the providers' own pages, which I could not open from here). Treat every figure as an estimate and re-check the provider's pricing page before creating anything. Each figure below says how well it was supported.

## What the application needs
| Need | Measured value |
|---|---|
| Memory | about 613 MB resident after start and under load (620 to 625 MB with the classifier, which is local only and not deployed). A 512 MB machine cannot run it; 1 GB is the practical minimum, 2 GB is comfortable |
| CPU | light: a search takes about 11 ms; a 1 vCPU shared machine is enough |
| Start up | about 4 s to load the models, plus the platform's own start time |
| Disk | image of roughly 1.5 to 2.5 GB with CPU only PyTorch (not measured: Docker is not installed here); no volume, no database, no stored state |
| Network | none needed at run time: the model and the search index are baked into the image |
| Always on? | not required. Staging and a portfolio demo can wait a few seconds for a first visit |
| Security | public mode only, https, no secrets, no stored visitor data, one worker so the rate limiter counts in one place |

## Options compared
| Option | Memory fit | Estimated cost a month | Model loading | Availability | Security and control | Verdict |
|---|---|---|---|---|---|---|
| **Hugging Face Docker Space, private** | 16 GB RAM and 2 vCPU on CPU Basic (official docs) | **needs a PRO plan, $9 a month (search only); CPU Basic itself has no hourly charge** | image built on the Space; the model is baked in, so no download at run time | free hardware sleeps when idle (sources say after 48 hours) and wakes on a visit; no SLA | private visibility means only you can open it, which suits staging; the app sets its own headers; no custom domain on the free plan (not verified); the platform proxy sits in front | Good, but not free (see `staging_options.md`) |
| **Google Cloud Run** | choose 2 GiB, 1 vCPU | $0 for light use inside the free allowance (2 million requests; roughly 180,000 vCPU seconds and 360,000 GiB seconds, sources differ). With one instance always warm, my own rough estimate from rates I remember is $15 to $20, **not verified** | scales to zero, so a cold start loads the image and the models (about 10 to 20 s, estimated) | scales to zero, can keep one instance warm | https only, managed certificates; can require authentication, which keeps staging private; needs a billing account with a card, so set a budget alert and `max-instances=1` | **Good production candidate** |
| **Fly.io Machine** | 1 GB shared cpu | about $6.70 always on (1 GB; RAM rose to $6 per GB from 1 October 2026, per Fly's pricing update); about $12.70 for 2 GB (derived, not listed); billed per second only while running, so scale to zero costs almost nothing | image pulled to the machine; models in the image | `auto_stop` and `auto_start` supported; cold start a few seconds plus model load | https and certificates included; no built in access control, so staging would be public by URL unless protected in the app | **Good production candidate, simplest to run** |
| **Render web service** | free is 512 MB (too small); Starter 512 MB (too small); Standard 2 GB | $25 (Standard) | image built on Render | free instances spin down after 15 minutes idle; paid instances stay on | https included; plan names may have changed in August 2026, unverified | Works, but the cheapest tier that fits is the dearest here |
| **Small VPS (for example Hetzner) with Caddy** | 4 GB shared vCPU | about EUR 5 to 7 plus VAT; Hetzner raised prices from 15 June 2026 and the sources disagree on the exact plan and price | you build and run the container | always on, no cold start | full control, but you patch, monitor and secure the server yourself | Cheapest always on, but the most work and risk for one person |
| **Cloudflare Pages for the web app + a separate API host** | not applicable to the model | $0 for the static part (builds limited to 500 a month on free; bandwidth said to be unlimited, not confirmed by Cloudflare's own page) | n/a | very good for static files | custom headers by a `_headers` file (not confirmed in my search); the API then needs its own host and CORS, and Cloudflare in front hides the client address from the rate limiter unless configured | Useful later if traffic grows; **two moving parts now for no benefit** |
| **Vercel or Netlify functions** | not suitable: serverless function size and memory limits are too small for the model stack | n/a | n/a | n/a | n/a | Ruled out |

### Sources
- Fly.io: [Resource pricing](https://fly.io/docs/about/pricing/), [2026 pricing update](https://fly.io/pricing-update/)
- Render: [Pricing](https://render.com/pricing), [Compute plans](https://render.com/docs/compute-plans)
- Google Cloud Run: [Pricing](https://cloud.google.com/run/pricing)
- Hugging Face Spaces: [Spaces overview](https://huggingface.co/docs/hub/en/spaces-overview), [Hardware](https://huggingface.co/docs/hub/main/spaces-gpus)
- Hetzner: [Price adjustment](https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/)
- Cloudflare Pages: [Limits](https://developers.cloudflare.com/pages/platform/limits)

## Recommended architecture
**One stateless container that serves both the API and the built web application, built once and run unchanged on any of the hosts above.**

```
 browser ──https──▶ host's proxy (TLS, optional auth) ──▶ container: uvicorn, ONE worker
                                                          ├─ /api/...      FastAPI: search, lab findings, health
                                                          └─ everything else: the built web app (same origin)
 baked into the image at build time: embedding model (pinned revision), search index (from synthetic profiles),
 lab findings, built web app.   Not in the image: data, notebook, Tier 1 files, classifier, secrets.
```
Why this shape:
- **Same origin.** No CORS to get wrong, no second host, one set of headers, one rollback.
- **Everything baked in.** The container never downloads anything or writes anything at run time, and starts the same way every time.
- **Allowlist bundle.** The image is built from `app/deploy/build/bundle`, which holds 75 files (1.7 MB) chosen by an explicit list and scanned for private content. Private files cannot reach the builder.
- **One worker.** 613 MB is paid once, and the in memory rate limiter is correct.
- **Portable.** The same image runs on every candidate, so the host can be changed without touching the application.

### Recommendation by stage
1. **Staging (revised, see `staging_options.md`): run the container on this computer and share it privately with Tailscale (free, no card); optionally rehearse on a private Cloud Run service.** A private Hugging Face Docker Space was the original choice, but it needs a PRO plan and has no public address, so it is an option only if you approve the purchase.
2. **Public deployment (not authorised, decide later): Fly.io 1 to 2 GB or Google Cloud Run 2 GiB with `max-instances=1`.** Both run the same image. Fly is the simpler to operate and has a predictable price; Cloud Run can cost nothing at low traffic but needs a billing account. This choice can wait until you approve going public, and staging will have shown what the platform proxy does to client addresses and cold starts.
3. **Not recommended now:** splitting the web app onto a CDN (two hosts, CORS, hidden client addresses), serverless functions (too small), or a self managed VPS (more risk for one person).

Staging and production are on different platforms on purpose: it avoids any card, any cost and any public URL now, and the identical image is the thing being tested.

## Estimated ongoing costs
| Item | Staging (HF private Space) | Public, light traffic | Public, always warm |
|---|---|---|---|
| Hosting | $0 | Cloud Run $0 within the free allowance, or Fly with auto stop about $1 to $3 | Fly 1 GB about $6.70, 2 GB about $12.70; Cloud Run with a warm instance about $15 to $20 (unverified); Render Standard $25 |
| Domain name | none needed | about $10 to $15 a year (optional) | same |
| Certificates | included | included | included |
| Uptime monitoring | none (private); manual smoke test | free tiers exist (about 50 monitors at 5 minute intervals on common services; check current terms) | same |
| Log storage | platform default | platform default; short retention | same |
| Outbound traffic | negligible | a page is about 250 kB; 10,000 visits is about 2.5 GB, inside typical allowances | same |
| **Planning figure** | **$0** | **$0 to $5** | **$7 to $20** |
A sensible cap for a public portfolio demo is $15 a month with a budget alert at 50% and 100%.

## Free tier limitations that matter here
- **Hugging Face free Space:** sleeps when idle and takes a while to wake; shared hardware with no uptime promise; some free accounts have hit runtime quota errors on Docker Spaces (forum reports, not official); no custom domain on the free plan (unverified); the free tier's rules for private Spaces were not confirmed in official text.
- **Cloud Run free tier:** needs a billing account and card; the allowance is per billing account, not per project; a traffic spike or a misconfigured `max-instances` can cost money; cold starts are slow with a large image.
- **Fly.io:** no free tier for new accounts that I could confirm; a stopped machine is free but the first visit waits for start up.
- **Render free:** 512 MB cannot run the application, and instances spin down after 15 minutes.
- **Cloudflare Pages free:** 500 builds a month and one build at a time; Functions count against Workers quotas (100,000 requests a day on the free Workers plan, per one source).
