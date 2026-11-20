import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { StrictMode } from "react";
import { vi } from "vitest";
import { createMemoryRouter, RouterProvider } from "react-router";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { routes } from "../routes";

/** The real approved aggregate file, so page tests run on the real numbers. */
export const LAB = JSON.parse(readFileSync(resolve(process.cwd(), "../content/lab/lab_summary.json"), "utf8")) as import("../api/client").LabSummary;

type Mode = "public" | "local" | "offline";

/** Stand in for the backend. "offline" makes every request fail. */
export type Override = (url: string, init?: RequestInit) => Response | Promise<Response> | undefined;

export function stubApi(mode: Mode, override?: Override) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (mode === "offline") throw new TypeError("network down");
      const custom = override?.(url, init);
      if (custom) return custom;
      if (url.endsWith("/lab/summary")) return new Response(JSON.stringify(LAB), { status: 200, headers: { "Content-Type": "application/json" } });
      const body = url.endsWith("/health")
        ? { status: "ok", mode, version: "0.1.0" }
        : {
            mode,
            version: "0.1.0",
            features: { discovery: false, lab_summary: true, classifier_demo: false, segment_assignment: false },
            local_only_features: ["classifier_demo", "segment_assignment"],
            limits: { max_text_chars: 2000, min_neighbours: 1, max_neighbours: 10 },
            notice: "Fictional profiles only. Nothing you type is stored.",
          };
      return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

export function renderApp(path = "/", mode: Mode = "public", strict = false, override?: Override) {
  const fetchMock = stubApi(mode, override);
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
  const tree = (
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
  render(strict ? <StrictMode>{tree}</StrictMode> : tree);
  return { router, fetchMock };
}
