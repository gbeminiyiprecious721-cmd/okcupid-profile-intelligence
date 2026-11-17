import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiError, CLASSIFY_EXAMPLES, CLASSIFY_LEVELS, classifyApi, json, prediction } from "./test/fixtures";
import { LAB, renderApp } from "./test/render";

afterEach(() => vi.restoreAllMocks());

/** The six example choices. Charts on the same page have their own filter radios, which are not examples. */
const exampleRadios = () => screen.queryAllByRole("radio").filter((r) => r.getAttribute("name") === "example");

async function local(predict?: Parameters<typeof classifyApi>[0]) {
  const user = userEvent.setup();
  const { fetchMock } = renderApp("/lab/classify", "local", false, classifyApi(predict));
  await screen.findByRole("group", { name: /Choose one of six fictional examples/ });
  const posts = () => fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === "POST");
  return { user, fetchMock, posts };
}

describe("public mode", () => {
  it("is switched off, shows no example controls and never asks for the classifier", async () => {
    const { fetchMock } = renderApp("/lab/classify", "public");
    expect(await screen.findByText(/Public mode. The demonstration is switched off/)).toBeInTheDocument();
    expect(exampleRadios()).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "Run the classifier" })).not.toBeInTheDocument();
    await screen.findAllByRole("figure");
    expect(fetchMock.mock.calls.every(([u]) => !String(u).includes("/classify/"))).toBe(true);
  });

  it("still shows the aggregate research evidence", async () => {
    renderApp("/lab/classify", "public");
    expect(await screen.findByRole("heading", { name: "How well does it work?" })).toBeInTheDocument();
    expect(screen.getByLabelText("Headline test results")).toBeInTheDocument();
  });

  it("explains that the demonstration needs local files when the service is local but has none", async () => {
    renderApp("/lab/classify", "local");
    expect(await screen.findByText(/classifier files are not on this computer/)).toBeInTheDocument();
    expect(exampleRadios()).toHaveLength(0);
  });
});

describe("the demonstration in local mode", () => {
  it("offers six fictional examples and no way to type, or to change sex or location", async () => {
    await local();
    expect(exampleRadios()).toHaveLength(6);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
    const card = screen.getByRole("radio", { name: /Lively Printer/ }).closest("label")!.parentElement!;
    expect(within(card).getAllByText("(fixed)")).toHaveLength(2); // sex and location are shown, not editable
    expect(screen.getAllByText("Fictional example")).toHaveLength(6);
  });

  it("cannot run until an example is chosen", async () => {
    const { user, posts } = await local();
    expect(screen.getByRole("button", { name: "Run the classifier" })).toBeDisabled();
    await user.click(screen.getByRole("radio", { name: /Brisk Tailor/ }));
    expect(screen.getByRole("button", { name: "Run the classifier" })).toBeEnabled();
    expect(posts()).toHaveLength(0);
  });

  it("sends only the example name", async () => {
    const { user, posts } = await local();
    await user.click(screen.getByRole("radio", { name: /Modest Mariner/ }));
    await user.click(screen.getByRole("button", { name: "Run the classifier" }));
    await screen.findByTestId("prediction");
    const bodies = posts().map(([, init]) => JSON.parse((init as RequestInit).body as string));
    expect(bodies).toEqual([{ example_id: CLASSIFY_EXAMPLES[3].example_id }]);
  });

  it("shows the predicted category prominently, four probabilities that sum to 100%, and the base rates", async () => {
    const { user } = await local((b) => json(200, prediction(b.example_id!, [0.1, 0.55, 0.2, 0.15])));
    await user.click(screen.getByRole("radio", { name: /Lively Printer/ }));
    await user.click(screen.getByRole("button", { name: "Run the classifier" }));
    const box = await screen.findByTestId("prediction");
    expect(within(box).getByTestId("predicted")).toHaveTextContent("Most probable category: rarely");
    const values = CLASSIFY_LEVELS.map((level) => within(within(box).getByTestId(`prob-${level}`)).getByText(/^\d+\.\d%$/).textContent);
    expect(values).toEqual(["10.0%", "55.0%", "20.0%", "15.0%"]);
    expect(values.reduce((n, v) => n + parseFloat(v!), 0)).toBeCloseTo(100, 5);
    expect(within(box).getByTestId("prob-socially")).toHaveTextContent("base rate 73.3%");
    expect(within(box).getByTestId("prob-not at all")).toHaveTextContent("base rate 5.7%");
  });

  it("says probabilities are estimates, not facts, and not true frequencies", async () => {
    const { user } = await local();
    await user.click(screen.getByRole("radio", { name: /Calm Mariner/ }));
    await user.click(screen.getByRole("button", { name: "Run the classifier" }));
    const box = await screen.findByTestId("prediction");
    expect(box).toHaveTextContent("That is an estimate, not certainty");
    expect(box).toHaveTextContent("These probabilities are not true frequencies");
    expect(box).toHaveTextContent("Not a fact about a person");
  });

  it("shows a loading state and disables the button while it runs", async () => {
    let release: (r: Response) => void = () => undefined;
    const pending = new Promise<Response>((r) => (release = r));
    const { user } = await local(() => pending);
    await user.click(screen.getByRole("radio", { name: /Brisk Tailor/ }));
    await user.click(screen.getByRole("button", { name: "Run the classifier" }));
    expect(await screen.findByRole("button", { name: "Running" })).toBeDisabled();
    release(json(200, prediction(CLASSIFY_EXAMPLES[2].example_id)));
    expect(await screen.findByTestId("prediction")).toBeInTheDocument();
  });

  it.each([
    [() => apiError(403, "local_only", "The classification demonstration runs in local mode only."), "This feature runs in local mode only"],
    [() => apiError(500, "internal_error", "Something went wrong on the server."), "Something went wrong on the server"],
    [() => apiError(503, "feature_unavailable", "The classifier files are not present on this computer."), "Discovery is not available"],
  ])("explains a failed run", async (answer, title) => {
    const { user } = await local(answer);
    await user.click(screen.getByRole("radio", { name: /Brisk Tailor/ }));
    await user.click(screen.getByRole("button", { name: "Run the classifier" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(title);
  });

  it("stores nothing in the browser", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const { user } = await local();
    await user.click(screen.getByRole("radio", { name: /Brisk Tailor/ }));
    await user.click(screen.getByRole("button", { name: "Run the classifier" }));
    await screen.findByTestId("prediction");
    expect(setItem.mock.calls.filter(([key]) => key !== "pi-theme")).toEqual([]);
    expect(document.cookie).toBe("");
  });
});

describe("research evidence", () => {
  it("shows the validated test results exactly", async () => {
    renderApp("/lab/classify", "public");
    const facts = await screen.findByLabelText("Headline test results");
    expect(facts).toHaveTextContent("Macro F1");
    for (const text of ["0.386", "95% range 0.376 to 0.397", "0.212", "0.517", "0.734"]) expect(facts).toHaveTextContent(text);
    expect(LAB.models.test.final.macro_f1).toBe(0.386);
  });

  it("includes the confusion matrix and per group precision and recall", async () => {
    renderApp("/lab/classify", "public");
    const matrix = await screen.findByRole("figure", { name: /Mistakes mostly go to the neighbouring group/ });
    expect(within(matrix).getAllByRole("button").filter((b) => /^\d+%$/.test(b.textContent ?? ""))).toHaveLength(16);
    expect(matrix).toHaveTextContent(/rounded whole number percentages transcribed from the notebook/);
    const groups = screen.getByRole("figure", { name: /four in ten of the others/ });
    expect(within(groups).getByRole("radio", { name: "Recall" })).toBeChecked();
    expect(within(groups).getByRole("radio", { name: "Precision" })).toBeInTheDocument();
  });

  it("explains macro F1, the lower accuracy, individual behaviour, sex and location, and proxy effects", async () => {
    renderApp("/lab/classify", "public");
    await screen.findByRole("heading", { name: "Reading the evidence" });
    const main = screen.getByRole("main");
    for (const title of ["Why macro F1 was chosen", "Why accuracy is lower than the baseline", "Precision and recall", "Why individual behaviour cannot be predicted this way", "Sex and location were inputs", "Proxy effects", "Uneven performance", "What it must never be used for"])
      expect(within(main).getByRole("heading", { name: title })).toBeInTheDocument();
    expect(main).toHaveTextContent("Educational use only");
    expect(main).toHaveTextContent("Educational and experimental");
  });
});

describe("accessibility", () => {
  it("has one h1, no skipped heading levels and named controls in both modes", async () => {
    for (const mode of ["public", "local"] as const) {
      const { unmount } = (await import("@testing-library/react")).render(<></>);
      unmount();
      renderApp("/lab/classify", mode, false, mode === "local" ? classifyApi() : undefined);
      await screen.findByRole("heading", { name: "How well does it work?" });
      const levels = screen.getAllByRole("heading").map((h) => Number(h.tagName[1]));
      expect(levels.filter((l) => l === 1)).toHaveLength(1);
      levels.forEach((l, i) => i > 0 && expect(l - levels[i - 1]).toBeLessThanOrEqual(1));
      for (const radio of screen.queryAllByRole("radio")) expect(radio).toHaveAccessibleName();
      for (const f of screen.queryAllByRole("figure")) expect(f).toHaveAccessibleName();
      document.body.innerHTML = "";
    }
  });

  it("the example choice is a labelled radio group usable with the keyboard", async () => {
    const { user } = await local();
    const first = screen.getByRole("radio", { name: /Lively Printer/ });
    first.focus();
    await user.keyboard("{ArrowDown}");
    await waitFor(() => expect(screen.getByRole("radio", { name: /Dapper Botanist/ })).toBeChecked());
  });

  it("the result is announced in a polite live region", async () => {
    const { user } = await local();
    await user.click(screen.getByRole("radio", { name: /Brisk Tailor/ }));
    await user.click(screen.getByRole("button", { name: "Run the classifier" }));
    const box = await screen.findByTestId("prediction");
    expect(box).toHaveAttribute("aria-live", "polite");
  });
});
