# Phase 9, Stage 9B: Profile Discovery

Written 16 November 2026. Stage 9B of 3. **Stage 9C (Data Science Lab) is not started** and waits for approval. Nothing was committed, pushed or deployed.

## What changed (presentation only)
| Area | Change |
|---|---|
| Introduction | the fictional profile notice (same words, same role) and a three step strip: write or choose a profile, choose how to compare, read why each matched. Kept short so the form stays near the top |
| Form | glass surface, example chips with a small gold mark, a glowing textarea focus, the three comparison methods as choice cards with icons (selected one outlined in gold), and a large gold **Find similar profiles** button, full width on a phone, pressing feels physical. Validation, limits, counters and messages are unchanged |
| Results | each profile is a card with a gold rank badge, the name, a score tile, and an evidence panel split into **Words you both use**, **Themes** and **Lifestyle answers you share**, each with its own icon and dividers |
| TF-IDF and embeddings | each list has its own header card: an icon, a gold edge for words (TF-IDF) and a rose edge for meaning (embeddings) |
| Both methods | **Where the two methods agree** now has two overlapping circles drawn from the real overlap count. A profile returned by both methods is marked **Found by both methods** in each list. The method tabs became a segmented control with a gold selected tab |
| Connecting lines | the gold lines from your profile to the lists are kept, with a soft glow. They draw once and rest |
| States | loading skeletons, empty results, errors with retry, profile dialog and comparison dialog share the glass surfaces, with a gold edge on dialogs. Behaviour and texts are unchanged |
| Phones | the search button is full width. When a search finishes, the page scrolls to the results (smoothly, or instantly under reduced motion). Nothing takes focus, and the live region still announces the result. Cards, tabs and dialogs fit 320 px with no sideways scroll |

**Unchanged:** the search request and response, TF-IDF and embeddings, the ranking order, every score (shown to three decimals exactly as sent), the explanations, input validation, limits and privacy notices. Similarity is never called probability or compatibility, and a test checks it.

## A fix the new tests found (affects every page)
When keyboard focus landed near the bottom edge of the screen with the comparison tray showing, Firefox scrolled the control **under the tray**. Firefox does not apply scroll padding to focus. This is WCAG 2.4.11 (focus not obscured). Chrome and Safari were already fine, and the old page layout hid the problem in Firefox. `FocusClearance` in `AppShell.tsx` now measures where keyboard focus lands and scrolls just enough to clear the sticky top bar and the tray. It acts **only for keyboard focus**: my first version also ran for a mouse press, which moved a control between press and release and lost a click on a chart filter. A test caught that too, and it is covered by a unit test now.

## Files
Modified: `features/discover/ProfileForm.tsx`, `Results.tsx`, `ResultCard.tsx`, `Explanation.tsx`, `Skeleton.tsx`, `CompareTray.tsx`, `ThreadLayer.tsx`, `Dialogs.tsx`, `pages/Discover.tsx`, `components/shell/AppShell.tsx`, `discover.test.tsx`, `e2e/discover.spec.ts`, `e2e/perf.prod.spec.ts`.
New: `features/discover/Intro.tsx`, `OverlapMark.tsx`, `frontend/tools/discover-shots.mjs`, `app/planning/phase9b/`.
Unchanged: backend, notebook, models, synthetic data, research results, privacy and security controls, network settings.

## Performance
Production build, same spec, before and after (before = the Stage 9A build served the same way). Discovery sends about 2 KB more JavaScript (147 KB against 145 KB, compressed). Phone LCP on Discovery 1.65 s to 1.70 s, within run to run noise (pages I did not touch moved by the same amount). Layout shift on page load is unchanged (0 on desktop, 0.071 on the phone, which was already there). **Layout shift during a search: 0 on desktop and on a throttled phone.** Data: `perf_before.json`, `perf_after.json`, `search_layout_shift.json`.

## Screenshots
`before/` and `after/` (landing, results, profile dialog, comparison dialog; desktop and phone; light and dark). Open `compare.html` to see them side by side.
