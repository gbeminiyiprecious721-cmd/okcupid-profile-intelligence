# Phase 9, Stage 9A: design system and homepage

Written 16 November 2026. Stage 9A of 3. Stage 9B (Profile Discovery) and 9C (Data Science Lab) are **not started** and wait for approval. Nothing was committed, pushed or deployed.

## What changed
| Area | Change |
|---|---|
| Design tokens (`index.css`) | gold fill and on gold text, card colour, glass edge, glow, two background halos. Each is one `light-dark()` value, so light and dark both follow |
| Page glow | two soft radial halos behind the whole app, drawn on a fixed pseudo element, never as a background image behind text |
| Shared components | `Card.tsx` (`IconBadge`, `StatCard`, `FeatureCard`), a **gold** button variant, `.glass` and `.glass-hover` classes, `ProfileNetwork.tsx` (the illustration) |
| Home page | new headline with the gold phrase, one paragraph on the project, a gold **Try Profile Discovery** button, **Explore the Research** and **About the Project**, the illustration, four research figure cards, three feature cards, and a **findings and limits** section |
| Navigation | the sidebar and routes are kept. Each item gains an icon. The active page keeps the gold thread node and now also has a highlighted card. The sidebar is 18 rem wide so "Classification evidence" fits on one line |
| Figures | read from the verified summary (`useLab`), never typed in: 59,946 profiles, 6 segments, macro F1 0.386 against a 0.212 baseline, 2011–2012 (from "June 2011 to July 2012") |
| Findings | built from the same summary: 0.386 against 0.212, weakly separated segments (silhouette about 0.05) that did not improve validation macro F1, lower macro F1 for users aged 45 and over (0.327), plus the limits |

The illustration is hand drawn SVG, no external artwork. The headline gold phrase follows the reference.

## Deviations from the reference image
- **Feature cards** are all dark glass cards. The reference shows two light pink cards and one dark card. A light card on a dark page would need a second set of text colours in both themes, so I kept one consistent surface. Easy to change if you want the pink.
- **Key Takeaways strip:** the reference says "We can find meaningful user segments". The validated results say the segments are weakly separated and added nothing, so the page states the real findings and limits instead.
- **"See the Project Story"** became **About the Project**, as the brief says. The project story slides are not part of this app.
- The reference's glowing particle photo effect is simplified to a clean glow. It is vector, light and works at every size.
- The reference image itself is not stored in the project, only described here.

## Files
Modified: `frontend/src/index.css`, `components/ui/Button.tsx`, `components/shell/SidebarNav.tsx`, `components/shell/AppShell.tsx`, `lib/nav.ts`, `pages/Home.tsx`, `routing.test.tsx`, `e2e/shell.spec.ts`, `e2e/perf.prod.spec.ts` (output path can be set).
New: `components/ui/Card.tsx`, `components/ui/ProfileNetwork.tsx`, `frontend/tools/screenshots.mjs`, `app/planning/phase9/`.
Unchanged: backend, notebook, models, synthetic data, research results, privacy and security controls, network settings.

## Contrast (WCAG formula)
Lowest pair: gold icon in light mode 6.3:1 (needs 3). Gold button text 9.1:1, headline gold 10.4:1 (dark) and 6.3:1 (light), muted text on a card 8.8:1 and 6.9:1, body text 14.2:1 and 15.0:1.

## Performance (production build, same spec, before and after)
Phone profile (4x slower CPU, slow 4G): LCP 1.38 to 1.41 s on home, 1.64 to 1.68 s on Discovery, within noise. Layout shift: home on a phone 0 to 0.01, all others unchanged, all under the 0.1 limit. JavaScript sent grew about 4 KB (131 KB against 127 KB on home), and the home page makes one more request (the research figures, which the Lab pages then reuse from cache). Data: `perf_before.json`, `perf_after.json`.

## Tests
See the report in the conversation. New tests: 4 unit tests for the home page, 4 browser tests (first view on a desktop screen, keyboard and focus, plus the Part A wording tests on every profile).

## Screenshots
`before/` and `after/`, with `compare.html` to view them side by side.
