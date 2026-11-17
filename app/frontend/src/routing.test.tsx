import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { classifyApi } from "./test/fixtures";
import { LAB, renderApp } from "./test/render";

const PAGES: [string, string][] = [
  ["/", "What a dating profile can and cannot tell us"],
  ["/discover", "Profile Discovery"],
  ["/lab", "Research overview"],
  ["/lab/segments", "Segments"],
  ["/lab/models", "Model performance"],
  ["/lab/similarity", "Profile similarity"],
  ["/lab/fairness", "Fairness and limitations"],
  ["/lab/classify", "Classification evidence"],
  ["/about", "Data, ethics and limits"],
];

describe("pages", () => {
  it.each(PAGES)("%s shows one heading, %s", async (path, heading) => {
    renderApp(path);
    expect(await screen.findAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1, name: heading })).toBeInTheDocument();
  });

  it("shows a clear page for an unknown address", async () => {
    renderApp("/nothing/here");
    expect(await screen.findByRole("heading", { level: 1, name: "Page not found" })).toBeInTheDocument();
  });

  it.each(["/discover"])(
    "%s shows no percentage or score",
    async (path) => {
      renderApp(path);
      const main = await screen.findByRole("main");
      expect(main.textContent).not.toMatch(/\d+(\.\d+)?\s?%|0\.\d{2,}/);
    },
  );
});

describe("home page", () => {
  it("no longer says that no profiles exist, and links to working Profile Discovery", async () => {
    renderApp("/");
    const main = await screen.findByRole("main");
    expect(main.textContent ?? "").not.toMatch(/no profiles exist|early build|placeholder|layout sketch/i);
    expect(within(main).getByRole("link", { name: /Try Profile Discovery/ })).toHaveAttribute("href", "/discover");
  });

  it("has one heading, three actions and three feature cards that link to real pages", async () => {
    renderApp("/");
    const main = await screen.findByRole("main");
    expect(within(main).getByRole("heading", { level: 1, name: "What a dating profile can and cannot tell us" })).toBeInTheDocument();
    expect(within(main).getByRole("link", { name: "Explore the Research" })).toHaveAttribute("href", "/lab");
    expect(within(main).getByRole("link", { name: "About the Project" })).toHaveAttribute("href", "/about");
    expect(within(main).getByRole("link", { name: /^Profile Discovery Write a fictional profile/ })).toHaveAttribute("href", "/discover");
    expect(within(main).getByRole("link", { name: /^Machine Learning Research/ })).toHaveAttribute("href", "/lab");
    expect(within(main).getByRole("link", { name: /^Responsible AI/ })).toHaveAttribute("href", "/lab/fairness");
  });

  it("shows the four research figures from the verified summary, not from typed in numbers", async () => {
    renderApp("/");
    const figures = (await screen.findByText("Profiles analysed")).closest("ul")!;
    expect(figures).toHaveTextContent("59,946");
    expect(figures).toHaveTextContent("User segments");
    expect(figures).toHaveTextContent(String(LAB.segments.items.length));
    expect(figures).toHaveTextContent(LAB.models.test.final.macro_f1.toFixed(3));
    expect(figures).toHaveTextContent(`Baseline ${LAB.models.test.baseline.macro_f1.toFixed(3)}`);
    expect(figures).toHaveTextContent("2011–2012");
    // the validated figures themselves, so a change to the summary or the page cannot drift apart unnoticed
    expect([LAB.overview.dataset.profiles, LAB.models.test.final.macro_f1, LAB.models.test.baseline.macro_f1, LAB.segments.items.length]).toEqual([59946, 0.386, 0.212, 6]);
  });

  it("states the findings and the limits, without overstating", async () => {
    renderApp("/");
    const findings = await screen.findByRole("region", { name: /What the research found, and what it cannot show/ });
    expect(findings).toHaveTextContent("The signal is modest");
    expect(findings).toHaveTextContent("weakly separated");
    expect(findings).toHaveTextContent("did not improve validation macro F1");
    expect(findings).toHaveTextContent("Similar writing is not compatibility");
    expect(findings.textContent ?? "").not.toMatch(/meaningful|proves|predicts how people/i);
  });

  it("announces the wait while the figures load, and offers a retry when they cannot be loaded", async () => {
    renderApp("/", "public", false, (url) => (url.endsWith("/lab/summary") ? new Response(JSON.stringify({ error: { code: "internal_error", message: "x" } }), { status: 500, headers: { "Content-Type": "application/json" } }) : undefined));
    expect(await screen.findByRole("alert")).toHaveTextContent("The research figures could not be loaded.");
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Try Profile Discovery/ })).toBeInTheDocument(); // the page still works without the figures
  });
});

describe("classification page name", () => {
  const sidebarLink = async (name: string) => within((await screen.findAllByRole("navigation", { name: "Main" }))[0]).findByRole("link", { name });

  it("is called Classification evidence in public mode, in the menu, the heading and the tab title", async () => {
    renderApp("/lab/classify", "public");
    expect(await sidebarLink("Classification evidence")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Classification demo" })).not.toBeInTheDocument();
    expect(await screen.findByRole("heading", { level: 1, name: "Classification evidence" })).toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe("Classification evidence | Profile Intelligence"));
  });

  it("keeps Classification demo for local mode only", async () => {
    renderApp("/lab/classify", "local", false, classifyApi());
    expect(await sidebarLink("Classification demo")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { level: 1, name: "Classification demonstration" })).toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe("Classification demonstration | Profile Intelligence"));
  });
});

describe("navigation", () => {
  it("marks the current page in the sidebar", async () => {
    renderApp("/lab/models");
    const nav = (await screen.findAllByRole("navigation", { name: "Main" }))[0];
    expect(within(nav).getByRole("link", { name: "Model performance" })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("link", { name: "Segments" })).not.toHaveAttribute("aria-current");
  });

  it("changes page, title and focus when a link is used", async () => {
    const user = userEvent.setup();
    renderApp("/");
    const nav = (await screen.findAllByRole("navigation", { name: "Main" }))[0];
    await user.click(within(nav).getByRole("link", { name: "Fairness and limits" }));
    const heading = await screen.findByRole("heading", { level: 1, name: "Fairness and limitations" });
    await waitFor(() => expect(heading).toHaveFocus());
    expect(document.title).toBe("Fairness and limitations | Profile Intelligence");
  });

  it("leaves focus alone on first load, even when effects run twice as in development", async () => {
    renderApp("/discover", "public", true);
    await screen.findByRole("main");
    expect(document.body).toHaveFocus();
  });

  it("puts the skip link first in the tab order and moves focus to the content", async () => {
    const user = userEvent.setup();
    renderApp("/discover");
    await screen.findByRole("main");
    await user.tab();
    const skip = screen.getByRole("link", { name: "Skip to main content" });
    expect(skip).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("main")).toHaveFocus();
  });

  it("opens the mobile navigation, closes it with Escape and returns focus to the button", async () => {
    const user = userEvent.setup();
    renderApp("/");
    const button = await screen.findByRole("button", { name: "Open navigation" });
    await user.click(button);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("link", { name: "About" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(button).toHaveFocus();
  });
});

describe("about page", () => {
  it("has a summary, privacy and limits, no leftover plan text, and never calls similarity compatibility", async () => {
    renderApp("/about");
    await screen.findByRole("heading", { level: 1, name: "Data, ethics and limits" });
    expect(screen.getByRole("region", { name: "In short" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "What was done about privacy" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Limits" })).toBeInTheDocument();
    const text = document.querySelector("main")?.textContent ?? "";
    expect(text).not.toMatch(/Phase \d/);
    expect(text).toMatch(/Similar writing is not compatibility/);
  });
});
