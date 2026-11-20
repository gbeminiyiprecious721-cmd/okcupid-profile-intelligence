# Phase 4 test report

Run against the real backend (public mode, synthetic pool of 800). Nothing is committed, pushed or deployed.

| Check | Result |
|---|---|
| Frontend unit and component tests (Vitest) | 99 passed (was 78) |
| Browser tests (Playwright, system Chrome) | all passed, including the Discovery journeys and axe (the full run also takes the screenshots) |
| Typecheck, lint, production build | clean |
| Backend tests | 118 passed, 1 skipped (local only data test) |
| Backend lint | clean |
| axe WCAG 2.2 A/AA | 0 violations on results, profile dialog, tray and compare dialog, desktop and phone, light and dark |
| Notebook and root README hashes | unchanged |

## Inverse frequency weighting (documented in src/lib/weighting.ts)
bits = log2(1 / share), share = fraction of pool profiles giving the answer (from the API).
Shared by 25% or fewer: distinctive. Over 50%: common, set aside with a "very common, so not telling" line.
Presentation only. It never touches the ranking, which the API computes from text alone.

## Backend change
`/api/v1/meta` now includes `answer_shares` (answer frequencies in the synthetic pool), so the compare dialog can weight answers shared between two profiles. No ranking code changed.

## Journeys covered
Both methods, each method alone, starter profile, lifestyle weighting, profile detail, compare two (third blocked), empty / whitespace / too short / too long text, contact details only, details removed and counted, words outside the vocabulary, 500, unreachable, 503, slow search with skeleton, missing profile, phone and tablet layouts (no sideways scroll, 44px controls), keyboard only run with focus return, reduced motion, thread draws once.

## Refinement: shared keywords in the compare dialog
Code: `app/frontend/src/lib/sharedWords.ts` (replaces the old `commonWords`). Only the two fictional texts are read. Ranking, scores, the backend and the synthetic data are untouched.

What changed
- Generic words are no longer keywords: function words (with, because, without), and generic content words (way, thing, really, good, favourite, friends, conversation, work, idea, hour, minutes and about 250 others). Generic words can still sit inside a phrase when the other word is distinctive ("old maps").
- A trailing plural is ignored when matching ("weekend" matches "weekends"). The first text's spelling is shown.
- Neighbouring shared words become one phrase and run as far as they go ("second hand bookshops"). The single words inside are dropped, so nothing repeats. Punctuation or a new line ends a phrase.
- Order: phrases, then words used more often in both texts, then longer words, then alphabetical. At most six.
- Context: each keyword shows a short quote from each text.
- Empty result shows exactly: "No meaningful shared keywords found."

Audit on the real synthetic pool (about 4,000 random pairs, run once, not kept in the repo)
- Before tuning, the most frequent shared word was "favourite" in 8% of pairs, then friends, learning, open, conversation, idea, half, trip.
- After tuning, the most frequent are concrete topics: weekends, flat, stubborn, dog, reading, stories, kitchen, book, animals.
- Random pairs often share nothing meaningful (about 60% show the empty message). Pairs picked from search results share more.
- Limit: the generic list was tuned on this pool's wording, so it is a heuristic, not a model.

Tests added: 21 in `sharedWords.test.ts` (generic words, function words, contractions, distinctive words, plurals, phrases, punctuation breaks, ranking, repeats, the six word limit, context quotes, empty and punctuation only text, no overlap, accents and curly apostrophes, non Latin text, symmetry, a 20,000 word text in under 1.5 s, the exact message), 2 component tests (generic "way" left out with context shown, and the empty message), and a real data check in the compare browser test.
