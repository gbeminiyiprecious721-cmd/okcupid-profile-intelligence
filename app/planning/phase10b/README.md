# Phase 10B: repository audit and Git organisation

Written 17 November 2026. **No push, deployment or cloud action was made.** The only edits are the audit script change with its tests (item 2) and this folder. The commits were made after your approval of this audit.

## 1. Repository state
| Item | Finding |
|---|---|
| Branch | `feature/app-phase1-architecture` at e1a45db (local only, not pushed). It is one commit ahead of `main` |
| `main` | 3ec7789, identical to `origin/main`. Holds the notebook, README and slide deck. Nothing here touches it |
| History | 4fbe48f initial commit, 3ec7789 deck, e1a45db app plan. All three use your GitHub no reply address. None carries an attribution trailer |
| Remote | `origin`, a private GitHub repository. Nothing pushed |
| Changes | 128 paths: 4 modified (`.gitignore`, `app/README.md`, two planning docs), 8 `.gitkeep` placeholders deleted (folders now hold real files), 116 untracked |
| What a full `git add -A` would add | 604 files, 195 MB, of which **191 MB are screenshots**. The repository is 0.6 MB today |

## 2. Exposure audit (the approved number sequence exception)
- The exception is now in tested code: `audit_exposure.py` has `counting_windows()` and `split_matches()`. It allows exactly four windows, the ones inside "one two three four five six seven eight nine ten", and nothing else. Answer labels stay a separate allowance.
- **5 regression tests** (`tests/test_exposure_audit.py`), using an invented stand in for the real essays: the sequence is counted apart and not failed; an unrelated overlap still **fails**; a shuffled or one word changed sequence still **fails**; an unrelated overlap next to the sequence still **fails**; the allowed set is exactly the four windows.
- Real audit rerun after the change: 441,351 real essays, 133,057 served windows, **0 failures**, 1 answer label, 4 number word windows, result pass (`exposure_audit.json` here).
- **Phase 7 record:** my Phase 10A run overwrote `app/planning/phase7_exposure_audit.json`. The original counts were not kept and I have not reconstructed them. The file carries a note saying so. Phase 7's reported outcome was no matches. The Phase 10A and 10B reports hold the current, measured numbers.
- **Extra check on everything that would be committed (not just served text):** 224 text files compared with the real essays. 9 windows overlap, all accounted for, none is essay prose: the four generic phrases in `content/synthetic/spec/blocked_windows.txt` (documented in the datasheet), the answer label with its column name in front (`offspring doesnt have kids but might want`), two NATO alphabet test strings, the number words in the exception, and one generic idiom in a planning document. No synthetic profile text matches.

## 3. Secret and privacy scan (604 files, text files read, images not readable by the scan)
| Check | Result |
|---|---|
| Private keys, GitHub, Hugging Face, OpenAI style, AWS, Slack, Tailscale keys | **none** (the only key like strings are fake ones that test the bundle checker) |
| Environment files | only `app/backend/env.example` (placeholders). No `.env` |
| Real data and models | `profiles.csv`, the three search files and all Tier 1 files are ignored. 8 private files hashed: **no file to be added has the same content**. No `.csv`, `.joblib`, `.npy`, `.npz`, `.pkl` or `tier1` path would be added |
| Email addresses | only fake ones in tests (`someone@example.com`) |
| Local paths | only fake ones in tests (`/Users/someone/...`) |
| Tool names in file contents | **none** |
| **Personal network details (real, need your decision)** | a tailnet address, device names, a suspended server at a hosting provider, and this Mac's home network address, in the Tailscale policy documents, the staging docs and two phase reports. Details are not repeated here. See section 6 |
| Validated files | notebook sha `ca8dafc2...`, README, LICENSE, requirements identical to HEAD. Synthetic profiles, lab summary and all search and classifier artefacts identical to the Phase 10A baseline |
| Ignore rules | `profiles.csv`, `*.csv`, `*.npy`, `*.npz`, `*.joblib`, `app/backend/artifacts/*`, `.venv`, `node_modules`, `dist`, `test-results`, `app/deploy/build/` verified with `git check-ignore`. Private working notes and editor folders are excluded locally through `.git/info/exclude` (kept out of the published `.gitignore` on purpose). The `.gitignore` diff names no tooling |
| Docker | the image is built from the ignored bundle. No bind mounts. It holds the four Tier 0 search files and no Tier 1 file (scan: 45,716 files, no findings) |

## 4. Files
**Commit** (about 4 MB of source and text):
- `app/backend`: `profile_api/`, `tests/`, `scripts/`, `pyproject.toml`, `requirements*.txt`, `env.example`
- `app/content`: `synthetic/` (profiles, spec, datasheet, validation report), `lab/` (summary, its checksum, two notebook figures), `classifier/fictional_inputs.json`
- `app/frontend`: `src/`, `e2e/`, `tools/`, `public/`, config files, `openapi.json`, `package-lock.json`, `.nvmrc`
- `app/deploy`: Dockerfile, `.dockerignore`, scripts, templates, CI drafts, operations, security and staging docs, VoiceOver checklist (after the decision in section 6)
- `app/planning`: the numbered design documents, every phase report (`*.md`) and measurement files (`*.json`, small), the Phase 7 security audit and both exposure records
- `.gitignore`, `app/README.md`

**Do not commit:** `profiles.csv`, `app/backend/artifacts/*` (including `tier1/`), `.venv`, `node_modules`, `dist`, `test-results`, caches, `app/deploy/build/`, and the private working notes and editor folders. All already ignored.

**Keep on disk, leave out of Git (recommended):**
- bulk screenshots, 191 MB: `phase2_screenshots`, `phase4_screenshots`, `phase5_screenshots`, `phase6_screenshots`, and the `before/` and `after/` folders of phases 9, 9B, 9C and 10A, plus every `compare.html` (they only point at those images). Git never forgets committed files, so 191 MB would stay in the history for good.
- `phase10a/container_run.log` (78 KB of test output; the pass counts are in the README) and the small `.txt` result copies.
- Suggested route: a local exclude in `.git/info/exclude` (it publishes nothing), after your approval.

**Commit a small curated set** (about 13 MB): the Phase 10A final screenshots of the home page, Discovery (landing and results), About, and the six Lab pages in dark desktop view, with the phone views of home and Discovery. Your call on the number.

## 5. Commits made on `feature/app-phase1-architecture` (local only)
Files were staged by explicit path. Before each commit the staged list and content were scanned for secrets, tokens, personal network details, local paths, tool names, forbidden file types and any file with the same content as a private file. The code exists only in its final state, so commits follow components, not phases.
1. Update ignore rules and the application notes
2. Add the synthetic profile pool and the approved lab data
3. Add the backend API and its security controls
4. Add the web application
5. Add the container build and local staging tooling
6. Add the planning, test and security reports
7. Add final screenshots
No attribution trailer was added, matching the earlier commits. `main` is untouched and nothing is pushed.

## 6. Decisions taken (17 November 2026)
1. **Network details, option B.** Tailnet address, device names, the other server and hosting provider, and the home network address were removed from the staging documents and two phase reports. The Tailscale policy review, the draft policy, its test and its checker stay outside Git, as do the originals before redaction (`app/deploy/local_only/`, excluded locally).
2. **Screenshots.** The bulk archive is excluded locally and kept on disk. Twelve final screenshots (about 11 MB) are committed in `app/planning/final_screenshots/`: home (desktop dark and light, phone light), Discovery (landing, results on desktop and phone), and the Lab (overview, segments, models, similarity, fairness, overview on a phone). They were retaken with a tall window so the sticky bar appears once, and each was viewed: invented names and aggregate figures only.
3. **Exposure audit exception:** approved, with regression tests.
4. **No commit trailer.**

## 7. Outstanding risks
- **Public release** is not part of this phase. It needs its own checks: personal network details, the dataset terms noted in the notebook, and a second read of every document.
- Screenshots show fictional profiles only, but images were not text scanned. I viewed the main ones; the rest are produced by the app from the invented pool.
- Phase 7's original audit numbers are gone for good (section 2).
- The audit and the tests that use the real essays only run on this Mac, because the data file is private. A later reader cannot rerun them.
- The branch has never been pushed. A disk failure before a push loses it.
- The container image tag is not tied to a commit. After commits the bundle manifest will still be reproducible from the files.

## 8. Confirmation: the application still runs
Container `pi-staging`, image `profile-intelligence:staging-20261117-1`, healthy, **no bind mounts**, so Git operations cannot reach it. `http://127.0.0.1:8080` answers 200, and so does the health endpoint. Nine staging images remain, including the rollback `staging-20261116-10`; none was deleted.
Backend tests 342 passed (337 plus the 5 new), 1 skipped; ruff clean.
