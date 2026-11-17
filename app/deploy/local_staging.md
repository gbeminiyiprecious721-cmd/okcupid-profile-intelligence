# Phase 8B: zero cost local Docker staging

**Status: running on this Mac, reachable only from this Mac.** No cloud resource, no subscription, no card, no billing account, no push, no commit. The GitHub repository is private and untouched.

## Address
| | |
|---|---|
| **Local address** | `http://127.0.0.1:8080` (this Mac only; the LAN address refuses connections) |
| Private address for your other devices | `https://<this-mac>.<your-tailnet>.ts.net`, **after** the Tailscale steps below, which need you (a sign in and, for HTTPS, one switch in the admin page) |
| Container | `pi-staging`, image `profile-intelligence:staging-20261116-3` (2.24 GB on disk, linux/arm64) |
| Start it again | `app/deploy/run_local_staging.sh profile-intelligence:staging-20261116-3 -d` |
| Stop it | `docker stop pi-staging` (it is removed when stopped) |
| After a restart of the Mac | the container is gone and Colima is stopped: `colima start` then the start command above |

## Tools: all free, none asked for money
| Tool | Version | Licence (from Homebrew's own metadata) | Needed |
|---|---|---|---|
| Colima | 0.10.3 | MIT | no account |
| Lima (Colima's dependency) | installed with Colima | open source | no account |
| Docker command line | 29.9.3 | Apache 2.0 | no account, no Docker Desktop, no Docker Hub login |
| Docker buildx plugin | 0.39.0 | Apache 2.0 | no account |
| Tailscale client | 1.104.7 | BSD 3 clause | an account for the Personal plan (free for non commercial use, up to six users; a search summary of Tailscale's pricing page, so check the live page when you sign up) |
Installation asked for no payment, no billing detail and no password. One file was created outside the repository: `~/.docker/config.json`, with one line that tells the Docker command line where the buildx plugin is. Colima's virtual machine (2 CPUs, 4 GB memory, 20 GB disk, Apple's Virtualization framework) lives in `~/.colima` and uses 7 GB on disk at the moment, mostly the build cache.

## What was done and found
| Step | Result |
|---|---|
| First real build of the Dockerfile | **Built first time**, 2 min 14 s. Rebuilt three times for two real findings (below) |
| Finding 1 | Hugging Face wrote one cache file readable by root only, so the container (user 1000) logged a permission warning. Fixed in the Dockerfile with `chmod -R a+rX`; now zero unreadable files |
| Finding 2 | `check_production_config.py` crashed inside the image because the slim image has no `git`. Fixed (that one check is skipped, the other 17 run), with a test |
| Image | runs as user 1000 (`app`), port 8080, offline (`HF_HUB_OFFLINE=1`), public mode, one worker |
| Run strictly | read only file system, writable `/tmp` only in memory (64 MB, no executables), all Linux capabilities dropped, no new privileges, 256 processes, **1 GB memory with no swap**, 2 CPUs, published on `127.0.0.1` only. Verified with `docker inspect` and by trying to write to `/app` and `/opt/artifacts` (both refused) |
| Network exposure | `127.0.0.1:8080` answers 200; this Mac's address on the local network is refused. The only listener is Colima's loopback forwarder |
| Start up | **3.7 s** from `docker run` to the first healthy answer, three runs identical |
| Memory | about **392 MiB** at idle and **447 MiB** after 230 browser tests (Docker's figure, which leaves out file cache); peak resident memory **588 MB** (`VmHWM`). Never near the 1 GiB limit; no kill, no restart |
| Smoke test | **22 of 22** (twice: default limits, and the final instance) |
| Security configuration check | **17 of 17** run inside the container (placeholder origin) |
| Live rate limiting | 34 searches in a row: 30 allowed, the 31st and later refused with 429, `Retry-After: 60`, `RateLimit-Remaining: 0`; other reads and health stay available |
| Frontend, API, both searches | Browser suites run against the container: **227 passed, 5 skipped** over Chrome and WebKit (shell, Discovery with both methods, Lab pages, classifier page in public mode, accessibility with axe, keyboard and focus, reflow, text spacing, storage, security headers under the policy). Skips: Safari does not Tab to links by default, and one screenshot only test |
| Functionality of both methods | 22 smoke checks include a fictional search returning 5 neighbours per method with no profile text, and the browser suites compare the displayed scores with the API's, per method |
| API performance from outside the container (this Mac, 2 vCPU VM) | health, meta, lab summary, examples, profile, web page: **1.4 to 1.6 ms** median, 2.4 ms at p99; lab figure 2.1 ms; similarity search both methods **24.7 ms** median (27 ms at p99), embeddings only 20.4 ms, TF-IDF only 3.2 ms; a 2,000 character search 59 ms (88 ms at p99). Slower than running natively (11 ms for both methods) because the model runs in a two CPU virtual machine |

## Privacy findings
| Check | Result |
|---|---|
| Image file system scan (`scripts/scan_image_export.py`) | 45,713 files. Compared by content hash with the real data file and all three Tier 1 files (4 hashes): **no match**. No profiles data, classifier, notebook, `tier1` folder, environment file, ssh key or cloud credential file anywhere. **All 71 application files are identical to the bundle manifest**, and nothing extra is in `/app` or `/opt/artifacts`. `/opt/artifacts` holds exactly the four Tier 0 search files |
| Secrets and local paths in our files | none |
| Third party note | one: the Transformers library's own test file contains a Hugging Face token. It is the library's published token for Hugging Face's sandbox test instance (its comment says "only usable on the sandboxed CI instance"). It is not a credential of yours. It is reported separately by design |
| Real essays | all text under `/app` (65 files, 181,641 runs of seven words) compared with the 441,351 real essays: **no prose match**. Two windows matched, both the fixed answer label "doesn't have kids, but might want them" (once with its field name "offspring" in front, as it appears in the raw JSON) |
| Library sample data | the Python packages contain their own sample files (for example scikit-learn's demo datasets). They are not ours and are not private |
| Logs | the container's log holds only request lines (route template, status, time, size, request id); none of the fictional text used in the tests appears |
| Not public | bound to loopback only; no Tailscale Funnel; nothing is forwarded by the router |
Tests added for the scanner (name, hash, secret, bundle mismatch, third party): 3.

## Private access with Tailscale (prepared, not started)
Nothing has been started: no Tailscale daemon is running, no state exists, and no account has been created. These steps are for you, because they need a browser sign in and an administrator password or a console switch.
1. **Start the Tailscale service.** Choose one:
   - System service (needs your administrator password): `sudo brew services start tailscale`
   - Without administrator rights, in the background, for this session only: `mkdir -p ~/.tailscale && tailscaled --tun=userspace-networking --state=$HOME/.tailscale/tailscaled.state --socket=$HOME/.tailscale/tailscaled.sock &` and then add `--socket=$HOME/.tailscale/tailscaled.sock` to each `tailscale` command below.
2. **Sign in:** `tailscale up`. It prints a web address. Open it and sign in with an identity provider you already use (Google, Microsoft, GitHub, Apple). A new tailnet on the free Personal plan is created. **Stop if any page asks for a card or a paid plan.** The Personal plan needs neither.
3. **For HTTPS addresses:** in the Tailscale admin console (DNS page), switch on MagicDNS and HTTPS certificates. Both are available on the free plan (check at the time). Without HTTPS you can use `tailscale serve --http=8080 8080` and the address `http://<this-mac>:8080` (the traffic between your devices is still encrypted by Tailscale).
4. **Share the container privately:** `tailscale serve --bg 8080`. It proxies `127.0.0.1:8080` to `https://<this-mac>.<your-tailnet>.ts.net`, **to your tailnet only**.
5. **Check it is not public:** `tailscale serve status` must say it is available within your tailnet, and `tailscale funnel status` must show nothing. **Never run `tailscale funnel`**: that is the command that publishes to the internet.
6. **Your iPhone:** install the Tailscale app from the App Store, sign in to the same account, open the address in Safari, and run `voiceover_checklist.md`.
7. **Stop sharing:** `tailscale serve reset`, then `tailscale down` (and `sudo brew services stop tailscale`, or end the background process).
Things to know:
- Tailscale's service sees your device names and when they connect; it cannot read the traffic, which is end to end encrypted between your devices.
- A publicly trusted HTTPS certificate for `<this-mac>.<tailnet>.ts.net` is normally recorded in public certificate transparency logs, so the **machine name and tailnet name become publicly searchable** (not the content, and not access to it). If that matters, use the `--http` form or rename the machine first. I have not verified this against Tailscale's current documentation; check it before enabling HTTPS.
- Behind Tailscale Serve every request reaches the container from the proxy, so the rate limiter sees one address. That is fine for one person.
- The container setting `PROFILE_TRUST_PROXY` stays `false` here.

## Remaining issues
1. **Tailscale is not signed in.** Steps 1 to 3 above need you.
2. **This does not test a real host.** It does not show a platform's proxy depth, a real cold start or platform logs. A private Cloud Run rehearsal (option B in `staging_options.md`, which needs a card on file) would.
3. **Search is about twice as slow as native** because of the two CPU virtual machine (25 ms against 11 ms). That is a property of this test setup, not of the application.
4. **The build cache uses 4.4 GB** inside the virtual machine (`docker builder prune` frees it, but the next build will then take longer).
5. **Container does not survive a restart of the Mac.** There is no restart policy, deliberately.
6. **Still open from before:** VoiceOver run, Firefox (needs Linux), and the Hugging Face and public hosting decisions.
7. **A stale message** in `check_production_config.py` still says "not a git checkout" for the skipped check. Cosmetic.
