# Phase 5 test report: Data Science Lab

Nothing is committed, pushed or deployed. The notebook, root README, synthetic pool and every model are unchanged (SHA 256 checked).

| Check | Result |
|---|---|
| Frontend unit and component tests (Vitest) | 132 passed (39 new for the Lab) |
| Browser tests (Playwright, system Chrome, real backend) | 35 Lab, 25 shell, 25 Discovery: all passed |
| Accessibility (axe, WCAG 2.2 A and AA) | 0 violations on all five Lab pages, desktop and phone, light and dark, with every chart also switched to its table |
| Backend tests | 138 passed, 1 skipped (local data test); 20 new in tests/test_lab.py |
| Typecheck, lint, production build, ruff | clean |
| npm audit (production) | 0 vulnerabilities |

## How the numbers are protected
- `scripts/export_lab_data.py` reads only the notebook's saved outputs and sentences, with one regex per block. It stops with an error if a pattern is missing. It runs no model and opens no data file.
- The output `content/lab/lab_summary.json` has its hash recorded in `lab_summary.sha256` and the notebook's hash in its provenance. The two figures that exist only as pictures are copied out with their hashes.
- At startup the API checks the hash, then validates the shape with a schema that forbids extra fields, so a text or record field cannot be served. A changed file or figure stops startup.
- Tests: headline values typed from the notebook text; totals add up (split, segments, subgroups); every number in the JSON appears in the notebook text; the export is byte for byte repeatable; the confusion matrix diagonal equals recall; lift equals agreement over chance; no contact detail, URL, name or passage, and no group under 300 users.
- A page level test collects every number written on each Lab page and checks it against the data (a negative control proves it catches a wrong number).

## Pages
Research overview, Segments, Model performance, Profile similarity (new), Fairness and limitations. Classification demo stays a Phase 6 placeholder.

## Verified values the pages show (all from the notebook)
Test macro F1 0.386 (95% 0.376 to 0.397) vs baseline 0.212; validation 0.387; accuracy 0.517 vs 0.734; silhouette about 0.05 (0.085 at two groups); stability 0.98 and 0.97 at six; segment effect -0.0017; subgroups women 0.393, men 0.381, 45 and over 0.327, no text 0.275.

## Known limits of the data
- The confusion matrix percentages and the per k silhouette and inertia curve exist only as figures in the notebook. The matrix is transcribed from the figure (rounded, rows add to about 100) and the curve is shown as the notebook's own image, plus the three silhouette values the text prints.
- The segment drinking check has only two printed figures plus a range for the other four.
