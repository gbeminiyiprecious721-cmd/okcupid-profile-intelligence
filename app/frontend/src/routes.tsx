import type { RouteObject } from "react-router";
import { AppShell } from "./components/shell/AppShell";
import Home from "./pages/Home";
import NotFound from "./pages/NotFound";

/** Each page is loaded when it is first visited, so the first page does not carry the code of all the others. */
const page = (load: () => Promise<{ default: React.ComponentType }>) => ({
  lazy: async () => ({ Component: (await load()).default }),
});

export const routes: RouteObject[] = [
  {
    element: <AppShell />,
    children: [
      { index: true, element: <Home /> },
      { path: "discover", ...page(() => import("./pages/Discover")) },
      { path: "lab", ...page(() => import("./pages/LabOverview")) },
      { path: "lab/segments", ...page(() => import("./pages/Segments")) },
      { path: "lab/models", ...page(() => import("./pages/Models")) },
      { path: "lab/similarity", ...page(() => import("./pages/Similarity")) },
      { path: "lab/fairness", ...page(() => import("./pages/Fairness")) },
      { path: "lab/classify", ...page(() => import("./pages/Classify")) },
      { path: "about", ...page(() => import("./pages/About")) },
      { path: "*", element: <NotFound /> },
    ],
  },
];
