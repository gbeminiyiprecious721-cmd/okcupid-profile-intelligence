# Phase 11A: Render Free plan deployment readiness

Written 17 November 2026. **Nothing was deployed, pushed, committed, created on Render or paid for.** The existing Fraud Risk Intelligence service was not touched (this work cannot see your Render account). Research files, models, synthetic data, Tailscale and network settings are unchanged. Waiting for your review.

## Verdict
**Ready to attempt on the Free plan, but not guaranteed. The first real deploy is the test that matters.**
- On this Mac (native arm64) the application now runs inside Render's Free limits (512 MB, 0.1 CPU) with about 345 MB of anonymous memory after start and about 385 MB after sustained concurrent searching, and no out of memory kill in any run. That leaves roughly 125 MB of headroom.
- **Not proven:** the memory use on a real Linux amd64 host. Render runs amd64. This Mac can only emulate it, and the emulator's own memory counts against the limit (the emulated container was killed at 512 MB, and used 587 MB at 2 GB), so that run says nothing reliable about the real figure. I expect amd64 to be close to the arm64 figure but I cannot show it.
- **Slow by design of the plan:** 0.1 CPU. A search takes about 0.6 seconds. The service needs about 65 to 75 seconds to load after every sleep, longer than Render's "about a minute" for waking a service.

## 1. Where the memory went (measured, native arm64 image)
| Stage | Resident memory |
|---|---|
| Python, numpy, scipy, scikit-learn | 140 MB (of which pandas, imported by scikit-learn itself, about 30 MB) |
| + PyTorch | 340 MB |
| + `sentence_transformers` package | 460 MB (this package alone added about 100 MB, used only to run the model's pooling and normalisation) |
| + model weights and index | 551 MB |
Anonymous memory is what counts against a container limit. The cgroup also counts the file cache, which the kernel gives back under pressure.

## 2. Changes made (all keep every number identical)
| Change | Effect |
|---|---|
| **Lean encoder** for serving: `transformers` tokenizer and model, with mean pooling and the two normalisations written out, instead of the `sentence_transformers` package. The index is still built with the package, as before | about 100 MB less memory; startup 174 s to 71 s at 0.1 CPU; a search 1.2 s to 0.6 s |
| **pandas removed** from the image. It was imported only by scikit-learn (optional) and by the local only classifier, which is now imported lazily | about 20 to 30 MB less; 3,000 fewer files |
| **One PyTorch thread** (`PROFILE_TORCH_THREADS=1`, plus `OMP_NUM_THREADS`, `MKL_NUM_THREADS`) and **at most two searches at once** (already the default) | stops 0.1 CPU being shared by many threads; vectors are the same at any thread count (tested at 1, 2 and 4) |
| `MALLOC_ARENA_MAX=2`, `TOKENIZERS_PARALLELISM=false` | keeps the memory allocator from growing per thread |
| Package version read from metadata instead of importing the package | the same check, no 100 MB import |
Not changed: scikit-learn (the TF-IDF vectorizer is a stored scikit-learn object), PyTorch, the model, its weights and precision, the index, rankings, scores, explanations, security controls.

## 3. Exactness
| Test | Result |
|---|---|
| Lean encoder against the package, single texts (813 in the container, 211 in the unit test, including 400 word and non Latin texts, and one word texts) | **bit for bit identical** |
| Thread count 1, 2, 4 | identical |
| 192 real API searches (both methods, k 3 and 10, 32 texts), image before against image after | **192 of 192 identical**: same rankings, scores, shared words, themes and answers |
| Same searches, Linux amd64 image (emulated), 60 of them | **60 of 60 identical** to the arm64 results, largest score difference 0 |
| Notebook, README, synthetic profiles, Lab summary, local search and Tier 1 files | SHA 256 unchanged |
| Backend tests | 346 passed, 1 skipped (342 before, plus 4 new); ruff clean |
| Real essay exposure audit (441,351 essays) | pass: 0 failures, the approved four number word windows only |
On a Mac the package silently uses the Apple GPU, which rounds about 1e-7 differently from the CPU. The comparison is on the CPU, as in the container and on Render.

## 4. Measured under Render's Free limits (512 MB, 0.1 CPU, read only, no swap)
| | Before (image used so far) | After (lean) |
|---|---|---|
| Time to the first healthy answer (3 runs after) | 174 s | **64, 66 and 72 s** |
| First search after start | n/a | 0.3 to 0.5 s |
| Anonymous memory after start | 378 MB | **345 MB** (cgroup total 418 MB with file cache) |
| 30 searches one after another, median | 1.2 s | **0.6 s** |
| 80 searches, 8 at once | median 14 s | **median 8 s**, 80 of 80 answered |
| 80 long (2,000 character) searches, 16 at once | median 66 s, peak 512 MB | median 67 s, peak 512 MB (file cache), **anonymous 369 MB**, 16 limit hits, 80 of 80 answered |
| Out of memory kills, restarts, errors | 0 | **0** |
The 16 at once test is far harsher than a portfolio demo and queues because of the 0.1 CPU. The cgroup total touches 512 MB only through the file cache, which the kernel gives back; anonymous memory stays under 400 MB.
The raw answer files of the parity searches (`parity_*.json`, 2 MB, invented profiles only) are kept on the developer's computer and are not in Git; `parity_check.py` regenerates them.
Files: `baseline_native_512m_cpu0.1.json`, `lean_native_512m_cpu0.1.json`, `cold_starts_lean_native_512m_cpu0.1.json`, `lean_amd64_emulated_2g.json`.

## 5. Linux amd64 compatibility
- The Dockerfile built for `linux/amd64` with every pinned package resolving to an amd64 wheel: Python 3.12, torch 2.15.0+cpu, scikit-learn 1.9.1, numpy 2.5.4, scipy 1.18.1, transformers 5.23.0. pandas absent.
- It starts, serves, and returns identical answers (section 3).
- The embedding index inside that test image was copied from the arm64 build, because building it under emulation did not finish in over half an hour. On Render the index is built natively on amd64 during the build. Embedding rounding differs by about 1e-7 between architectures, which cannot change a ranking except between two profiles tied to seven decimals. The 60 matching searches show it did not here.
- Memory on amd64: see the verdict. A QEMU emulated run is not a valid memory measurement.

## 6. Render Free plan (from Render's documentation, fetched today)
| Item | Fact |
|---|---|
| Compute | 512 MB memory, 0.1 CPU |
| Sleep | spins down after 15 minutes without traffic; waking takes "about one minute" (this application needs about 70 s) |
| Instance hours | 750 per workspace per month, shared by all your free services. One service awake all month uses about 720 |
| Bandwidth and build minutes | limited and shared per workspace; with no payment method, using up bandwidth suspends free services for the rest of the month. The Free page gives no figure; the build page lists 500 minutes for the Hobby workspace plan |
| Other | no persistent disk, one instance, no shell, may be restarted at any time |
| Docker | builds from a Dockerfile in the Git repository (`dockerfilePath`, `dockerContext`), BuildKit, multi stage allowed. Binds `0.0.0.0:$PORT` (default 10000). Health check path must return 2xx or 3xx within 5 s; a new deploy must become healthy within 15 minutes or it is cancelled. Pre built images must be linux/amd64 |
| Not found in the docs | any Free specific out of memory behaviour, the port scan timeout, the build architecture for Dockerfile builds, a Free build memory figure |
Sources: render.com/docs/free, /docker, /web-services, /health-checks, /build-pipeline, /blueprint-spec, /outbound-bandwidth, /deploying-an-image, /compute-plans.

## 7. Deployment configuration prepared (not applied)
- `app/deploy/Dockerfile.render`: web build, then the **allowlisted bundle** (`make_deploy_bundle.py` runs inside the build and refuses private file types, notebooks, Tier 1 files, local paths and secrets), then the Python environment with the model and index, then a non root runtime.
- `.dockerignore` (repository root), `render.yaml` (one Docker web service, plan `free`, health check `/api/v1/health`, **auto deploy off**, no secrets), and `app/deploy/render.md` with the steps. The existing local Dockerfile also gained the pandas removal.
- Built and tested here from a clean copy of the repository (committed and new files only), which is what Render would receive.

## 8. Privacy of what would be deployed
| Check | Result |
|---|---|
| Image file system scan | 42,716 files, 4 private hashes checked, **no findings**, 74 application files identical to the bundle manifest (77 bundle files, 1.7 MB) |
| Inside the image | the application code, 800 invented profiles and 6 starters, the Lab summary (aggregates) and two notebook figures, the web app, the search index built from the invented profiles, the public embedding model |
| Not in the image | profiles.csv or any essay, the notebook, the classifier and all Tier 1 files, tests, planning documents, credentials, Tailscale or device details |
| Configuration | public mode only; no secret, token or database; classifier endpoints refuse; documentation endpoints off; security headers, rate limiting, request limits and strict content policy unchanged (production checker 18 of 18) |

## 9. Remaining risks
1. **amd64 memory is unproven.** Mitigation: the first deploy; read Render's memory graph and the logs. If it restarts for memory, nothing is lost and the fallback below applies.
2. **Cold start of about 70 s** after each sleep may exceed what a visitor or Render's proxy waits. Optional fix, needing your approval because it changes behaviour: bind the port at once and load the models in the background, so the page opens in seconds and search says "starting" until it is ready.
3. **Rate limiting behind Render's proxy.** The limiter reads the client address from `X-Forwarded-For` (one proxy). If Render adds more hops, visitors could share one limit bucket, which fails safe but could refuse genuine searches. To be checked after deploy.
4. **Shared allowances.** 750 hours and bandwidth are per workspace, shared with any other free service you still run.
5. **Build time and size** on Render's builder are unmeasured (it took several minutes natively here, mostly downloading PyTorch and building the index). The 15 minute limit applies to the deploy becoming healthy, after the build.
6. **The GitHub repository must be connected,** so the application code has to leave this computer. That is a separate approval.
7. The embedding model is downloaded from Hugging Face during Render's build. A Hugging Face outage would fail the build, not the running service.

## 10. If it does not fit
Each of these needs your approval; none was done.
- Render's paid Starter plan (more memory and CPU, always on) is the simplest, but it is a payment.
- Background model loading (risk 2), to make wakes feel fast.
- Keep the Lab and the About pages public and run Discovery only locally. This removes functionality, so only with your say so.
- A different free host with more memory. All the other hosts I know of that give more than 512 MB need a card on file.
- A smaller numerical model (ONNX with 8 bit weights) would cut memory further but changes the vectors and so the rankings. I do not recommend it without a full re-validation.

## Files
`app/deploy/Dockerfile.render`, `render.yaml`, `.dockerignore`, `app/deploy/render.md`, code changes in `profile_api/services/embedding.py`, `artifacts.py`, `config.py`, `main.py`, `scripts/build_search_index.py`, tests `test_serving_footprint.py` and one updated line in `test_classifier.py`, and the measurement files and scripts in this folder (`render_load_test.py`, `parity_check.py`, `cold_starts.py`).
