# Security configuration for staging and public deployment

> **Revised 16 November 2026.** Creating a Docker Space on Hugging Face needs a paid plan (PRO), and a private Space has no public address. The Hugging Face parts of this document are superseded: the application is deployed on Render (see `operations_and_rollback.md`). Statements below that call a Space free, or say to open its direct address, are wrong.

Everything here is already implemented in the application and covered by tests. This page says what each setting is, what value to use, and how to check it on a real host. `scripts/smoke_test.py` checks most of it from outside, and `scripts/check_production_config.py` checks the settings before start up.

## HTTPS
- **Terminate TLS at the host.** Every candidate host provides certificates and redirects http to https (Fly: `force_https = true`; Cloud Run and Hugging Face: https only). The container speaks plain http on its port behind the host's proxy and is never exposed directly.
- **HSTS** (`Strict-Transport-Security: max-age=31536000; includeSubDomains`) is sent by the application in public mode. Browsers ignore it over http, and it is not sent in local mode. Do not add `preload` until the domain is final, because preloading is hard to undo.
- **Check:** `curl -sI https://HOST/ | grep -i strict-transport` and `scripts/smoke_test.py https://HOST`.

## Content Security Policy
Two policies, one per kind of response (both sent by the application):
| Responses | Policy |
|---|---|
| Everything under `/api` | `default-src 'none'; frame-ancestors 'none'` |
| The web application (page, scripts, styles, fonts) | `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; worker-src 'none'; manifest-src 'self'` |
- No inline scripts, no `eval`, and the page may only talk to its own origin, so a third party script or tracker cannot load or send anything.
- `'unsafe-inline'` for styles is a documented trade-off: the charts set bar widths with style attributes and the dialog library injects a style element. Scripts stay strict. See `planning/phase7_security_audit.md`.
- The policy was exercised in Chrome on the production build with no violation on any page.
- **Hugging Face Spaces note:** a Space page on huggingface.co shows your app inside a frame, and `frame-ancestors 'none'` (with `X-Frame-Options: DENY`) blocks that frame. The direct address (`https://OWNER-NAME.hf.space`) works. Open the app through the direct address. If the framed view is wanted, that is a deliberate loosening to decide on, not a default.

## The full header set
Sent on every response (`app/deploy/security_headers_reference.txt` lists them):
`Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()`, `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Resource-Policy: same-origin`, plus `Strict-Transport-Security` in public mode.
Caching: `/api` answers are `no-store`; the page `index.html` is `no-cache` (always revalidated, so a new release shows at once); files in `/assets` have a content hash in their name and are `immutable` for a year.
The platform may add its own headers (for example a `server` banner). uvicorn runs with `--no-server-header`, so the application adds none.

## CORS
On the recommended single origin deployment **no cross origin request exists**, so CORS is not used. The application still enforces a safe policy in case a second origin is added:
- `PROFILE_ALLOWED_ORIGINS` must be a JSON list of **https** origins (localhost is allowed for development). A wildcard, a non https origin or a bare host name stops the application from starting in public mode.
- Only `GET` and `POST`, only the `Content-Type` header, **no credentials**.
- Example if a separate web host is ever used: `PROFILE_ALLOWED_ORIGINS='["https://your.site"]'`.

## Rate limiting
Per client address, over a sliding minute, in the application:
| Bucket | Applies to | Default | Setting |
|---|---|---|---|
| search | `POST /api/v1/discover/similar` and `POST /api/v1/classify/predict` | 30 a minute | `PROFILE_RATE_LIMIT_SEARCH_PER_MINUTE` |
| general | every other `/api` path except health | 240 a minute | `PROFILE_RATE_LIMIT_GENERAL_PER_MINUTE` |
| exempt | `GET /api/v1/health` | none | |
| global (all visitors together) | searches in progress at the same moment | 4 | `PROFILE_RATE_LIMIT_MAX_INFLIGHT_SEARCHES` (0 turns it off) |
| global, one visitor's share | of those, how many one visitor may hold | 2 | `PROFILE_RATE_LIMIT_MAX_INFLIGHT_PER_VISITOR` |
Over the limit the answer is `429` with `Retry-After` and `RateLimit-Limit` and `RateLimit-Remaining` headers, in the standard error shape, with no echo of the request. The page explains it and keeps what was typed. Static files are not limited by the application; the platform's own protection covers them.

**Global safeguard (Phase 11F).** The Free plan has 0.1 of a CPU. Measured on that limit, a search takes about a second and a long one much longer, so 16 long searches at once queued for up to 99 seconds. A count per minute cannot protect against that, because the cost of one search varies by a factor of four. The bound is on searches *in progress*: when 4 are already running or waiting (or the visitor already has 2), a new one is refused at once with `429`, code `busy`, `Retry-After: 5`, and the page shows its usual "try again" panel. It only counts requests the per client limit let through, and a request refused for being busy does not use up the visitor's own quota. Normal use (a few visitors at the same moment) never reaches it.

**The client address behind a proxy is the one thing to verify on each platform.** The application sees the proxy's address unless told otherwise, which would put every visitor in one bucket.
- `PROFILE_TRUST_PROXY=true` makes it read `X-Forwarded-For`; `PROFILE_TRUSTED_PROXY_HOPS` says which entry from the right is the client (default 1: the last entry, appended by the one proxy in front).
- **Do not turn this on without a proxy you control in front**, or a visitor can pick their own address.
- If the header has fewer entries than the setting expects, the application ignores it and uses the socket address, so a malformed header cannot choose a bucket.
| Platform | Expected | To do |
|---|---|---|
| Fly.io | one proxy; hops 1 (to confirm) | check in staging style test |
| Google Cloud Run | direct: client address last or sole entry (hops 1); behind a Google load balancer the layout is `supplied, client, balancer` (hops 2) | confirm which applies before setting |
| Hugging Face Space | unknown | **confirm during the staging run** |
**How to confirm without logging addresses:** send two requests from two different networks (for example your laptop and your phone on mobile data) and check that each gets its own `RateLimit-Remaining` count. If both share one count, the hops value is wrong.
- **One worker, one instance.** The counts are in memory per process. More workers or instances multiply the limits. Keep `--workers 1` and, on Cloud Run, `max-instances=1`, or use the host's own limiter for more.

## Other protections already on
- Body limit 16 KB; text limit 2,000 characters; at most 2 searches running at once; strict request schemas that forbid extra fields; every error uses one shape that never repeats the request.
- Public mode refuses Tier 1 settings at start up, never loads the classifier and refuses its endpoints; the interactive API documentation and the OpenAPI file are not served.
- Request log: one line per request with the route template, status and timing only (`profile_api/security/request_log.py`). uvicorn's own access log is off because it writes URLs.

## Environment variables
| Variable | Value for staging and public | Notes |
|---|---|---|
| `PROFILE_APP_MODE` | `public` | the default and the only deployable mode; the image sets it |
| `PROFILE_STATIC_DIR` | `/app/frontend/dist` | set by the image |
| `PROFILE_ARTIFACT_DIR` | `/opt/artifacts` | set by the image |
| `PROFILE_ALLOWED_ORIGINS` | not needed on one origin | if set, https only |
| `PROFILE_TRUST_PROXY` | `true` behind the host's proxy, after the check above | image default is `true`; set `false` if unsure and run a limit test |
| `PROFILE_TRUSTED_PROXY_HOPS` | `1` unless the platform needs more | |
| `PROFILE_RATE_LIMIT_*` | defaults | includes `PROFILE_RATE_LIMIT_MAX_INFLIGHT_SEARCHES` (4) and `PROFILE_RATE_LIMIT_MAX_INFLIGHT_PER_VISITOR` (2) |
| `PROFILE_REQUEST_LOG` | `true` | |
| `HF_HUB_OFFLINE`, `TRANSFORMERS_OFFLINE` | `1` | set by the image; the model is already in the image |
| `PROFILE_TIER1_ARTIFACT_DIR` | **never set** | public mode refuses to start if it is |
There are **no secrets** to configure. The only credential involved is your host account token (for example a Hugging Face write token), which is used to publish and is never put in the image or the repository. The bundle builder refuses files that contain tokens or local paths.

## Verifying a running deployment
```
python app/backend/scripts/smoke_test.py https://HOST                       # 22 checks, fictional input only
python app/backend/scripts/smoke_test.py https://HOST --header "Authorization: Bearer $TOKEN"   # a private host
curl -sI https://HOST/ ; curl -sI https://HOST/api/v1/health                # read the headers yourself
```
Then run an external header scan (for example securityheaders.com or Mozilla Observatory) against the public address once one exists. Expect A grades; the style trade-off above may cost a little.
