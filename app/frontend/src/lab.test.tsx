import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { LAB, renderApp } from "./test/render";

const PAGES = ["/lab", "/lab/segments", "/lab/models", "/lab/similarity", "/lab/fairness", "/lab/classify"] as const;
const dec = (n: number, d = 3) => n.toFixed(d);

async function open(path: string) {
  const user = userEvent.setup();
  const { fetchMock } = renderApp(path);
  await screen.findByRole("heading", { level: 1 });
  await screen.findAllByRole("figure").catch(() => undefined);
  return { user, fetchMock };
}
const figure = (name: RegExp | string) => screen.getByRole("figure", { name });

/** The text of an element with a space between neighbouring text nodes, so adjacent numbers stay separate. */
function textOf(el: Element): string {
  // Axis tick labels inside charts are a scale, not data, so SVG text is skipped. Their values are tested on the data side.
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.parentElement?.closest("svg") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
  const parts: string[] = [];
  while (walker.nextNode()) parts.push(walker.currentNode.textContent ?? "");
  return parts.join(" ");
}

// ----------------------------------------------------------------------------- numerical accuracy
function numbersIn(node: unknown, out = new Set<number>()): Set<number> {
  if (typeof node === "number") out.add(node);
  else if (typeof node === "string") for (const m of node.match(/\d+/g) ?? []) out.add(Number(m));
  else if (Array.isArray(node)) node.forEach((n) => numbersIn(n, out));
  else if (node && typeof node === "object") Object.values(node).forEach((n) => numbersIn(n, out));
  return out;
}

/** Numbers that are written into the page text and are not in the data: counts of rounds and the like. */
const WRITTEN_IN_TEXT = new Set([95, 80, 100, 1000]); // 95% range, 80% sample, adds to 100%, 1,000 resamples
const close = (a: number, b: number) => Math.abs(a - b) < 1e-9 * Math.max(1, Math.abs(a));

function unknownNumbers(rawText: string): string[] {
  const known = [...numbersIn(LAB)].map(Math.abs);
  const subgroupDeltas = LAB.fairness.subgroups.map((s) => s.macro_f1 - LAB.models.test.final.macro_f1);
  const text = rawText.replace(/\bSegment \d\b/g, "").replace(/sections?\s+[\d.]+(?:\s+and\s+[\d.]+)?/gi, "").replace(/\d+\s?(?:fold|round)/gi, "");
  const unknown: string[] = [];
  for (const raw of text.match(/[−-]?\d[\d,]*\.?\d*/g) ?? []) {
    const value = Number(raw.replace(/[−]/g, "-").replace(/,/g, "").replace(/\.$/, ""));
    const isSmallWholeNumber = Number.isInteger(value) && Math.abs(value) < 10; // list numbers, rounds, segment ids
    if (isSmallWholeNumber || WRITTEN_IN_TEXT.has(Math.abs(value))) continue;
    const a = Math.abs(value);
    const ok =
      known.some((k) => close(a, k) || close(a, k * 100) || close(a, Math.round(k * 100)) || close(a, Math.round(k * 100) / 100) || close(a, Math.round(k * 1000) / 10)) ||
      subgroupDeltas.some((d) => close(a, Math.abs(Number(d.toFixed(3)))));
    if (!ok) unknown.push(raw);
  }
  return unknown;
}

describe("every number on a Lab page comes from the approved data", () => {
  it("the checker itself catches a number that is not in the data", () => {
    expect(unknownNumbers("The model scores 0.386 and 73.3% and 59,946 profiles")).toEqual([]);
    expect(unknownNumbers("The model scores 0.486 on 61,000 profiles at 74.3%")).toEqual(["0.486", "61,000", "74.3"]);
  });

  it.each(PAGES)("%s", async (path) => {
    await open(path);
    await screen.findAllByRole("heading", { level: 2 }).catch(() => undefined);
    expect(unknownNumbers(textOf(screen.getByRole("main")))).toEqual([]);
  });
});

describe("headline values are shown exactly as the notebook reports them", () => {
  it("overview", async () => {
    await open("/lab");
    const main = screen.getByRole("main");
    for (const s of ["59,946", "56,961", "45,568", "11,393", "46,788", "1,765", "59,855", "80.8%", "73.3%"]) expect(main).toHaveTextContent(s);
    expect(main).toHaveTextContent("0.386 against 0.212");
  });

  it("models: final and baseline test scores, accuracy, and ranges", async () => {
    await open("/lab/models");
    const test = figure(/final model scores 0.386 against 0.212/i);
    expect(within(test).getAllByText(/gain of 0.175/).length).toBeGreaterThan(0);
    expect(test).toHaveTextContent("95% range of 0.164 to 0.186");
    expect(screen.getByRole("main")).toHaveTextContent("Accuracy is 0.517, below the baseline’s 0.734");
  });

  it("segments: silhouette, stability and the six sizes", async () => {
    await open("/lab/segments");
    expect(screen.getByRole("heading", { name: /silhouette score of about 0.05/i })).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveTextContent("0.98 and 0.97 at six");
  });
});

// ----------------------------------------------------------------------------- chart data
describe("chart data", () => {
  it("model comparison lists every model, best first, with the baseline last", async () => {
    await open("/lab/models");
    const chart = figure(/Essay words plus lifestyle answers score best/);
    const list = within(chart).getByRole("list", { name: "Macro F1 by model" });
    const rows = within(list).getAllByRole("button");
    expect(rows).toHaveLength(LAB.models.validation.length);
    const shown = rows.map((r) => within(r).getByText(/^0\.\d{3}$/).textContent);
    expect(shown).toEqual(LAB.models.validation.map((v) => dec(v.validation_macro_f1)));
    expect(shown[0]).toBe("0.387");
    expect(rows[rows.length - 1]).toHaveTextContent("Baseline");
    expect(shown.at(-1)).toBe("0.212");
  });

  it("the model filter keeps the baseline and only logistic regression", async () => {
    const { user } = await open("/lab/models");
    const chart = figure(/Essay words plus lifestyle answers score best/);
    await user.click(within(chart).getByRole("radio", { name: "Logistic regression" }));
    const rows = within(within(chart).getByRole("list", { name: "Macro F1 by model" })).getAllByRole("button");
    expect(rows).toHaveLength(LAB.models.validation.filter((v) => v.model === "Logistic regression" || v.model === "Baseline").length);
    await user.click(within(chart).getByRole("radio", { name: "Other methods" }));
    expect(within(within(chart).getByRole("list", { name: "Macro F1 by model" })).getAllByRole("button")).toHaveLength(LAB.models.validation.filter((v) => v.model !== "Logistic regression").length);
  });

  it("'With training' adds a training bar for every model and labels both kinds of score", async () => {
    const { user } = await open("/lab/models");
    const chart = figure(/Essay words plus lifestyle answers score best/);
    await user.click(within(chart).getByRole("radio", { name: "With training" }));
    const rows = within(within(chart).getByRole("list", { name: "Macro F1 by model" })).getAllByRole("button");
    expect(rows).toHaveLength(LAB.models.validation.length * 2);
    expect(within(chart).getByText(/Training score/)).toBeInTheDocument();
    expect(rows[1]).toHaveTextContent("training");
    expect(rows[1]).toHaveTextContent("0.650");
  });

  it("pressing a bar reads out its meaning", async () => {
    const { user } = await open("/lab/models");
    const chart = figure(/Essay words plus lifestyle answers score best/);
    await user.click(within(within(chart).getByRole("list", { name: "Macro F1 by model" })).getAllByRole("button")[0]);
    expect(within(chart).getByText(/Validation macro F1 0.387 \(spread across folds 0.004\)/)).toBeInTheDocument();
  });

  it("every chart has a table with the same numbers", async () => {
    const { user } = await open("/lab/models");
    const chart = figure(/The final model scores/);
    await user.click(within(chart).getByRole("button", { name: "Show as table" }));
    const table = within(chart).getByRole("table", { name: /final model scores/i });
    expect(within(table).getByRole("row", { name: /Final model Test 0.386 0.376 0.397 0.517/ })).toBeInTheDocument();
    expect(within(chart).getByRole("button", { name: "Show chart" })).toHaveAttribute("aria-pressed", "true");
  });

  it("the confusion matrix shows the notebook's percentages, with the diagonal equal to recall", async () => {
    await open("/lab/models");
    const chart = figure(/Mistakes mostly go to the neighbouring group/);
    const table = within(chart).getByRole("table");
    const cells = within(table).getAllByRole("button");
    expect(cells.map((c) => c.textContent)).toEqual(LAB.models.confusion_pct.rows.flat().map((v) => `${v}%`));
    LAB.models.test.per_class.forEach((c, i) => expect(Math.abs(LAB.models.confusion_pct.rows[i][i] - c.recall * 100)).toBeLessThanOrEqual(0.51));
  });

  it("subgroup filter switches groups and keeps the overall line", async () => {
    const { user } = await open("/lab/fairness");
    const chart = figure(/Performance is fairly even/);
    expect(within(within(chart).getByRole("list", { name: "Macro F1 by sex" })).getAllByRole("button")).toHaveLength(2);
    await user.click(within(chart).getByRole("radio", { name: "Segment" }));
    const rows = within(within(chart).getByRole("list", { name: "Macro F1 by segment" })).getAllByRole("button");
    expect(rows).toHaveLength(LAB.fairness.subgroups.filter((s) => s.kind === "segment").length);
    expect(within(chart).getByText("Overall 0.386")).toBeInTheDocument();
  });

  it("calls out women, men, older users and users without essays with the notebook values", async () => {
    await open("/lab/fairness");
    const cards = within(screen.getByRole("list", { name: "Four groups called out" })).getAllByRole("listitem");
    expect(cards.map((c) => c.querySelector("p")?.textContent)).toEqual(["0.393", "0.381", "0.327", "0.275"]);
    expect(cards[3]).toHaveTextContent("374 users");
    expect(cards[2]).toHaveTextContent("1,333 users");
  });

  it("picking a segment changes the card, using only aggregates", async () => {
    const { user } = await open("/lab/segments");
    const card = screen.getByTestId("segment-card");
    expect(card).toHaveTextContent("technical men");
    await user.click(screen.getByRole("button", { name: /Segment 6, older professionals/ }));
    expect(card).toHaveTextContent("older professionals");
    expect(card).toHaveTextContent("49.4");
    expect(card).toHaveTextContent("Averages over many users, never one person");
  });

  it("similarity filters: method and view change the bars", async () => {
    const { user } = await open("/lab/similarity");
    const chart = figure(/Neighbours agree a little more often than chance/);
    const rows = () => within(within(chart).getByRole("list", { name: /by lifestyle field/ })).getAllByRole("button");
    expect(rows()).toHaveLength(20); // nine lifestyle fields and drinking, two methods each
    await user.click(within(chart).getByRole("radio", { name: "Embeddings" }));
    expect(rows()).toHaveLength(10);
    await user.click(within(chart).getByRole("radio", { name: "Agreement" }));
    expect(rows()[0]).toHaveTextContent("12.6%");
    await user.click(within(chart).getByRole("radio", { name: "Lift" }));
    expect(rows()[0]).toHaveTextContent("1.54×");
  });

  it("keeps the two similarity methods apart and says their scales differ", async () => {
    await open("/lab/similarity");
    expect(screen.getByRole("main")).toHaveTextContent("The two methods use different scales");
    expect(screen.getByRole("main")).toHaveTextContent("TF-IDF 0.13, embeddings 0.70");
  });
});

// ----------------------------------------------------------------------------- required statements
describe("statements the Lab must make", () => {
  it("explains the weak cluster separation and why clustering did not help", async () => {
    await open("/lab/segments");
    expect(screen.getByRole("main")).toHaveTextContent(/Why the separation is weak/);
    await open("/lab/models").catch(() => undefined);
  });

  it("models page explains why clustering did not improve classification", async () => {
    await open("/lab/models");
    const section = screen.getByRole("region", { name: /Why clustering did not improve classification/ });
    expect(section).toHaveTextContent("The segments add nothing new");
    expect(section).toHaveTextContent("weakly separated");
    expect(section).toHaveTextContent("−0.0017");
  });

  it("states the segment result precisely and never calls it noise", async () => {
    await open("/lab/models");
    const section = screen.getByRole("region", { name: /Why clustering did not improve classification/ });
    expect(section).toHaveTextContent("Adding segments did not improve validation macro F1.");
    expect(section.textContent ?? "").not.toMatch(/noise/i);
  });

  it("separates training, validation and test scores in words", async () => {
    await open("/lab/models");
    for (const label of ["Training score", "Validation score", "Test score"]) expect(screen.getAllByText(new RegExp(label)).length).toBeGreaterThan(0);
  });

  it("says the similarity system is not romantic compatibility, and synthetic profiles are not evidence", async () => {
    await open("/lab/similarity");
    expect(screen.getByRole("note")).toHaveTextContent("Similar writing is not romantic compatibility");
    expect(screen.getByRole("note")).toHaveTextContent(/invented profiles.*not evidence/s);
  });

  it("fairness covers subgroups, proxies, privacy and recommendations", async () => {
    await open("/lab/fairness");
    for (const name of ["Subgroup results", "Proxy effects", "Privacy considerations", "Responsible AI recommendations", "Limitations"]) expect(screen.getByRole("heading", { level: 2, name })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Do not deploy" })).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveTextContent("64.3%");
  });
});

// ----------------------------------------------------------------------------- privacy
describe("privacy", () => {
  it.each(PAGES)("%s asks only for aggregate endpoints and shows no contact detail or long passage", async (path) => {
    const { fetchMock } = await open(path);
    await screen.findAllByRole("figure").catch(() => undefined);
    const urls = fetchMock.mock.calls.map(([u]) => String(u));
    expect(urls.every((u) => /\/api\/v1\/(health|meta|lab\/summary)$/.test(u))).toBe(true);
    const text = screen.getByRole("main").textContent ?? "";
    expect(text).not.toMatch(/@|https?:\/\//);
    expect(text).not.toMatch(/essay\d/);
  });

  it("only loads the notebook's own figure from the lab figure endpoint", async () => {
    await open("/lab/segments");
    const images = [...document.querySelectorAll("img")].map((i) => i.getAttribute("src"));
    expect(images).toEqual(["/api/v1/lab/figures/clusters_vs_k"]);
  });

  it("shows an error and no numbers when the findings cannot be loaded", async () => {
    renderApp("/lab/models", "offline");
    expect(await screen.findByRole("alert")).toHaveTextContent("The service did not answer");
    expect(screen.getByRole("main").textContent).not.toMatch(/0\.386/);
  });
});

// ----------------------------------------------------------------------------- accessibility
describe("accessibility", () => {
  it.each(PAGES)("%s: one h1, no skipped heading levels, named figures, labelled controls", async (path) => {
    await open(path);
    await screen.findAllByRole("figure").catch(() => undefined);
    const levels = screen.getAllByRole("heading").map((h) => Number(h.tagName[1]));
    expect(levels.filter((l) => l === 1)).toHaveLength(1);
    levels.forEach((l, i) => i > 0 && expect(l - levels[i - 1]).toBeLessThanOrEqual(1));
    for (const f of screen.queryAllByRole("figure")) {
      expect(f).toHaveAccessibleName();
      expect(within(f).getByRole("button", { name: /Show as table|Show chart/ })).toBeInTheDocument();
    }
    for (const radio of screen.queryAllByRole("radio")) expect(radio).toHaveAccessibleName();
    for (const img of document.querySelectorAll("img")) expect(img.getAttribute("alt")?.length).toBeGreaterThan(20);
  });

  it("filter choices are radio groups that work with the keyboard", async () => {
    const { user } = await open("/lab/models");
    const chart = figure(/Essay words plus lifestyle answers score best/);
    const group = within(chart).getByRole("group", { name: "Scores" });
    const first = within(group).getByRole("radio", { name: "Validation" });
    first.focus();
    await user.keyboard("{ArrowRight}");
    await waitFor(() => expect(within(group).getByRole("radio", { name: "With training" })).toBeChecked());
  });

  it("a chart's readout is a polite live region", async () => {
    await open("/lab");
    const chart = figure(/say they drink socially/);
    expect(chart.querySelector("[aria-live=polite]")).not.toBeNull();
  });

  it("the new page is in the navigation and marked current", async () => {
    await open("/lab/similarity");
    const nav = (await screen.findAllByRole("navigation", { name: "Main" }))[0];
    expect(within(nav).getByRole("link", { name: "Profile similarity" })).toHaveAttribute("aria-current", "page");
  });
});

describe("presentation choices that stay verifiable", () => {
  it("labels the confusion matrix as rounded values transcribed from the notebook figure", async () => {
    await open("/lab/models");
    const chart = figure(/Mistakes mostly go to the neighbouring group/);
    expect(chart).toHaveTextContent(/rounded whole number percentages transcribed from the notebook.s figure/);
    expect(chart).toHaveTextContent(/not recomputed/);
    expect(within(chart).getByRole("table", { hidden: false })).toBeInTheDocument();
  });

  it("shows the Segment 5 and 6 drinking figures and the other four only as the 8 to 12% range", async () => {
    await open("/lab/segments");
    const chart = figure(/drinks often the most/);
    const rows = within(within(chart).getByRole("list", { name: /who drink often/ })).getAllByRole("button");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent("Segment 5");
    expect(rows[0]).toHaveTextContent("17%");
    expect(rows[1]).toHaveTextContent("Segment 6");
    expect(rows[1]).toHaveTextContent("5%");
    expect(rows[2]).toHaveTextContent("Other four segments");
    expect(rows[2]).toHaveTextContent("8–12%");
    for (const n of [1, 2, 3, 4]) expect(chart).not.toHaveTextContent(new RegExp(`Segment ${n}\\b`));
  });

  it("shows the ten printed standout words and says nothing else was removed", async () => {
    await open("/lab/segments");
    const words = within(screen.getByRole("list", { name: /Words that stand out in segment 1/ })).getAllByRole("listitem");
    expect(words.map((w) => w.textContent)).toEqual(LAB.segments.items[0].top_words);
    expect(words).toHaveLength(10);
    expect(screen.getByTestId("segment-card")).toHaveTextContent(/already removed common first names/);
  });
});

describe("Stage 9C: short summaries and page structure", () => {
  const glance = () => screen.getByRole("region", { name: "In short" });

  it.each(PAGES)("%s opens with an In short summary of three or four statements", async (path) => {
    await open(path);
    const items = within(await screen.findByRole("region", { name: "In short" })).getAllByRole("listitem");
    expect(items.length).toBeGreaterThanOrEqual(3);
    expect(items.length).toBeLessThanOrEqual(4);
  });

  it.each(PAGES)("%s: the summary never overstates (no proof, significance, noise or compatibility claims)", async (path) => {
    await open(path);
    const text = textOf(await screen.findByRole("region", { name: "In short" }));
    expect(text).not.toMatch(/\bproves?\b|\bsignificant|\bnoise\b|\bstrongly predicts?\b|\baccurate(ly)? predicts?\b|\bbreakthrough\b/i);
    for (const [phrase] of text.matchAll(/.{0,30}compatib\w*/gi)) expect(phrase).toMatch(/not (romantic )?compatib/i);
  });

  it("overview summary states the verified headline figures, rounded as the notebook prints them", async () => {
    await open("/lab");
    const text = textOf(await screen.findByRole("region", { name: "In short" }));
    expect(text).toContain("59,946");
    expect(text).toContain(dec(LAB.models.test.final.macro_f1));
    expect(text).toContain(dec(LAB.models.test.baseline.macro_f1));
    expect(text).toContain(dec(LAB.segments.silhouette.k6_about, 2));
    expect(text).toContain("did not improve validation macro F1");
    expect([LAB.models.test.final.macro_f1, LAB.models.test.baseline.macro_f1, LAB.segments.items.length]).toEqual([0.386, 0.212, 6]);
  });

  it("segments summary keeps the weak separation and the stability figures from the data", async () => {
    await open("/lab/segments");
    const text = textOf(await screen.findByRole("region", { name: "In short" }));
    expect(text).toContain("Six groups");
    expect(text).toContain("weakly separated");
    expect(text).toContain(dec(LAB.segments.stability_k6.new_seed, 2));
    expect(text).toContain(dec(LAB.segments.silhouette.maximum, 3));
    expect(text).toContain("never be used to treat users differently");
  });

  it("models summary gives the test result and the precise segment conclusion", async () => {
    await open("/lab/models");
    const text = textOf(await screen.findByRole("region", { name: "In short" }));
    expect(text).toContain(`macro F1 of ${dec(LAB.models.test.final.macro_f1)}`);
    expect(text).toContain("Adding segments did not improve validation macro F1.");
  });

  it("similarity summary says the agreement is small and that similarity is not compatibility", async () => {
    await open("/lab/similarity");
    const text = textOf(await screen.findByRole("region", { name: "In short" }));
    expect(text).toContain("a little more often than chance, never by much");
    expect(text).toContain("not a test of matching");
  });

  it("fairness and classification summaries keep the caution that a model must never decide about a person", async () => {
    await open("/lab/fairness");
    expect(textOf(await screen.findByRole("region", { name: "In short" }))).toContain("must never decide anything about a person");
    document.body.innerHTML = "";
    await open("/lab/classify");
    const text = textOf(await screen.findByRole("region", { name: "In short" }));
    expect(text).toContain("must never be used to profile anyone");
    expect(text).toContain("Accuracy is lower than the baseline on purpose");
  });

  it("overview: the method is five numbered steps in an ordered list, and each research question has a short verdict", async () => {
    await open("/lab");
    const method = await screen.findByRole("region", { name: "How the results were checked" });
    expect(within(method).getAllByRole("listitem").filter((li) => /^\d/.test(li.textContent ?? ""))).toHaveLength(5);
    const questions = screen.getByRole("region", { name: "Three research questions" });
    for (const verdict of ["Partly.", "Modestly, and clustering does not help.", "Yes, but only weakly."]) expect(within(questions).getByText(verdict)).toBeInTheDocument();
    expect(within(questions).getByRole("link", { name: "See the segments" })).toHaveAttribute("href", "/lab/segments");
    expect(within(questions).getByRole("link", { name: "See model performance" })).toHaveAttribute("href", "/lab/models");
    expect(within(questions).getByRole("link", { name: "See profile similarity" })).toHaveAttribute("href", "/lab/similarity");
  });

  it("overview: the glossary still defines all six terms", async () => {
    await open("/lab");
    const words = await screen.findByRole("region", { name: "Technical terms in plain words" });
    for (const term of ["Macro F1", "Validation, training and test", "TF-IDF", "Sentence embedding", "Silhouette score", "Lift"]) expect(within(words).getByText(term)).toBeInTheDocument();
  });

  it("the decorative icons and section marks are hidden from assistive technology", async () => {
    await open("/lab/models");
    await screen.findByRole("region", { name: "In short" });
    for (const svg of glance().querySelectorAll("svg")) expect(svg).toHaveAttribute("aria-hidden", "true");
    for (const mark of document.querySelectorAll("section > span.rounded-full.bg-gold-fill")) expect(mark).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByRole("heading", { level: 1 })).toHaveAccessibleName("Model performance");
  });

  it("every chart keeps its table alternative and its readout", async () => {
    await open("/lab/models");
    const charts = await screen.findAllByRole("figure");
    expect(charts.length).toBeGreaterThanOrEqual(6);
    for (const chart of charts) {
      expect(within(chart).getByRole("button", { name: /Show as table/ })).toBeInTheDocument();
      expect(chart.textContent).toMatch(/Point at, focus or press a mark|Source:/);
    }
  });
});

describe("answer labels on the Segments page", async () => {
  const { answerLabel } = await import("./features/lab/common");
  it("keeps a field name with an underscore in one piece", () => {
    expect(answerLabel("body_type_athletic")).toBe("body type: athletic");
    expect(answerLabel("education_level_masters")).toBe("education level: masters");
    expect(answerLabel("diet_type_missing")).toBe("diet type: missing");
    expect(answerLabel("job_science / tech / engineering")).toBe("job: science / tech / engineering");
    expect(answerLabel("but wants them")).toBe("but wants them");
  });
});
