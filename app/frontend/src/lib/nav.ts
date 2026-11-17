import { BarChart3, Compass, Info, Layers, LayoutDashboard, Network, Scale, ShieldCheck, House, type LucideIcon } from "lucide-react";

export type NavItem = { to: string; label: string; title: string; end?: boolean; icon: LucideIcon };
export type NavGroup = { label: string; items: NavItem[] };

const BASE_GROUPS: NavGroup[] = [
  {
    label: "Explore",
    items: [
      { to: "/", label: "Home", title: "Home", end: true, icon: House },
      { to: "/discover", label: "Profile Discovery", title: "Profile Discovery", icon: Compass },
    ],
  },
  {
    label: "Data Science Lab",
    items: [
      { to: "/lab", label: "Overview", title: "Research overview", end: true, icon: LayoutDashboard },
      { to: "/lab/segments", label: "Segments", title: "Segments", icon: Layers },
      { to: "/lab/models", label: "Model performance", title: "Model performance", icon: BarChart3 },
      { to: "/lab/similarity", label: "Profile similarity", title: "Profile similarity", icon: Network },
      { to: "/lab/fairness", label: "Fairness and limits", title: "Fairness and limitations", icon: Scale },
      { to: "/lab/classify", label: "Classification evidence", title: "Classification evidence", icon: ShieldCheck },
    ],
  },
  { label: "Project", items: [{ to: "/about", label: "About", title: "Data, ethics and limits", icon: Info }] },
];

export const SITE_NAME = "Profile Intelligence";

/** The classifier page is a live demonstration only in local mode. Everywhere else, and until the mode is known,
 *  it presents the research evidence, so it is never named a demo when no demo is running. */
export function classifyNames(mode: string | undefined): { label: string; title: string } {
  return mode === "local"
    ? { label: "Classification demo", title: "Classification demonstration" }
    : { label: "Classification evidence", title: "Classification evidence" };
}

export function navGroups(mode: string | undefined): NavGroup[] {
  const names = classifyNames(mode);
  return BASE_GROUPS.map((group) => ({
    ...group,
    items: group.items.map((item) => (item.to === "/lab/classify" ? { ...item, ...names } : item)),
  }));
}

export function titleFor(pathname: string, mode?: string): string {
  const items = navGroups(mode).flatMap((group) => group.items);
  return items.find((item) => item.to === pathname)?.title ?? "Page not found";
}
