# Phase 6: export verification and test report

Nothing is committed, pushed or deployed. The notebook, root README, synthetic profiles and every research finding are unchanged (SHA 256 checked).

## 1. The export (one run, 60 seconds)
`backend/scripts/export_classifier.py`, run on this computer. It uses the notebook's cleaning, target, split (seed 42, stratified, 20% test) and feature code, then fits the notebook's `best_pipeline` once on the 45,568 training users: structured fields plus TF-IDF text, logistic regression with C = 1.0, balanced class weights and 3,000 iterations. The fit took 49 seconds.

Not done: no tuning, no cross validation, no prediction or score on the test users (they are set aside by the split and never read), no notebook run.

Artefacts, in `backend/artifacts/tier1/` (git ignored, local only):
| File | Holds |
|---|---|
| classifier.joblib | the fitted pipeline (1.5 MB) |
| classifier_meta.json | class order, input fields, hyperparameters, training base rates, the list of checks and their results |
| manifest.json | tier 1, library versions, SHA 256 of the two files, SHA 256 of the data file and of the notebook it came from |

Hashes are checked before anything is unpickled. A changed, missing or wrongly versioned file stops startup.

## 2. Structural checks the export ran (all passed, no test data)
45,568 training users; four classes; C 1.0, balanced, 3,000 iterations; the solver converged (486 iterations); 19 inputs became 124 structured columns as in the notebook; 20,000 TF-IDF terms; coefficients 4 by 20,124; learned medians equal the training medians; an unseen answer does not break the pipeline; training class shares equal the notebook (73.3, 10.5, 10.5, 5.7).
For each of the six fictional examples: every answer is a level the model learned; probabilities are valid and sum to 1; the predicted class is the most probable; the same input gives the same answer.

## 3. Parity with the notebook
`tests/test_classifier_parity.py` compares the feature code with the notebook's own source: four functions (as syntax trees, so any change fails), 21 constants, and the full pipeline parameters built from the notebook's own definitions. 26 checks.

## 4. What the page does
- Six fictional examples, chosen by radio buttons. No text field, no editable sex or location. A request carries only an example name, so there is no visitor input to collect, log or store.
- Shows the predicted category prominently, the four probabilities (rounded so they add to exactly 100%) and the training base rate beside each.
- Explains that probabilities are estimates, not certainty, and are not true frequencies (balanced class weights lift the small groups).
- Evidence from the notebook (aggregates, shown in public mode too): macro F1 0.386 (95% range 0.376 to 0.397), baseline 0.212, accuracy 0.517, baseline accuracy 0.734, per group precision and recall, the confusion matrix (labelled rounded and transcribed).
- Explains macro F1, the lower accuracy, precision and recall, the limits of predicting individuals, the use of sex and location, proxy effects and uneven performance. Labelled educational and experimental.
- Local mode only: public mode returns 403 `local_only`, never loads the files and refuses to start if a tier 1 folder is configured.

## 5. Test results
| Check | Result |
|---|---|
| Backend | 213 passed, 1 skipped (the older local data test). 72 new: 46 classifier tests (including the real artefact) and 26 parity tests |
| Frontend (Vitest) | 155 passed (19 new for this page) |
| Browser, public mode | all earlier suites plus 5 new: 90 passed (one shell test expected the old wording and was updated) |
| Browser, local mode with the real classifier | 13 passed: six examples, valid probabilities, determinism, no free input, no storage, keyboard, failure, responsive, axe |
| Accessibility (axe, WCAG 2.2 A and AA) | 0 violations, public and local, desktop and phone, light and dark, with a result showing and tables open |
| Typecheck, lint, build, ruff, npm audit (production) | clean, 0 vulnerabilities |

## 6. Dependency change
`pandas==3.1.1` was added to the backend requirements (same pin as the root requirements), because the exported pipeline takes a table as input.
