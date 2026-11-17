import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { apiError, discoveryApi, json, profile, RESPONSE } from "./test/fixtures";
import { renderApp } from "./test/render";

const TEXT = "I spend weekends in old bookshops and drink far too much tea.";

type Search = (body: Record<string, unknown>) => Response | Promise<Response>;

async function open(search: Search = vi.fn(() => json(200, RESPONSE)), extra?: Parameters<typeof discoveryApi>[1]) {
  const user = userEvent.setup();
  const { fetchMock } = renderApp("/discover", "public", false, discoveryApi(search, extra));
  await screen.findByRole("textbox", { name: "Profile text" });
  const posts = () => fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === "POST");
  return { user, search, posts, fetchMock };
}
const type = (user: ReturnType<typeof userEvent.setup>, text = TEXT) => user.type(screen.getByRole("textbox", { name: "Profile text" }), text);
const submit = (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole("button", { name: "Find similar profiles" }));

describe("Discover page: first view", () => {
  it("says every profile is fictional and that similarity is not compatibility", async () => {
    await open();
    expect(screen.getByText(/every profile here is fictional/i)).toBeInTheDocument();
    expect(screen.getAllByText(/similar writing is not\s+compatibility/i).length).toBeGreaterThan(0);
  });

  it("shows an empty state, the starters from the service, and both methods", async () => {
    await open();
    expect(screen.getByTestId("empty-state")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Starter One" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Compare both/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /Sentence embeddings/ })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /TF-IDF/ })).toBeInTheDocument();
  });

  it("fills the form from a starter profile", async () => {
    const { user } = await open();
    await user.click(await screen.findByRole("button", { name: "Starter One" }));
    expect(screen.getByRole("textbox", { name: "Profile text" })).toHaveValue("Text of Starter One. I like tea and old maps.");
  });

  it("says discovery is unavailable when the service has no search files", async () => {
    renderApp("/discover", "public"); // the default stub reports discovery off
    expect(await screen.findByText("Discovery is not available")).toBeInTheDocument();
  });
});

describe("Discover page: validation", () => {
  it("refuses empty text without calling the service", async () => {
    const { user, posts } = await open();
    await submit(user);
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Profile text" })).toHaveAccessibleDescription(/write a few sentences/i));
    expect(screen.getByRole("textbox", { name: "Profile text" })).toHaveAttribute("aria-invalid", "true");
    expect(posts()).toHaveLength(0);
  });

  it("refuses whitespace only text", async () => {
    const { user, posts } = await open();
    await type(user, "     \n  ");
    await submit(user);
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Profile text" })).toHaveAccessibleDescription(/write a few sentences/i));
    expect(posts()).toHaveLength(0);
  });

  it("refuses text under the minimum word count, using the limit from the service", async () => {
    const { user, posts } = await open();
    await type(user, "hello there");
    await submit(user);
    expect(await screen.findByText("Write at least 3 words so there is something to compare.")).toBeInTheDocument();
    expect(posts()).toHaveLength(0);
  });

  it("refuses text over the character limit and says by how much", async () => {
    const { user, posts } = await open();
    await user.click(screen.getByRole("textbox", { name: "Profile text" }));
    await user.paste("word ".repeat(410));
    await submit(user);
    expect(await screen.findByText(/characters over the limit of 2000/)).toBeInTheDocument();
    expect(posts()).toHaveLength(0);
  });

  it("shows the message from the service when it refuses the text, next to the field", async () => {
    const search = vi.fn(() => apiError(422, "no_usable_text", "There are no words left to compare. Links and contact details are removed before searching."));
    const { user } = await open(search);
    await type(user, "http://example.test a@b.test now");
    await submit(user);
    expect(await screen.findByText(/no words left to compare/i)).toHaveAttribute("id");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("Discover page: searching", () => {
  it("sends the text, the chosen answers, the method and the list size", async () => {
    const { user, posts, search } = await open();
    await type(user);
    await user.click(screen.getByText("Lifestyle answers, optional"));
    await user.selectOptions(screen.getByLabelText("Pets"), "has a cat");
    await user.click(screen.getByRole("radio", { name: /TF-IDF/ }));
    await user.selectOptions(screen.getByLabelText("Profiles per list"), "10");
    await submit(user);
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(search).toHaveBeenCalledWith({ text: TEXT, answers: { pets: "has a cat" }, method: "tfidf", k: 10 });
  });

  it("shows a loading state while the search runs", async () => {
    let release: (r: Response) => void = () => {};
    const pending = new Promise<Response>((resolve) => (release = resolve));
    const { user } = await open(() => pending as unknown as Response);
    await type(user);
    await submit(user);
    expect(await screen.findByRole("status", { name: "Searching the fictional profiles" })).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button", { name: "Searching" })).toBeDisabled();
    release(json(200, RESPONSE));
    expect(await screen.findByRole("heading", { name: "Sentence embeddings", level: 2 })).toBeInTheDocument();
    expect(screen.queryByRole("status", { name: "Searching the fictional profiles" })).not.toBeInTheDocument();
  });

  it("keeps the two methods in separate lists with their own score names", async () => {
    const { user } = await open();
    await type(user);
    await submit(user);
    const emb = await screen.findByRole("list", { name: "Similar profiles by Sentence embeddings" });
    const tf = screen.getByRole("list", { name: "Similar profiles by TF-IDF" });
    expect(within(emb).getByText("0.644")).toBeInTheDocument();
    expect(within(tf).getByText("0.136")).toBeInTheDocument();
    expect(within(emb).queryByText("0.136")).not.toBeInTheDocument();
    expect(within(tf).queryByText("0.644")).not.toBeInTheDocument();
    expect(screen.getByText(/Cosine similarity of sentence embeddings\./)).toBeInTheDocument();
    expect(screen.getByText(/Cosine similarity of TF-IDF vectors\./)).toBeInTheDocument();
    expect(screen.getByTestId("overlap")).toHaveTextContent("1 of 2 profiles appear in both lists.");
    expect(screen.getByTestId("comparison")).toHaveTextContent("different scales");
  });

  it("shows one list when one method is chosen", async () => {
    const one = { ...RESPONSE, results: [RESPONSE.results[0]], comparison: null };
    const { user } = await open(() => json(200, one));
    await user.click(screen.getByRole("radio", { name: /Sentence embeddings/ }));
    await type(user);
    await submit(user);
    expect(await screen.findByRole("list", { name: "Similar profiles by Sentence embeddings" })).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Similar profiles by TF-IDF" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("comparison")).not.toBeInTheDocument();
  });

  it("shows the service's note when a method has nothing to return", async () => {
    const empty = { ...RESPONSE, results: [RESPONSE.results[0], { ...RESPONSE.results[1], neighbours: [], note: "None of your words appear in the vocabulary of the pool." }] };
    const { user } = await open(() => json(200, empty));
    await type(user);
    await submit(user);
    expect(await screen.findByText("None of your words appear in the vocabulary of the pool.")).toBeInTheDocument();
  });

  it("reports what was removed before searching", async () => {
    const removed = { ...RESPONSE, input: { ...RESPONSE.input, personal_details_removed: { link: 1, email: 2 } } };
    const { user } = await open(() => json(200, removed));
    await type(user);
    await submit(user);
    expect(await screen.findByText(/Removed before searching: 1 link, 2 emails\./)).toBeInTheDocument();
  });
});

describe("Discover page: explanations", () => {
  it("shows shared words, shared themes and distinctive lifestyle answers with how common they are", async () => {
    const { user } = await open();
    await user.click(screen.getByText("Lifestyle answers, optional"));
    await user.selectOptions(screen.getByLabelText("Pets"), "has a cat");
    await type(user);
    await submit(user);
    const card = await screen.findByTestId("result-embeddings-1");
    expect(within(card).getByRole("list", { name: "Shared words" })).toHaveTextContent("tea");
    expect(within(card).getByText("Books and creative, shared")).toBeInTheDocument();
    expect(within(card).getByText(/has a cat/)).toBeInTheDocument();
    expect(within(card).getByText(/shared by 8% of profiles/)).toBeInTheDocument();
  });

  it("sets a very common shared answer aside and says it is not telling", async () => {
    const { user } = await open();
    await user.click(screen.getByText("Lifestyle answers, optional"));
    await user.selectOptions(screen.getByLabelText("Relationship status"), "single");
    await type(user);
    await submit(user);
    const card = await screen.findByTestId("result-embeddings-1");
    expect(within(card).getByText(/very common and so not telling/)).toHaveTextContent("relationship status single (92%)");
    expect(within(card).queryByText(/shared by 92%/)).not.toBeInTheDocument();
  });

  it("says so when a semantic match shares no words", async () => {
    const { user } = await open();
    await type(user);
    await submit(user);
    const card = await screen.findByTestId("result-embeddings-2");
    expect(within(card).getByText(/similar meaning, not shared wording/)).toBeInTheDocument();
  });

  it("does not show a lifestyle comparison when no answers were given", async () => {
    const { user } = await open();
    await type(user);
    await submit(user);
    expect(await screen.findByText(/no lifestyle answers, so no lifestyle comparison/i)).toBeInTheDocument();
    expect(screen.queryByText("Lifestyle answers you share")).not.toBeInTheDocument();
  });

  it("never describes a score as compatibility", async () => {
    const { user } = await open();
    await type(user);
    await submit(user);
    await screen.findByTestId("result-embeddings-1");
    // The only use of the word is to deny it: "Similar writing is not compatibility."
    for (const [phrase] of document.body.textContent?.matchAll(/.{0,25}compatib\w*/gi) ?? []) expect(phrase).toMatch(/not\s+compatib|does not mean/i);
    expect(document.body.textContent).not.toMatch(/compatibility score|% compatible|match score|perfect match/i);
  });
});

describe("Discover page: failures", () => {
  it("explains a server error and lets the person try again without retyping", async () => {
    const search = vi.fn().mockReturnValueOnce(apiError(500, "internal_error", "Something went wrong on the server.")).mockReturnValue(json(200, RESPONSE));
    const { user } = await open(search);
    await type(user);
    await submit(user);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Something went wrong on the server.");
    expect(screen.getByRole("textbox", { name: "Profile text" })).toHaveValue(TEXT);
    await user.click(within(alert).getByRole("button", { name: "Try again" }));
    expect(await screen.findByTestId("result-embeddings-1")).toBeInTheDocument();
    expect(search).toHaveBeenCalledTimes(2);
  });

  it("explains a service that does not answer", async () => {
    const { user } = await open(() => Promise.reject(new TypeError("down")) as unknown as Response);
    await type(user);
    await submit(user);
    expect(await screen.findByText("The service did not answer")).toBeInTheDocument();
  });

  it("explains a request that is too large", async () => {
    const { user } = await open(() => apiError(413, "payload_too_large", "The request is too large."));
    await type(user);
    await submit(user);
    expect(await screen.findByText("That profile is too long")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });

  it("never prints the typed text in an error", async () => {
    const { user } = await open(() => apiError(500, "internal_error", "Something went wrong on the server."));
    await type(user, "secret fictional words here");
    await submit(user);
    const alert = await screen.findByRole("alert");
    expect(alert).not.toHaveTextContent("secret fictional");
  });
});

describe("Discover page: profile details and comparison", () => {
  async function searched() {
    const ctx = await open();
    await type(ctx.user);
    await submit(ctx.user);
    await screen.findByTestId("result-embeddings-1");
    return ctx;
  }

  it("opens a full fictional profile from the profile endpoint", async () => {
    const { user, fetchMock } = await searched();
    await user.click(within(screen.getByTestId("result-embeddings-1")).getByRole("button", { name: "View profile Warm Archer" }));
    const dialog = await screen.findByRole("dialog", { name: "Warm Archer" });
    expect(await within(dialog).findByTestId("profile-text")).toHaveTextContent("Text of Warm Archer");
    expect(within(dialog).getByText(/not a real person/i)).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/discover/profiles/syn_aaaaaaa1"))).toBe(true);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("shows an error inside the dialog when a profile cannot be loaded", async () => {
    const ctx = await open(vi.fn(() => json(200, RESPONSE)), (url) => (url.includes("/discover/profiles/") ? apiError(404, "not_found", "There is no profile with this identifier.") : undefined));
    await type(ctx.user);
    await submit(ctx.user);
    await ctx.user.click(within(await screen.findByTestId("result-embeddings-1")).getByRole("button", { name: "View profile Warm Archer" }));
    expect(await within(await screen.findByRole("dialog")).findByRole("alert")).toHaveTextContent("That profile could not be found");
  });

  it("compares two selected profiles and does not allow a third", async () => {
    const { user } = await searched();
    const add = (testid: string, name: string) => user.click(within(screen.getByTestId(testid)).getByRole("button", { name: `Compare ${name}` }));
    await add("result-embeddings-1", "Warm Archer");
    expect(screen.getByRole("region", { name: "Comparison" })).toHaveTextContent("Pick one more to compare");
    expect(screen.getByRole("button", { name: "Compare profiles" })).toBeDisabled();
    await add("result-embeddings-2", "Calm Scribe");
    expect(within(screen.getByTestId("result-tfidf-2")).getByRole("button", { name: "Compare Jolly Botanist" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Compare profiles" }));
    const dialog = await screen.findByRole("dialog", { name: "Compare two profiles" });
    const common = await within(dialog).findByTestId("in-common");
    expect(common).toHaveTextContent("Books and creative");
    expect(common).toHaveTextContent("shared by 8% of profiles"); // from /meta, not from the search
    expect(common).toHaveTextContent("relationship status single (92%)");
    expect(dialog).toHaveTextContent("rank 1 by Sentence embeddings, score 0.644");
    expect(dialog).toHaveTextContent("not in the TF-IDF list");
    expect(dialog).toHaveTextContent("does not score them against each other");
  });

  it("clears the selection", async () => {
    const { user } = await searched();
    await user.click(within(screen.getByTestId("result-embeddings-1")).getByRole("button", { name: "Compare Warm Archer" }));
    await user.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(screen.queryByRole("region", { name: "Comparison" })).not.toBeInTheDocument();
  });

  async function compareWithTexts(textA: string, textB: string) {
    const ctx = await open(
      vi.fn(() => json(200, RESPONSE)),
      (url) => {
        const m = url.match(/\/discover\/profiles\/(syn_aaaaaaa[12])$/);
        if (!m) return undefined;
        const first = m[1] === "syn_aaaaaaa1";
        return json(200, { ...profile(m[1], first ? "Warm Archer" : "Calm Scribe"), text: first ? textA : textB });
      },
    );
    await type(ctx.user);
    await submit(ctx.user);
    await ctx.user.click(within(await screen.findByTestId("result-embeddings-1")).getByRole("button", { name: "Compare Warm Archer" }));
    await ctx.user.click(within(screen.getByTestId("result-embeddings-2")).getByRole("button", { name: "Compare Calm Scribe" }));
    await ctx.user.click(screen.getByRole("button", { name: "Compare profiles" }));
    return within(await screen.findByRole("dialog", { name: "Compare two profiles" }));
  }

  it("lists distinctive shared keywords with their context and leaves out generic words", async () => {
    const dialog = await compareWithTexts("My way of life is kayaking on quiet rivers", "Another way to relax is kayaking at dawn");
    const list = await dialog.findByRole("list", { name: "Shared keywords" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(1);
    expect(list).toHaveTextContent("kayaking");
    expect(list).toHaveTextContent("kayaking on quiet");
    expect(list).toHaveTextContent("kayaking at dawn");
    expect(list).not.toHaveTextContent(/\bway\b.*\bway\b/);
    expect(dialog.queryByText("way")).not.toBeInTheDocument();
  });

  it("says so when the only shared words are generic", async () => {
    const dialog = await compareWithTexts("I really love the way things are", "The way I see things is really good");
    expect(await dialog.findByText("No meaningful shared keywords found.")).toBeInTheDocument();
    expect(dialog.queryByRole("list", { name: "Shared keywords" })).not.toBeInTheDocument();
  });
});

describe("Discover page: Stage 9B presentation", () => {
  const stubMedia = (matches: (query: string) => boolean) => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: (query: string) => ({ matches: matches(query), media: query, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false }),
    });
  };
  const unstubMedia = () => {
    delete (window as unknown as { matchMedia?: unknown }).matchMedia;
    delete (Element.prototype as unknown as { scrollIntoView?: unknown }).scrollIntoView;
  };

  it("explains the three steps in an ordered list and keeps the fictional profile notice", async () => {
    await open();
    const steps = screen.getByRole("region", { name: "How it works" });
    const items = within(steps).getAllByRole("listitem").map((li) => li.textContent);
    expect(items).toEqual(["1Write or choose a fictional profile", "2Choose how to compare", "3Read why each profile matched"]);
    expect(screen.getByRole("note")).toHaveTextContent("Every profile here is fictional.");
    expect(screen.getByRole("note")).toHaveTextContent("a high score does not mean two people would get on");
  });

  it("marks a profile found by both methods, in each list, and no other", async () => {
    const { user } = await open();
    await type(user);
    await submit(user);
    await screen.findByTestId("result-embeddings-1");
    const badges = screen.getAllByText("Found by both methods");
    expect(badges).toHaveLength(2); // Calm Scribe, once in each list
    for (const badge of badges) expect(badge.closest("li")).toHaveTextContent("Calm Scribe");
    expect(screen.getByTestId("result-embeddings-1")).not.toHaveTextContent("Found by both methods");
    expect(screen.getByTestId("result-tfidf-2")).not.toHaveTextContent("Found by both methods");
  });

  it("shows no 'found by both' marks when only one method was chosen", async () => {
    const one = { ...RESPONSE, results: [RESPONSE.results[1]], comparison: null }; // what the service returns for one method
    const { user } = await open(() => json(200, one));
    await user.click(screen.getByRole("radio", { name: /^TF-IDF/ }));
    await type(user);
    await submit(user);
    await screen.findByTestId("result-tfidf-1");
    expect(screen.queryByText("Found by both methods")).not.toBeInTheDocument();
  });

  it("draws the overlap as a picture hidden from assistive technology, beside the written count", async () => {
    const { user } = await open();
    await type(user);
    await submit(user);
    const comparison = await screen.findByTestId("comparison");
    const picture = comparison.querySelector("svg");
    expect(picture).toHaveAttribute("aria-hidden", "true");
    expect(comparison).toHaveTextContent("1 of 2 profiles appear in both lists.");
  });

  it("keeps the scores exactly as the service sent them, and never calls them a probability", async () => {
    const { user } = await open();
    await type(user);
    await submit(user);
    await screen.findByTestId("result-embeddings-1");
    const shown = ["result-embeddings-1", "result-embeddings-2", "result-tfidf-1", "result-tfidf-2"].map((id) => within(screen.getByTestId(id)).getByText(/^0\.\d{3}$/).textContent);
    expect(shown).toEqual(["0.644", "0.611", "0.136", "0.121"]);
    expect(screen.getByRole("main").textContent).not.toMatch(/probabilit/i);
  });

  it("on a phone, scrolls the results into view when a search finishes, smoothly", async () => {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    stubMedia((q) => q.includes("max-width"));
    try {
      const { user } = await open();
      await type(user);
      await submit(user);
      await screen.findByTestId("result-embeddings-1");
      await waitFor(() => expect(scroll).toHaveBeenCalledWith({ behavior: "smooth", block: "start" }));
    } finally {
      unstubMedia();
    }
  });

  it("on a phone with reduced motion, jumps to the results without animation", async () => {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    stubMedia(() => true);
    try {
      const { user } = await open();
      await type(user);
      await submit(user);
      await screen.findByTestId("result-embeddings-1");
      await waitFor(() => expect(scroll).toHaveBeenCalledWith({ behavior: "auto", block: "start" }));
    } finally {
      unstubMedia();
    }
  });

  it("on a wide screen, does not scroll the page after a search", async () => {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    stubMedia(() => false);
    try {
      const { user } = await open();
      await type(user);
      await submit(user);
      await screen.findByTestId("result-embeddings-1");
      expect(scroll).not.toHaveBeenCalled();
    } finally {
      unstubMedia();
    }
  });

  it("keeps the method choices named, with their explanation, and the search button prominent", async () => {
    await open();
    expect(screen.getByRole("radio", { name: /Compare both.*Two separate lists/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /TF-IDF.*Compares the words themselves/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Find similar profiles" }).className).toMatch(/bg-gold-fill/);
  });
});

describe("keyboard focus is kept clear of the sticky bars", () => {
  const rect = (top: number, bottom: number) => ({ top, bottom, left: 0, right: 100, width: 100, height: bottom - top }) as DOMRect;
  const pressKey = (key: string) => document.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  const pressPointer = () => document.dispatchEvent(new Event("pointerdown", { bubbles: true }));

  async function withTray() {
    const { user } = await open();
    await type(user);
    await submit(user);
    await screen.findByTestId("result-embeddings-1");
    await user.click(within(screen.getByTestId("result-embeddings-1")).getByRole("button", { name: /^Compare Warm Archer/ }));
    const scrollBy = vi.fn();
    window.scrollBy = scrollBy as unknown as typeof window.scrollBy;
    vi.spyOn(screen.getByRole("region", { name: "Comparison" }), "getBoundingClientRect").mockReturnValue(rect(700, 764));
    vi.spyOn(document.querySelector("header")!, "getBoundingClientRect").mockReturnValue(rect(0, 64));
    return { scrollBy, field: screen.getByRole("textbox", { name: "Profile text" }) };
  }

  it("scrolls up just enough when keyboard focus reaches the comparison tray", async () => {
    const { scrollBy, field } = await withTray();
    vi.spyOn(field, "getBoundingClientRect").mockReturnValue(rect(540, 720));
    pressKey("Tab");
    field.focus();
    expect(scrollBy).toHaveBeenCalledWith({ top: 36, behavior: "auto" }); // 720 - 700 + 16
  });

  it("scrolls down just enough when keyboard focus sits under the top bar", async () => {
    const { scrollBy, field } = await withTray();
    vi.spyOn(field, "getBoundingClientRect").mockReturnValue(rect(20, 200));
    pressKey("Tab");
    field.focus();
    expect(scrollBy).toHaveBeenCalledWith({ top: -60, behavior: "auto" }); // 20 - 64 - 16
  });

  it("never scrolls when focus comes from a pointer, so a click is not lost", async () => {
    const { scrollBy, field } = await withTray();
    vi.spyOn(field, "getBoundingClientRect").mockReturnValue(rect(540, 720));
    pressKey("Tab");
    pressPointer(); // the latest input was a press
    field.focus();
    expect(scrollBy).not.toHaveBeenCalled();
  });

  it("leaves the page alone when the focused control is already clear, or out of view", async () => {
    const { scrollBy, field } = await withTray();
    vi.spyOn(field, "getBoundingClientRect").mockReturnValue(rect(300, 480));
    pressKey("Tab");
    field.focus();
    expect(scrollBy).not.toHaveBeenCalled();
  });
});
