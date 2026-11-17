# Phase 9, Stage 9C: the Data Science Lab

Written 16 November 2026. Stage 9C of 3, the last. Nothing was committed, pushed or deployed. **Waiting for your review.**

## What changed (presentation only)
| Area | Change |
|---|---|
| Every Lab page | an icon beside the title (hidden on phones) and an **In short** card of three or four statements, so the main result is in the first screen |
| Sections | a thin rule with one gold node marks each new section, the same thread as the navigation |
| Charts | every chart sits in a glass container with a gold top edge. The filters (Method, Show, Order, Metric) are gold selected segmented controls. The readout under each chart is a labelled panel with an icon. The table switch shows its state. Bars, tones, ranges and tables are unchanged |
| Notes and cautions | information notes have a gold edge, cautions a rose edge, with a round icon |
| Statistic cards | refined surface, a small icon on the Overview figures |
| Overview | each research question has a short verdict in a framed label, and a link with an arrow. The five checking steps are a numbered timeline. The glossary is six cards. The limits sit in a panel |
| Segments, Models, Similarity, Fairness | explanation blocks that were plain paragraphs are now cards (why separation is weak, why clustering did not help, what this evaluation cannot show, proxy effects, limitations). Notes under charts have a gold rule |
| Classification evidence (public) and Classification demo (local) | the same surfaces. In local mode the run button is gold. Public mode keeps the name and the switched off message |

## The In short statements
Each one restates something the page already says, with figures read from the verified summary, never typed in. Tests check them and also fail if a summary says "prove", "significant", "noise", "strongly predicts", or calls similarity compatibility except to deny it. The headline figures are asserted exactly: 59,946 profiles, macro F1 0.386 against 0.212, six segments, silhouette about 0.05. The Overview now says adding the groups "did not improve validation macro F1 (the change was −0.0017)", the same conclusion as the Models page.

**No research figure, chart value, table, rounded confusion matrix, caveat or source line was changed or removed.** The existing "every number on a Lab page comes from the approved data" test covers the new text too.

## Found and fixed during this stage
1. A page icon meant to be hidden on phones was not (its own display class won), which pushed the Classification title 0.5 px past the edge at 320 px. Fixed with a wrapper, and a new test checks all six pages at 320 px, including every chart container.
2. The Discovery loading placeholder was shorter than a screen, so the footer showed at the bottom edge and then dropped out of view when the form arrived (a small layout shift, 0.018 to 0.02 on desktop and 0.071 on a phone). The placeholder now has a full screen of height. **Layout shift on Discovery is 0 on both.**
3. A keyboard test was intermittently measuring a link before the browser had finished scrolling it into view (1 failure in about 10 runs). It now waits two frames, like a person would. 12 runs in a row passed, desktop and mobile. The test also reports what covers an element if it ever fails.

## Files
Modified: `index.css` (surfaces moved into a style layer so utility classes can override them), `components/ui/PageHeader.tsx`, `components/charts/charts.tsx`, `features/lab/common.tsx`, `pages/LabOverview.tsx`, `Segments.tsx`, `Models.tsx`, `Similarity.tsx`, `Fairness.tsx`, `Classify.tsx`, `pages/Discover.tsx` (loading height only), `lab.test.tsx`, `e2e/lab.spec.ts`, `e2e/a11y.spec.ts`.
New: `lib/numberWord.ts`, `frontend/tools/lab-shots.mjs`, `app/planning/phase9c/`.
Unchanged: backend, notebook, models, synthetic data, research results, privacy and public mode controls, Tailscale and network settings.

## Performance (production build, same spec, Stage 9B build against this one)
Phone LCP on Overview 1.86 s to 1.63 s and on Model performance 1.88 s to 1.66 s (faster, partly noise), unchanged elsewhere within about 4 percent. JavaScript sent grew 2 to 3 KB compressed. Layout shift: Overview 0.031 to 0.005, Discovery on a phone 0.071 to 0, Model performance 0.036 to 0.042, the rest unchanged, all under 0.1. During a search: 0. Data: `perf_before.json`, `perf_after.json`.

## Screenshots
`before/` and `after/` hold all six pages, desktop and phone, dark and light, full page. `after-local/` holds local mode "Classification demo". Open `compare.html` to see them side by side.
