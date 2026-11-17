# Phase 7: security audit and production hardening report

Nothing is committed, pushed or deployed. The notebook, root README, synthetic profiles and every model and research finding are unchanged (SHA 256 checked: notebook ca8dafc2, README 213bab1d, synthetic profiles 66edb445). No model was retrained.

## 1. Findings and what was done
| # | Finding | Severity | Status |
|---|---|---|---|
| 1 | No rate limiting on the API | High for a public site | Fixed: in memory sliding window per client, searches 30 a minute, other reads 240 a minute, health exempt, safe 429 with Retry-After |
| 2 | Interactive docs and the OpenAPI file were served in every mode | Medium | Fixed: `/api/docs`, `/api/redoc`, `/api/openapi.json` and the default paths return 404 in public mode; local mode only |
| 3 | uvicorn's default access log writes every URL, including any text a visitor puts in a path or query (found by a test that sends a marker) | Medium (privacy) | Mitigated: production runs with `--no-access-log` and `--no-server-header`; a test runs the real server that way and checks the log |
| 4 | Safari does not focus a button when it is clicked, so focus did not return to the button after closing a dialog | Medium (accessibility) | Fixed: the opener is taken from the click event, not from `document.activeElement` |
| 5 | WCAG 2.4.11: the fixed comparison tray could cover the control that had keyboard focus | Medium (accessibility) | Fixed: scroll padding that follows the tray's real height |
| 6 | Layout shift of 0.115 on Discovery on a throttled phone (starter buttons arrived late) | Low | Fixed: placeholders hold their space; now 0.07 |
| 7 | Public mode accepted any CORS origin string | Medium | Fixed: public mode refuses a wildcard and any non-https origin (localhost allowed) |
| 8 | Starlette's test client warned that `httpx` is deprecated | Low | Fixed: dev dependency is now `httpx2==2.16.0`, which `huggingface_hub` already requires, so it was verified compatible and already present. The old warning is now a test failure |
| 9 | Dev dependency advisory GHSA-g3hv-75wg-m249 (minimatch denial of service, 7 moderate, build tools only) | Low | Fixed with an npm override to minimatch 11.0.8; full `npm audit` reports 0 |
| 10 | Single 537 kB script on every page | Low | Fixed: each page loads on first visit; the first page is 412 kB (130 kB compressed) |
| 11 | Web application had no Content Security Policy or headers of its own | Medium | Fixed: policy and headers in `frontend/security-headers.mjs`, applied by the preview server and tested on the production build |
| 12 | A static check that nothing real can be deployed | n/a | Added: the deployable file set (what git tracks or would add) must hold no Tier 1 file, model file, data file or environment file |

No finding showed real essay text, an individual record or a Tier 1 artefact reachable from public mode.

## 2. Controls now in place
- **Modes.** Public is the default and the only deployable mode. Public mode refuses `PROFILE_TIER1_ARTIFACT_DIR` at startup, never looks for the classifier, and returns 403 `local_only` from both classifier endpoints, whatever is on disk. A matrix test checks every endpoint in public mode, local mode without files, and local mode with a classifier.
- **Rate limiting.** Described in `security/ratelimit.py`. Bounded memory (10,000 clients), counts only addresses and times, refuses before reading the body, answers with the security headers and CORS headers intact. The client address is the socket address unless `PROFILE_TRUST_PROXY=true`, which uses the last `X-Forwarded-For` entry.
- **Input.** Body limit 16 KB, text limit 2,000 characters, strict request schemas that forbid extra fields, a pattern on identifiers. No error echoes input (tested for 11 kinds of bad request, in the strictest mode).
- **Headers (API).** nosniff, no-referrer, X-Frame-Options DENY, CSP `default-src 'none'`, Permissions-Policy, COOP and CORP same origin, no-store, HSTS in public mode. CORS allows the configured origin, GET and POST only, no credentials.
- **Headers (web application).** CSP with `script-src 'self'` (no inline script, no eval), `connect-src 'self'`, `frame-ancestors 'none'`, `base-uri 'none'`, `object-src 'none'`, plus the same set as above. Print them with `npm run headers`.
- **Artefacts.** SHA 256 manifests, checked before anything is unpickled; library versions checked; Tier 1 files in a git ignored folder.
- **Privacy.** No visitor text is logged, stored or echoed. Browser storage holds only the theme choice (tested after using every page: no other local or session key, no cookie, no IndexedDB, no service worker, no cache). A request to the classifier carries only an example name.

## 3. Exposure audit against the real essays
`scripts/audit_exposure.py` served everything in public mode (869 requests: every profile page, examples, lab summary, searches, errors) plus the built web application (17 files), cut it into 128,030 runs of seven words, and compared them by hash with the 18,207,860 runs in the 441,351 real essays. Result: **0 matches**, apart from one fixed lifestyle answer label ("doesn't have kids, but might want them"), which is the data's own answer vocabulary and which a real essay happens to contain too. The audit reports it separately and would fail on anything else. Counts only are saved (`phase7_exposure_audit.json`).

## 4. Dependency audit
| Scope | Tool | Result |
|---|---|---|
| Backend Python environment (about 60 packages, including the ML stack) | pip-audit 2.10.1 against the installed packages | no known vulnerabilities |
| Notebook Python environment | pip-audit | no known vulnerabilities |
| Frontend, production | npm audit | 0 |
| Frontend, everything including build tools | npm audit | 0 (was 7 moderate; fixed by override) |
Trade-off: the override forces minimatch 11 under typescript-eslint, which expects an older major. Lint, type check and all tests pass with it. Re-audit before every release, because new advisories appear.

## 5. Browsers and accessibility
| Browser | Result |
|---|---|
| Chrome (system, current) | 101 passed on the development server, 125 passed on the production build with the policy, 13 passed in local mode with the real classifier |
| WebKit (Playwright 27.2, the engine of Safari) | 112 passed, 4 skipped on the production build |
| Firefox | **not tested**: Playwright's Firefox build will not start on this machine ("Could not find profile folder", also with another temp folder). Chrome and WebKit cover two of the three engines |
| Safari application | not driven directly (it cannot be automated here); WebKit is its engine. The 4 skips are tests of Tab reaching links, because Safari only tabs to form controls unless the user turns on "Press Tab to highlight each item" |

WCAG 2.2 AA, checked three ways:
- **axe** (A and AA, 2.0, 2.1, 2.2 rules): 0 violations on every page, desktop and phone, light and dark, with charts also in table view and dialogs open.
- **Scripted checks beyond axe** (`e2e/a11y.spec.ts`): unique titles, one main landmark, labelled navigation, language and one h1 per page; Tab through 70 stops on each page on desktop and phone with no trap, a visible focus ring and focus never hidden under another element (2.4.11); dialogs trap focus and Escape returns it; every control at least 24 by 24 pixels (2.5.8); no sideways scroll at 320 pixels and on a phone turned sideways (1.4.10); text spacing applied with no clipping and no axe violations (1.4.12); no animation running under reduced motion (2.3.3); usable at 200% zoom.
- **Screen reader.** The accessibility tree is checked (named figures, lists, tables, live regions, no unnamed images), and results are announced in polite live regions. A real screen reader (VoiceOver, NVDA) was **not** run and still needs a human pass.

Responsive layouts are checked at 320, 390, 667 (landscape phone), 820 (tablet), 1280 and 1360 pixels, with screenshots from earlier phases.

## 6. Performance
API (one worker, 200 requests per endpoint over a kept alive connection, this laptop):
| | Public | Local (with classifier) |
|---|---|---|
| Start up (models loaded) | 3.9 s | 3.9 s |
| Memory after start and after load | 612 and 614 MB | 621 and 625 MB |
| Health, meta, lab summary, profile, examples | 0.6 to 1.0 ms median | 0.6 to 0.7 ms |
| Lab figure (PNG, 35 kB) | 1.3 ms | 1.0 ms |
| Similarity search, both methods, k = 5 and 10 | 11.1 and 11.8 ms median, p99 15.5 ms | 9.7 and 10.5 ms |
| Embeddings only, TF-IDF only | 10.8 and 3.0 ms | 10.2 and 2.2 ms |
| 2,000 character search | 11.6 ms | 14.1 ms |
| Classifier prediction | n/a | 5.7 ms median, p99 7.2 ms |
Web application (production build, cold cache; phone = 4 times slower CPU and slow 4G):
| Page | Desktop LCP | Phone LCP | Phone layout shift | Transferred | JavaScript |
|---|---|---|---|---|---|
| Home | 0.27 s | 1.36 s | 0 | 233 kB | 127 kB |
| Discovery | 0.12 s | 1.62 s | 0.07 | 252 kB | 141 kB |
| Lab overview | 0.14 s | 1.85 s | 0.03 | 256 kB | 137 kB |
| Model performance | 0.28 s | 1.88 s | 0.04 | 259 kB | 139 kB |
| Classification | 0.14 s | 1.62 s | 0 | 261 kB | 142 kB |
All are inside the "good" web vitals thresholds (LCP under 2.5 s, shift under 0.1). Fonts are 93 kB and self hosted.

## 7. Production configuration
`scripts/check_production_config.py` runs 18 checks against the settings a deployment will use and exits 1 on any failure (mode, no Tier 1 folder, rate limiting, https origins, no wildcard, docs off, classifier refused, HSTS, CSP, nosniff, no risky files in the deployable set). It is tested with one passing and several failing configurations.
Run command for the API: `uvicorn profile_api.main:app --no-server-header --no-access-log` with `PROFILE_APP_MODE=public` and `PROFILE_ALLOWED_ORIGINS='["https://your.site"]'`.

## 8. Trade-offs and compatibility notes
- **CSP allows inline styles.** The dialog library injects a style element to lock scrolling, and the charts use style attributes. A strict policy broke dialogs (found by the policy test). Scripts stay strict. A per response nonce would remove the need, but a static host cannot make one.
- **Rate limit state is per process.** With several workers each counts separately. Use the host's limiter or a shared store for that.
- **`--no-access-log`** means no request log from the application. Rely on the platform's proxy logs, and check what they record.
- **minimatch override** (section 4).
- **`pandas` added** to the backend requirements (Phase 6) because the classifier needs a table input. It is only exercised in local mode.
- **Firefox and a real screen reader were not available** (section 5).

## 9. Outstanding risks
1. The web application's headers cannot be tested on your future host from here. They are tested on the production preview server only. Check them with a header scanner after the first deployment.
2. No https here, so HSTS is untested in a browser. It is sent in public mode and ignored over http.
3. Rate limiting is in memory per process, and trusting a proxy needs a proxy you control.
4. The Tier 0 search files are git ignored, so a deployment must build them (`scripts/build_search_index.py`) and needs the embedding model files in the image (`scripts/download_model.py`, still untested on a clean machine). The torch stack makes the image large and needs about 1 GB of memory.
5. Python packages are pinned by version but not by hash, and there is no software bill of materials. Pickle (joblib) files are produced by this project and hash checked before loading, so the build pipeline that makes them must be trusted.
6. A human screen reader pass (VoiceOver, NVDA) and a Firefox run are still to do.
7. There is no authentication, by design: the public application serves only fictional and aggregate content. If that ever changes, this audit does not cover it.
8. Dependency advisories are a moving target. Re-run both audits before each release.

## 10. Deployment readiness
**Ready for a staging deployment, not yet for an unattended public launch.** The application meets its own requirements: public mode serves only synthetic and aggregate content, the classifier and every real data derived file are unreachable and excluded, errors and logs leak no input, dependencies are clean, accessibility and performance checks pass in Chrome and WebKit, and the configuration can be verified by a script.
Before a public launch: choose the host; build the Tier 0 files and fetch the model in the build; serve the web application with the headers from `npm run headers` over https and re-check them; run `check_production_config.py` with the real environment; add uptime monitoring and a way to read platform logs; do the Firefox and screen reader passes; decide on a shared rate limit if you run more than one worker; keep the repository private until you separately approve publishing it.
