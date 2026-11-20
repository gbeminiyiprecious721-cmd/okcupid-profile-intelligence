# Manual VoiceOver accessibility checklist

Automated checks (axe, scripted keyboard and focus checks, accessibility tree checks) cannot tell whether a page is understandable when spoken. This checklist is for a person to run with a real screen reader. **Nothing here has been run yet.** Record results in the table at the end.

## Quick pass first: 15 minutes, the highest value checks
Do this before the full list. It covers what automated tools cannot judge. Open `http://127.0.0.1:8080` on this Mac (Safari), or the private address on your iPhone once it exists. Say aloud what you hear, and mark each line pass or fail.
1. **Mac, Safari, VoiceOver on (Command + F5).** Home page: does it say the page title, then "Skip to main content" on the first Tab? Press Enter on it: does the main content start?
2. **Navigation:** VO + Command + H through the headings of Profile Discovery. Is there one level 1, and do the levels make sense when only heard?
3. **Discovery search:** choose a starter, press Find similar profiles. Is "Searching" and then the result announced without losing your place? Open the first result's profile (a dialog): is its title read, can you reach Close, does Escape return you to the button?
4. **Compare:** press Compare on two results, then Compare profiles. Is the "What they have in common" section understandable when read, including the keywords with their quotes?
5. **A chart:** Model performance. Reach the first chart. Is it announced as a figure with its finding as the name? Press a bar: is the readout spoken? Press "Show as table": is it a real table with headers?
6. **The confusion matrix:** move through the cells. Does each cell say which true level was predicted as which, with the percentage?
7. **A caution:** Profile similarity. Is the "not romantic compatibility" note the first thing read?
8. **iPhone, VoiceOver (triple click the side button, or Settings > Accessibility):** repeat steps 1, 3 and 5 by swiping. Is anything skipped, read twice or cut off by the comparison tray at the bottom?
9. **Zoom or the largest text size on the iPhone:** does anything need sideways scrolling?
Record any failure in the table at the end of this file. A failure in steps 1 to 5 is a blocker for a public launch.

## Set up
**Mac, Safari + VoiceOver**
1. Turn VoiceOver on and off with Command + F5. The VoiceOver key (VO) is Control + Option.
2. System Settings > Accessibility > VoiceOver > Utility > Web: leave "Navigation" on its default. In Safari > Settings > Advanced, turn on "Press Tab to highlight each item on a webpage" (Safari does not Tab to links otherwise), so the keyboard checks match other browsers.
3. Open the staging address in Safari. Use a normal window, no zoom, then repeat the key pages at 200% zoom.
4. Useful keys: VO + Right/Left (next or previous item), VO + Space (activate), VO + U (rotor: headings, links, landmarks, form controls), VO + Command + H (next heading), Control (stop speaking), VO + A (read all).

**iPhone, Safari + VoiceOver**
1. Settings > Accessibility > VoiceOver on (or ask Siri). Swipe right or left to move, double tap to activate, rotate two fingers for the rotor, three finger swipe to scroll.
2. Open the staging address in Safari. Test portrait, then landscape.

## Checks that apply to every page
| # | Check | Expect |
|---|---|---|
| G1 | Open the page | The page title is spoken and is different on each page |
| G2 | Rotor, landmarks | A banner or navigation, "Main" navigation named, one main region |
| G3 | Rotor, headings | One level 1 heading; levels never skip; headings describe the sections |
| G4 | First Tab | The "Skip to main content" link; activating it moves to the main content |
| G5 | Move through the navigation | Each link has a clear name; the current page is announced ("current page") |
| G6 | Buttons and links | Each says what it does; no "click here"; no unnamed buttons |
| G7 | Decorative drawings (the gold thread, bar tracks) | Not announced |
| G8 | Page change | After using a navigation link, focus lands on the new page's heading and its title is announced |
| G9 | Colour scheme buttons | Announced as pressed or not pressed |

## Page by page
| Page | Check | Expect |
|---|---|---|
| **Profile Discovery** | Notice at the top | Read as a note: every profile is fictional, similarity is not compatibility |
| | Starter buttons | Named by their handles; activating one fills the text box and the answers |
| | Text box | Label "Profile text", the character count is announced, an error is announced when it is wrong ("Write at least 3 words...") |
| | Lifestyle answers disclosure | Announced as collapsed or expanded; each select has its label |
| | How to compare | A group with a legend; three radio buttons with their descriptions |
| | Find similar profiles | While running, "Searching" and busy; the results area is announced politely when they arrive, without moving focus |
| | A result card | Rank, handle, score and "Fictional profile" are read in order; "Words you both use" lists the words; themes say "shared" where they are; the very common answer line says "not telling" |
| | Two methods (wide screen: two lists; narrow: tabs) | Tabs announce selected state; the two lists are separately named; scores are never merged |
| | View profile | A dialog opens, its title and description are read, focus is inside; Escape closes it and focus returns to the button |
| | Compare | Buttons say "Compare NAME" and announce pressed; the tray at the foot announces the selection; the comparison dialog reads in a sensible order; the keywords list gives each word with its two quotes |
| | Errors (turn off the network, or send two searches quickly to meet the limit) | An alert is announced with a clear message and a Try again button; the typed text is still there |
| **Research overview** | Dataset figures | Each figure reads as a label then a value |
| | Charts | See "Charts" below |
| | The three questions | Read as a list with answers and links |
| **Segments** | The bar of six segments | A group; six buttons each named "Segment N, NAME, X% of users"; pressed state; the card below updates and is announced politely |
| | Stability and silhouette charts | Readout line updates; the table view is a real table with headers |
| | Notebook figure | Opens from a disclosure; the image has a full description in its alt text |
| **Model performance** | Training, validation, test badges | Each reads its full meaning ("Validation score, measured on held back parts of the training data") |
| | Filters | Radio groups with legends; changing one updates the list and the list's contents are re-readable |
| | Confusion matrix | A table with row and column headers; each cell reads "N% of users who truly are X were predicted Y" |
| | Segment effect rounds | Each round's change is read with its sign |
| **Profile similarity** | The caution note | Read first: not romantic compatibility |
| | Bars and the sex and age check | Each bar button reads label, method and value |
| **Fairness and limitations** | Four group cards | Read as a list: group, score, difference from overall, users |
| | Recommendation columns | Three headings; "Do not deploy" reads as a heading and a list |
| **Classification evidence** (public staging; called "Classification demo" in local mode only) | The disabled message | Read in full; no example controls exist |
| | Evidence | Headline figures, the confusion matrix and charts as above |
| **About** | Headings and lists | Read in a sensible order |

## Charts (every chart on every page)
| # | Check | Expect |
|---|---|---|
| C1 | The chart is a figure with a name | Announced "figure" with the finding as its name |
| C2 | Each bar | A button with its label, its value and what it means; pressing it updates the readout line, which is announced politely |
| C3 | "Show as table" | Announced as pressed after use; the table has a caption, column headers and row headers, and holds the same numbers |
| C4 | Line charts | Each category (such as k or C) is a button that reads every line's value |
| C5 | Nothing is conveyed only by colour or position | Series are named; shapes and dashes are in the legend text; values are always written out |

## Forms and dialogs
- Every control is reachable with VO navigation and with Tab, in a logical order.
- A dialog traps focus while open, announces its title, and returns focus when closed.
- No keyboard trap anywhere: you can always move on.

## iPhone extras
- Swipe through the whole of Profile Discovery: nothing is skipped or read twice; the tray at the foot does not hide anything (it must not cover the control you are on).
- Rotor "Headings" and "Form controls" both work.
- Dynamic type: set text to the largest size; nothing is cut off and nothing needs sideways scrolling.

## Record
| Date | Tester | Device and software | Page | Check | Result (pass, fail, unclear) | Notes |
|---|---|---|---|---|---|---|
| | | | | | | |
Severity guide: **blocker** if a task cannot be done or something misleading is spoken; **major** if it is done only with difficulty; **minor** if it is awkward but clear. Fix blockers and majors before any public launch, and add an automated test for each one where that is possible.
