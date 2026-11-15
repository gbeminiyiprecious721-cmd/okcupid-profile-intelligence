# Pages, journey and design system

Status: proposal for review (Phase 1). A static preview of the palette, type and key components is in `design_preview.html`. Open it in a browser.

## Who it is for and what it must do

Visitors are people reviewing the portfolio: technical readers who want to try the method, and non specialists who want to understand it. In two minutes a visitor should be able to write a fictional profile, see who is similar and why, and find the evidence and the limits without being told what to conclude.

## Pages and navigation

| Route | Page | Job |
|---|---|---|
| `/` | Home | Say what this is in two sentences, show the two experiences, state the honesty note |
| `/discover` | Profile Discovery | Create a fictional profile, see similar profiles with explanations, compare methods |
| `/lab` | Lab overview | Headline results and how to read them |
| `/lab/segments` | Segments | Six segments, their stability and what defines them |
| `/lab/models` | Model performance | Validation comparison and the single test result, always labelled |
| `/lab/fairness` | Fairness | Subgroup scores on the test set with group sizes |
| `/lab/classify` | Classification demonstration | Educational drinking classifier |
| `/about` | Data, ethics and limits | Data origin, consent, what was done, model card summary, prohibited uses |

**Navigation.** A top bar with the wordmark and three links: Discover, Lab, About. The Lab has its own tab list under the bar (Overview, Segments, Models, Fairness, Classify). On small screens the bar becomes a menu button that opens a full height sheet, and the Lab tabs scroll sideways. A skip link comes first in tab order. The footer repeats the limits in one sentence and links to the repository and the notebook.

## The user journey

1. **Arrive.** Home explains the purpose and offers two clear paths.
2. **Write a profile.** On Discover the visitor picks a starter profile or writes their own text. Lifestyle answers are optional.
3. **Search.** One action, "Find similar profiles". Results appear on the same page, so the profile stays visible.
4. **Understand a result.** Each card says why it is similar: shared answers, shared words, themes. A detail view shows the full synthetic profile.
5. **Compare methods.** A control switches between sentence embeddings, TF-IDF and both side by side. The comparison shows what only one method found.
6. **Check the evidence.** A link on every results page goes to the Lab pages that show how well the method worked on real profiles.
7. **Explore the Lab.** Segments, models, fairness, then the classification demonstration.
8. **Read the limits.** About, linked from the footer and from every page that shows a score.

## Wireframes

Every name and number in these sketches is a layout placeholder, not a result.

Discover, large screen:

```
+------------------------------------------------------------------+
| Profile Intelligence        Discover   Lab   About               |
+------------------------------------------------------------------+
| Fictional profiles only. Please do not enter real details.       |
+----------------------+-------------------------------------------+
| Your fictional       |  8 similar profiles       [Embeddings v]  |
| profile              |                                           |
|                      |  o~~~~~~~~~~~~~  Quiet Cartographer       |
| Start from:          |  |               Similarity  0.71         |
| ( ) Hiker  ( ) Cook  |  |               Shared: diet, pets       |
|                      |  |               Words: trail, maps       |
| About you            |  |                                        |
| [                  ] |  o~~~~~~~~~~~~~  Late Night Baker         |
| [                  ] |  |               Similarity  0.68         |
| 0 / 2000             |  |                                        |
|                      |  Similar writing, not compatibility.      |
| Answers (optional)   |  How well does this work? See the evidence|
| Diet      [        v]|                                           |
| Pets      [        v]|                                           |
| Answers do not change|                                           |
| the ranking.         |                                           |
| [Find similar]       |                                           |
+----------------------+-------------------------------------------+
```

Discover, small screen: one column. The form is first. After a search the results replace the form, and a "Edit profile" button returns to it. The thread becomes a vertical line in the left gutter with a node for each card.

Lab, models tab:

```
 Overview  Segments  [Models]  Fairness  Classify

 Essays beat guessing: macro F1 0.386 against 0.212
 TEST result, 11,393 users, scored once.

 Validation (5 fold, training set)           [View as table]
 structured + TF-IDF   |==============| 0.387
 TF-IDF text only      |============|   0.351
 ...
 baseline              |=======|        0.212
```

Classify:

```
 Educational demonstration. Not a profiling feature.
 Your profile ->  not at all 14%   rarely 18%   socially 51%   often+ 17%
                  base rate        6%           11%            73%        10%
 This model is wrong for many individuals. Precision for the small groups is 0.17 to 0.28.
```

## Components

* **Shell:** AppShell, TopNav, MobileMenu, SkipLink, Footer, LimitsNote.
* **Discover:** StarterPicker, ProfileTextField (counter, personal detail warning), AnswerFields, MethodControl, ThreadCanvas, RecommendationCard, SimilarityMeter, SharedChip, ExplainDrawer, MethodCompare.
* **Lab:** LabTabs, ResultLabel (validation or test), StackedBar, RankedBar, ConfusionMatrix, ProbabilityBars, DataTableToggle, SegmentProfile.
* **Shared:** Button, TextArea, Select, Callout (limit, caution), EmptyState, ErrorState, Skeleton.

Built on Radix primitives for focus handling and keyboard behaviour (Tabs, Dialog, Select, Tooltip), styled with Tailwind.

## The one memorable element: threads

Similarity is drawn as thin gold threads running from the visitor's profile to each result. A shorter, bolder thread means a higher score. The threads draw once when results arrive, staggered by rank. Nothing else on the page moves on its own.

* The threads are decoration. Rank, score and reasons are always in the card text, and the SVG is hidden from assistive technology.
* With reduced motion the threads appear fully drawn.
* On small screens they simplify to a single vertical line with nodes.

Everything else stays quiet: flat surfaces, one border colour, no gradient washes, no identical shadows on every block. The Lab uses charts directly on the page background instead of boxing each one in a card.

## Design system

### Colour

| Token | Hex | Role |
|---|---|---|
| ivory | `#FBF6EE` | page background |
| ivory deep | `#F2E9DB` | surfaces, selected rows, form fields |
| line | `#E3D6C3` | hairlines and card borders |
| plum 900 | `#2B0F30` | headings, dark surfaces |
| plum 700 | `#4F1F57` | primary buttons, links, focus ring |
| plum 500 | `#7A3B83` | secondary chart series |
| rose 700 | `#9E2A52` | accent text, limit notes |
| rose 600 | `#B8325F` | accent buttons and marks |
| rose 100 | `#F8DCE5` | highlight backgrounds |
| gold 700 | `#7A5410` | gold text |
| gold 500 | `#C09A3E` | threads and decoration only |
| gold 200 | `#EBD9A6` | soft highlight |
| charcoal 900 | `#26222B` | body text |
| charcoal 600 | `#5B5561` | secondary text |

Measured contrast (WCAG formula):

| Pair | Ratio | Use |
|---|---|---|
| charcoal 900 on ivory | 14.5 | body text |
| charcoal 600 on ivory | 6.7 | secondary text |
| charcoal 600 on ivory deep | 6.0 | secondary text on fields |
| plum 700 on ivory | 11.7 | links, headings |
| ivory on plum 700 | 11.7 | text on primary button |
| white on rose 600 | 5.7 | text on accent button |
| rose 700 on ivory | 6.7 | accent text |
| rose 700 on rose 100 | 5.6 | text on highlight |
| gold 700 on ivory | 6.3 | gold text |
| plum 900 on gold 500 | 6.5 | text on gold mark |
| **gold 500 on ivory** | **2.5** | **decoration only, never text, never a control border** |

Chart colours. Drinking levels are ordered, so they use one ramp from light rose to plum 900. Segments and model families need six distinguishable categories. The brand palette gives four (plum, rose, gold, charcoal), so the charts add one cool counterweight, deep teal `#2F6F73`, and a light plum. Every series is labelled directly and has a pattern or marker, so colour is never the only cue. The set will be checked for colour blindness in Phase 5. This extension is listed as a decision for you.

### Typography

* **Display: Fraunces** (variable serif). Used for page titles and large numbers. Its soft, slightly old style forms suit a subject about people.
* **Text: Public Sans** (variable sans). Used for everything else. Plain and highly readable at small sizes. Tabular numerals for scores.
* Both are self hosted through Fontsource packages. No request goes to a font service.
* **Scale (px):** 12, 14, 16, 18, 22, 28, 36, 48. Body 16 with line height 1.6. Titles line height 1.15. Line length at most 68 characters.
* **Rules:** sentence case everywhere, no all capitals labels, no decorative eyebrow lines, numbering only for real sequences such as the journey steps.

### Shape, space and depth

* 4 px spacing unit. Page margins 16 px on small screens, up to a 1,120 px content width on large ones.
* Radius by role: 6 px for fields, 14 px for cards, full round for chips and the meter. Different things get different shapes.
* Depth: borders in `line`, not shadows. One plum tinted shadow is reserved for floating layers (drawer, menu).

### Responsive behaviour

Breakpoints: 640, 768, 1024, 1280. Discover is one column below 1024 and two columns above, with the profile panel sticky on the left. Lab charts reflow to full width, keep a minimum height of 240 px, and always offer a table view. Touch targets are at least 44 px on primary controls and never below 24 px.

### Accessibility

Target: WCAG 2.2 AA.

* Landmarks and a skip link on every page. One h1 per page.
* Every field has a visible label, a hint where needed, and an error message linked with `aria-describedby`. Errors say what to change.
* A live region announces the result count after a search.
* Focus ring: 2 px plum 700 with an ivory offset, visible on every control. Checked against all backgrounds used.
* Charts have a text summary, a data table view and direct labels. Meaning never depends on colour alone.
* Reduced motion: no thread animation, no transitions longer than a fade.
* Content in plain language, 8th grade reading level for explanations.
* Tested with axe, keyboard only walkthroughs and a VoiceOver pass before Phase 7 closes.

### Motion

Three kinds only. The thread draw on results (once, about 600 ms, staggered). State changes that answer a click (drawer, tab underline, chip added), 150 to 200 ms. Nothing triggered by scrolling.

### Voice

Plain verbs, sentence case, specific. Actions keep one name through the flow ("Find similar profiles" gives "8 similar profiles"). Limits are stated as facts, next to the number they limit: "Similar writing, not compatibility." Errors explain the fix: "Text is limited to 2,000 characters. Shorten it by 140."
