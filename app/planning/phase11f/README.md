# Phase 11F: rate limiting behind Render, and the smoke test client

17 November 2026. **Nothing was redeployed.** The live service still runs the old build, and the Render configuration was not changed. Fraud-Risk-Intelligence, the models, notebook, synthetic data, Tailscale and Hermes were not touched. The code is committed to the branch only after review and approval of Step 1; Render's auto deploy is off.

## Root causes
1. **Rate limit buckets were keyed on Render's own address, not the visitor.** The limiter reads `X-Forwarded-For` and takes the entry `PROFILE_TRUSTED_PROXY_HOPS` places from the right. The live service ran the default, 1, which is the last entry: the address Render's front end received the request from. That address belongs to Render's network and changes from request to request among a few values.
   - Measured on the live service from this Mac with no proxy of ours (one stable client): the remaining count came back as `239 239 239 238 238 237 236 235 237 234 236 233 235 232 231`, several interleaved buckets. My IPv4 and IPv6 requests landed in the same buckets, so the key was not my address.
   - Consequences: one visitor can exceed 30 searches a minute by landing in several buckets (74 sent in about a minute, 68 answered), and unrelated visitors share the same few buckets, so a handful of people could exhaust the demo for everyone.
   - Made up `X-Forwarded-For`, `True-Client-IP`, `X-Real-IP` and `Forwarded` values never moved a request into another bucket, so the limiter was not spoofable. `CF-Connecting-IP` sent by a client is refused (403) at the edge.
2. **The smoke test client cannot read some Render responses.** Render's edge cuts an uncompressed body short (7,403 of 13,251 bytes on `/api/v1/lab/summary`) when the client sends `Connection: close`, which Python's `urllib` always does. The local container does not do this. The smoke test crashed with a traceback and sent no `Accept-Encoding`.
3. **Render documents none of this.** Pages read: web services, inbound IP rules, DDoS protection, environment variables. None states which headers Render adds, the `X-Forwarded-For` layout, or whether client supplied copies are stripped (the `http-headers` and `troubleshooting` pages do not exist). The layout therefore has to be established by measurement.

## The fix
| Change | File |
|---|---|
| The key is the address `hops` places from the right of `X-Forwarded-For`, as before, but now **validated as an IP address**. A missing, too short or invalid entry is not trusted and the socket address is used, so a wrong setting shares a bucket instead of letting anyone pick one | `profile_api/security/ratelimit.py` |
| **IPv6 visitors are counted per /64**, so changing the low bits of an address does not give a fresh bucket. IPv4 mapped addresses count as IPv4. A port is dropped | same |
| A header sent on several lines is read as one list, in order | same |
| 22 new tests with invented addresses: visitor found through any edge address, strangers behind one edge kept apart, made up prefixes ignored, hops=1 documented as the broken case, invalid, short and untrusted headers, IPv6 grouping, safe 429 with no address echoed | `tests/test_client_identity.py` |
| Smoke test sends `Accept-Encoding: gzip`, decompresses, and treats a body that ends early as a **failed check** (not a crash, never parsed). No assertion removed or loosened. New optional `--check-rate-limit-identity`: ten requests on new connections, five of them with made up forwarded addresses, must each take exactly one off the remaining count | `scripts/smoke_test.py` |
Not changed: the 30 searches and 240 general requests per minute, the 429 body, `Retry-After`, the models, rankings, scores, public mode, and the cold start (accepted).
**Setting to apply on Render: `PROFILE_TRUSTED_PROXY_HOPS=2`.** This is a hypothesis, not a fact: Cloudflare appends the visitor and Render's front end appends the Cloudflare address, so the application sees `<visitor>, <edge>`. The deployment plan checks it by measurement before it is kept.

## Security implications
- With the setting right, only entries to the right of the visitor's own are read, and those are added by Render. Nothing the visitor sends can choose the bucket.
- If the number is **too small** (today): buckets are shared and the limit is partly ineffective. Annoying, not exploitable.
- If the number is **too large**: the chosen entry could be one the visitor wrote, and a visitor could pick any bucket, which defeats the limiter. The measurement below detects this (a made up prefix would change the bucket), and then the setting goes back down.
- If Render changes its layout later, the symptom is shared buckets or, in the bad case, choosable buckets. `--check-rate-limit-identity` is cheap enough to run after every deploy.
- Request bodies are still never read or stored by the limiter. Only an address and a count are kept in memory, and no address appears in any response.
- Optional, not done: a global search ceiling per minute to protect the 0.1 CPU if many visitors arrive. Needs your decision.

## Test results
| Test | Result |
|---|---|
| Backend suite | **380 passed, 1 skipped** (346 before, plus 22 identity tests, plus 12 safeguard tests); ruff clean. See also the second round below |
| New smoke client against the **live** service (old build) | 23 normal checks pass with no truncation; the new bucket check **fails** as it should (`remaining: [233, 232, 237, 239, 236, ...]`), so it detects this bug |
| Production image rebuilt from the working tree (`profile-intelligence:render-11f`, Dockerfile.render) | builds; image scan: **no findings**, 74 application files equal to the bundle, 4 private hashes checked |
| Local Docker behind a Render like proxy chain (`<visitor>, <one of three edge addresses>`), PROFILE_TRUSTED_PROXY_HOPS=2 | smoke test **23 of 23** including the bucket check (remaining falls 231, 230, ... 222). Visitor A with a different made up prefix on all 34 searches: 30 answered, 4 refused. Visitor B on the same edge: 3 of 3 answered. 429 body, `Retry-After: 60`, `RateLimit-*` headers unchanged |
| Same chain, hops=1 (what is live) | bucket check **fails** (`[238, 236, 235, 237, 235, ...]`) and 34 of 34 searches are answered: the Render symptom reproduced |
| ML parity on the new image | 60 of 60 searches identical to the validated results, largest score difference 0, 0 errors |
| Memory | about 434 MiB cgroup (includes file cache) at 512 MiB limit; unchanged code path for models |
The Render like proxy and the test containers were temporary and are removed. The image `render-11f` and all earlier images are kept. The test proxy script is only in the session scratch folder, not in the repository.
What is not proven: that Render's real layout is `<visitor>, <edge>`. Only the live measurement can prove it.

## Deployment plan (needs your separate approval for each step)
1. **Commit** the code and test files (ratelimit.py, config.py, main.py, smoke_test.py and the two new test files) and push the branch. No auto deploy, so nothing happens on Render yet.
2. **In the dashboard**, on the existing service only: Environment, add `PROFILE_TRUSTED_PROXY_HOPS=2`, then Manual Deploy of the new commit (Free plan, no other change). Expect a build of 10 to 20 minutes and about 80 s to start. Note the previous deploy for rollback.
3. **Measure** (from this Mac, no proxy): `python app/backend/scripts/smoke_test.py https://profile-intelligence.onrender.com --no-proxy --check-rate-limit-identity` must report 24 of 24.
   - Accept only if remaining falls by exactly one on new connections **and** made up forwarded prefixes change nothing.
   - If the bucket check fails with all buckets still shuffling: try 3 (env change, restart only, about 80 s).
   - If made up prefixes change the bucket: the number is too large. Set it back to 1 and stop; report.
4. Also check two clients are separated: the user opens the site on a phone on mobile data and runs searches while this Mac runs its own; the two remaining counts must be independent.
5. Run 34 searches in a minute from this Mac: expect about 30 answered and 4 refused with the safe 429.
6. Once the value is proven, bake it into `Dockerfile.render` and `render.yaml` and `render.md` (so a rebuilt service does not depend on a dashboard value), commit and push, no redeploy needed until the next one.
**Rollback:** Dashboard, Events, Rollback to the previous deploy; or remove the environment variable (back to today's behaviour, no harm).
**Cost:** one build (build minutes: about 15 of 500) and one restart. No payment details involved.

## Remaining risks
1. The hops value is verified only by measurement after deploy (steps 3 and 4).
2. Both Render env changes and deploys restart the service, so the first visit afterwards is a cold start of about 80 s.
3. No global search budget: many different visitors could still slow the 0.1 CPU service together. Optional, your call.
4. The `Connection: close` truncation is Render's edge. Real browsers are unaffected, and the smoke test now handles it, but a simple script client without gzip will still see short reads.

## Second round (review requests: proxy assumptions, global safeguard)
Nothing redeployed and the Render configuration was not touched.

### 1. Security assumptions behind `PROFILE_TRUSTED_PROXY_HOPS`
| Question | Evidence | Status |
|---|---|---|
| Can a request reach the application without passing Render's front end? | `profile-intelligence.onrender.com` resolves to two Render owned addresses (216.24.57.16 and .18, not in Cloudflare's published ranges, so Cloudflare serves them on Render's behalf). Every response carries `server: cloudflare`, `cf-ray` and `x-render-origin-server: Render`. Render's documentation says a Free web service cannot receive private network traffic, so Fraud-Risk-Intelligence or any other service in the workspace cannot call it directly, and inbound IP rules apply to the public side only. No port scanning of Render's infrastructure was done. | No direct path found from outside. Documented, not provable from here |
| Does Render strip a visitor's own `X-Forwarded-For`? | Render's documentation is silent. A community report says the proxy appends and does not strip. My live test agrees: with the old build, made up prefixes never moved a request to another bucket, because the app reads from the right. | Assume it does **not** strip. The design needs only that entries to the **right** of the visitor are added by Render |
| Could visitor controlled headers choose the bucket? | Only `X-Forwarded-For` is read. `True-Client-IP`, `X-Real-IP`, `Forwarded`, and a client sent `CF-Connecting-IP` (refused with 403 at the edge) never changed the bucket on the live service. The tests prove invented prefixes and a second header line cannot choose it, and that an invalid chosen entry falls back to a shared bucket. | Safe by construction, verified |
| Is the layout `<visitor>, <edge>`? | Not documented. Consistent with the live symptom (the last entry changes among a few edge addresses). | **Unproven until measured after deploy** |
A stable bucket is not proof it is the visitor: if the layout were `<visitor>, <cdn>, <edge>` with a stable `<cdn>`, setting 2 would look stable while giving every visitor in one region the same bucket. So the post deploy check must also include **independence**: (a) the same Mac over IPv4 and over IPv6 must give two separate counts (they interleaved on the old build), and (b) a phone on mobile data must be independent of the Mac. If any of these fails, the setting goes to 3 or back to 1. I did not switch to `True-Client-IP` or `CF-Connecting-IP`: it is only reported by third parties that they are set and unspoofable, and it cannot be verified from here.
If the setting were wrong and a bypass existed, the global safeguard below still limits total load.

### 2. Global search safeguard
**What and why.** Measured on the Free plan limits (0.1 CPU, 512 MB, production image): a short search takes about 0.9 s, and 80 searches from 8 threads took 120 s (about 40 a minute); 16 threads of 2,000 character searches took 280 s (about 17 a minute), with a median wait of 56 s and a worst case of 99 s. The cost of one search varies about four times with its length, so a count per minute is the wrong unit. The safeguard bounds searches **in progress**: at most `PROFILE_RATE_LIMIT_MAX_INFLIGHT_SEARCHES` (default 4, 0 turns it off) at once from everyone, of which one visitor may hold `PROFILE_RATE_LIMIT_MAX_INFLIGHT_PER_VISITOR` (default 2). A search over the bound is refused at once with `429`, code `busy`, `Retry-After: 5`. The existing page already shows its "Too many requests, try again" panel with a retry button for a 429, so no frontend change is needed. The 30 a minute per visitor limit, the models and the answers are unchanged.
**Fairness.** It counts only requests the per visitor limit already let through. A request refused for being busy gives its slot back, so nobody loses their own quota to it. A visitor is refused for holding more than their share before a stranger is.
| Scenario (Free plan limits, local, invented text) | Safeguard off | Bound 4 |
|---|---|---|
| Flood: 16 addresses, 2,000 character searches non stop for 90 s | 35 answered, **median wait 61 s**, max 75 s; the polite visitor waited about 60 s | 26 answered, **median 14.6 s**, max 19 s; 747 refused at once; health 200 afterwards. The polite visitor got 1 of 18 through (the flooders retry every second) |
| Same flood, bound 6 (first default, rejected) | | median 27 s, polite visitor 0 of 20 |
| Realistic busy: 7 visitors searching every 4 s after each answer | not run | 72 answered, 13 refused with "busy, try in 5 seconds", median 2.8 s. This is the most the service can serve (about one search a second) |
| One to three visitors at a time (the expected use) | | never reaches the bound (3 of the 4 slots) |
Honest limits: under a sustained flood from many addresses, the service stays alive and fast for the searches it admits, but a polite visitor can still be turned away repeatedly, because the safeguard cannot tell visitors from attackers. A per visitor rate cannot fix that, only the host's own protection can. After a client disconnects, the search thread may finish after its slot is returned, but the existing gate of 2 still bounds real CPU use.
**Tests (12 new, `tests/test_global_safeguard.py`)**: bound enforced and released, refusal does not use up the visitor's quota, the visitor's own limit is checked first, one visitor cannot hold more than their share, health and other pages unaffected, slots returned after a failure and after a cancel, 0 turns it off, the refusal is safe JSON that names no address, setting default and validation, and **identical search answers with the safeguard on or off**.

### Results of the second round
| Test | Result |
|---|---|
| Backend suite | **380 passed, 1 skipped**; ruff clean |
| ML parity on the current code in the production image (192 searches: both methods, both k, examples, pool and edge texts) | **192 of 192 identical** to the validated results, largest score difference 0 |
| Image | the full rebuild failed once because the local Docker disk was full (build cache pruned; no release image deleted), so the new code was tested as an overlay of three files on the previous production image. A full rebuild is needed before deployment, which Render does itself |

### Updated deployment plan
Steps 1 to 6 stand, with these additions. Step 2: nothing new to set, the safeguard defaults are in the code. Step 3 adds: IPv4 versus IPv6 independence from this Mac. Step 4 (phone on mobile data) is **required**, not optional. After step 5, one burst of 8 parallel searches from this Mac should show at most 2 running at once and the rest answered or refused with `busy`, and `/api/v1/health` must stay 200.
Rollback unchanged. To switch the safeguard off alone: set `PROFILE_RATE_LIMIT_MAX_INFLIGHT_SEARCHES=0` and restart.
