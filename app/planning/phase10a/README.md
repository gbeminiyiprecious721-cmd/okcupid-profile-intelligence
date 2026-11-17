# Phase 10A: final visual and functional review

Written 17 November 2026. Nothing was committed, pushed, deployed or paid for. **Waiting for your review.** Phase 10B has not started.

## Open the app on your MacBook
The app is running now as container `pi-staging`, image `profile-intelligence:staging-20261117-1`, strict limits. Open **http://127.0.0.1:8080** in Chrome or Safari. It answers on this Mac only.

| Task | Command (run from the project folder) |
|---|---|
| Start after a restart of the Mac | `colima start` then `app/deploy/run_local_staging.sh profile-intelligence:staging-20261117-1 -d` |
| Stop | `docker stop pi-staging` (the container is removed when stopped) |
| Restart | `docker stop pi-staging; app/deploy/run_local_staging.sh profile-intelligence:staging-20261117-1 -d` |
| Is it running | `docker ps` and `curl http://127.0.0.1:8080/api/v1/health` |
| Roll back to the previous version | `docker stop pi-staging; app/deploy/run_local_staging.sh profile-intelligence:staging-20261116-10 -d` |

**Images kept:** latest `staging-20261117-1` (Phase 10A) and rollback `staging-20261116-10` (the Phase 9C build you last saw). Older images (`-3` to `-9`) are still on disk and nothing was deleted.
The classification demo needs a local mode backend with the classifier file, so in the container the page shows the public evidence and the switched off message. The demo itself runs from source (`PROFILE_APP_MODE=local`) and its tests pass.

## 1. Review of every page
I opened all nine pages in light and dark, on a desktop and a phone width, plus the Discovery states (landing, results, profile dialog, comparison dialog).

| Page | Finding |
|---|---|
| Home | Matches the approved reference as recorded in Phase 9A, with its three recorded deviations. Headline, three actions, four figures from the verified summary, three feature cards, findings and limits. No change needed |
| Profile Discovery | Coherent. Three step strip, form, results with rank, score tile and evidence, method tabs, overlap graphic. Score tile says "similarity", never probability or compatibility. No change needed |
| Research overview, Segments, Model performance, Profile similarity, Fairness | Consistent page icon, In short card, section rules, chart containers. **One bug on Segments** (below) |
| Classification evidence | Consistent. Public mode shows the evidence and says the demo is off |
| About | **The weakest page**: plain text beside the other pages' cards, no icon, no summary, and a stale sentence "A fuller version follows in Phase 7". Fixed |

## 2. Improvements made (two, both small)
1. **About page** now follows the same design as the Lab pages: page icon, an In short card, section rules, glass cards for the data note, privacy choices and limits (check mark and warning icons). The stale Phase 7 sentence is gone. The wording of the facts is unchanged.
2. **Segments label bug.** "Answers more common here than overall" showed `body: type: athletic`, `diet: type: missing`, `education: level: masters` because every underscore became a colon. It now reads `body type: athletic`, `diet type: missing`, `education level: masters`. The values and ratios are unchanged.
Tests added: 1 unit test for the label rule and 1 for the About page (summary, headings, no leftover plan text, "Similar writing is not compatibility").
No new features and no redesign. Frontend only, plus one audit script change (see 4).

## 3. Wording check
Searched all page code: "compatibility" appears only to deny it (Discovery, Home, Footer, Overview, Similarity, Fairness, About). "Probability" appears only on the drinking classifier page, about drinking categories, with the note that these are not true frequencies. Similarity is never called a probability, a match chance or compatibility.

## 4. Test results (all run on this Mac, final code)
| Suite | Result |
|---|---|
| Frontend unit, lint, types, build | 199 passed (197 before, plus 2 added), lint and types clean, build ok |
| Backend (pytest, ruff) | 337 passed, 1 skipped, ruff clean |
| Container, 4 browser profiles (Chrome, WebKit/Safari engine, iPhone 15, Pixel 7) including axe, keyboard, reflow, text spacing, security headers | **540 passed, 16 skipped, 0 failed** |
| Chrome dev | 124 passed, 1 skipped |
| Chrome production build with security policy | 150 passed, 1 skipped |
| Chrome local mode (classification demo) | 14 passed |
| WebKit (Safari engine) production build | 133 passed, 6 skipped |
| Smoke test on the running container | 22 of 22 |
Skips are the same ones as before (Safari does not Tab to links by default, one screenshot only test, one data dependent backend test).
**Not run:** Firefox (needs the Linux Docker runner, not asked for in this phase). Real Safari with VoiceOver is manual, see 7.
**A mistake I made and corrected:** my first container run showed 44 failures. They were my test set up, not the app: the container's general rate limit (240 requests a minute) answered 1,330 requests with 429 because only the search limit had been raised for the run. With both limits raised **for the test run only**, 540 passed and there were no 429s. The container you use runs with the normal limits.

## 5. Performance and privacy
| Check | Result |
|---|---|
| API latency in the container (2 CPU virtual machine) | health and reads about 1 ms; search both methods 20 to 21 ms; TF-IDF only 3 ms; 2,000 character text 56 ms. Same as Phase 8B |
| Memory | 406 MiB of the 1 GiB limit |
| Strict run | read only file system, all capabilities dropped, 1 GB limit, published on 127.0.0.1 only (verified with `docker inspect`) |
| Image scan | 45,716 files, 4 private hashes checked, **no findings**, 74 application files identical to the bundle. One third party note as before (a test token inside the Transformers library) |
| Real essay exposure audit (441,351 essays) | **pass**: 0 matches that are not allowed. See the note below |
| Protected files | notebook, README, synthetic profiles, lab summary, all search and classifier files: SHA 256 identical before and after (`hashes_before.txt`, `hashes_after.txt`) |
| Network | no Tailscale change; the Tailscale daemon is not running on this Mac now (read only check), so nothing is shared. Nothing committed, pushed or deployed |

**Audit note, needs your decision.** The audit first reported FAIL on four windows of seven words: "one two three four five six seven" and so on. It is the list of number words that Phase 9C added to the page's own code to write "two groups" instead of "2 groups". A real essay can count to ten, so it matches. It is not essay text. I changed `audit_exposure.py` so this one known counting sequence is counted apart, the way fixed answer labels already were (the report now shows `matches_that_are_the_number_words_in_our_code: 4`). Everything else still fails the audit. This is a narrow allowance in a checking script, so please confirm you accept it. I also gave the script a `--report` option. Before that, my run overwrote `app/planning/phase7_exposure_audit.json`, the Phase 7 record. I could not restore its original counts, so I added a note in it saying so. The Phase 7 result itself was no matches.

## 6. Screenshots
`before/` and `after/` hold every page: `main/` (home, discover, about), `lab/` (overview, segments, models, similarity, fairness, classify) and `discover/` (landing, results, profile dialog, comparison dialog), desktop and phone, light and dark. Only About and Segments changed. Open `compare.html` to see them side by side.

## 7. Outstanding issues for you
1. **VoiceOver** (manual, needs you): follow `app/deploy/voiceover_checklist.md` in Safari on this Mac at http://127.0.0.1:8080. Nothing automated can replace it.
2. **Confirm the audit allowance** described above.
3. The container is not restarted by the Mac. After a restart run the two start commands in the table.
4. The classification demo is not in the container by design (it needs the classifier file, which stays out of the image). To see it, run the app from source in local mode.
5. Firefox was not rerun this phase. Last result (Phase 9C): standalone axe 0 violations, test runner had 5 known automation crashes.
6. Not changed, still open from earlier: Tailscale state and the open access policy (your decision), hosting choice (postponed).
