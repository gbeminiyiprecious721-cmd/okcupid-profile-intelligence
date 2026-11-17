import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderApp } from "./test/render";

describe("theme", () => {
  it("applies and remembers a chosen theme, and clears it for system", async () => {
    const user = userEvent.setup();
    renderApp("/");
    const group = await screen.findByRole("group", { name: "Colour theme" });
    await user.click(within(group).getByRole("button", { name: "Dark" }));
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("pi-theme")).toBe("dark");
    expect(within(group).getByRole("button", { name: "Dark" })).toHaveAttribute("aria-pressed", "true");
    await user.click(within(group).getByRole("button", { name: "Follow system" }));
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(localStorage.getItem("pi-theme")).toBeNull();
  });
});

describe("mode and service status", () => {
  it("shows public mode and an online service", async () => {
    renderApp("/", "public");
    expect(await screen.findByText("Public mode")).toBeInTheDocument();
    expect(await screen.findAllByText("Service online")).not.toHaveLength(0);
    expect(await screen.findByText(/no file derived from the real profiles is loaded/i)).toBeInTheDocument();
  });

  it("shows local mode when the service is in local mode", async () => {
    renderApp("/", "local");
    expect(await screen.findByText("Local mode")).toBeInTheDocument();
  });

  it("says plainly when the service cannot be reached", async () => {
    renderApp("/", "offline");
    expect(await screen.findByText("Mode unknown")).toBeInTheDocument();
    expect(await screen.findAllByText("Service offline")).not.toHaveLength(0);
  });
});

describe("classification page keeps the modes apart", () => {
  it("is switched off in public mode", async () => {
    renderApp("/lab/classify", "public");
    expect(await screen.findByText(/The demonstration is switched off/)).toBeInTheDocument();
  });

  it("is off in local mode when the classifier files are not on the computer", async () => {
    renderApp("/lab/classify", "local");
    expect(await screen.findByText(/classifier files are not on this computer/)).toBeInTheDocument();
  });
});
