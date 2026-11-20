import { useEffect, useRef, useState } from "react";
import { Outlet, useLocation } from "react-router";
import { useMeta } from "../../api/hooks";
import { SITE_NAME, titleFor } from "../../lib/nav";
import { Footer } from "./Footer";
import { MobileDrawer } from "./MobileDrawer";
import { SidebarNav } from "./SidebarNav";
import { SkipLink } from "./SkipLink";
import { TopBar } from "./TopBar";
import { Wordmark } from "./Wordmark";

/** After a page change: set the document title, scroll to the top and move focus to the new page heading. */
function RouteEffects() {
  const { pathname } = useLocation();
  const mode = useMeta().data?.mode;
  const shownPath = useRef(pathname);
  useEffect(() => {
    document.title = `${titleFor(pathname, mode)} | ${SITE_NAME}`;
    // Only a real page change moves focus. The first load, and a repeat run in development, do not.
    if (shownPath.current === pathname) return;
    shownPath.current = pathname;
    window.scrollTo(0, 0);
    document.querySelector<HTMLElement>("main h1")?.focus();
  }, [pathname, mode]);
  return null;
}

/**
 * Keeps keyboard focus out from under the two bars that sit over the page: the sticky top bar and, on Discovery, the
 * comparison tray (WCAG 2.4.11 focus not obscured). Chrome and Safari honour scroll-padding when they scroll a focused
 * control into view. Firefox does not, so after focus moves we measure and scroll the page just enough ourselves.
 * It runs the moment focus arrives, again a frame later in case the browser scrolled after the event, and never
 * touches focus inside a dialog. It acts only for keyboard focus: scrolling when a pointer presses a control would
 * move the control away between the press and the release, and the click would be lost.
 */
function FocusClearance() {
  useEffect(() => {
    const clear = (target: HTMLElement) => {
      if (!target.isConnected || target.closest("[role=dialog], header, [aria-label=Comparison]")) return;
      const rect = target.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return; // not laid out, so nothing to clear
      const top = document.querySelector("header")?.getBoundingClientRect().bottom ?? 0;
      const tray = document.querySelector("[role=region][aria-label=Comparison]")?.getBoundingClientRect().top ?? window.innerHeight;
      if (rect.bottom <= 0 || rect.top >= window.innerHeight) return; // out of view: the browser has not scrolled to it
      if (rect.top < top + 8) window.scrollBy({ top: rect.top - top - 16, behavior: "auto" });
      else if (rect.bottom > tray - 8) window.scrollBy({ top: rect.bottom - tray + 16, behavior: "auto" });
    };
    let keyboard = false;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Tab" || event.key.startsWith("Arrow") || event.key === "Home" || event.key === "End") keyboard = true;
    };
    const onPointer = () => {
      keyboard = false;
    };
    const onFocus = (event: FocusEvent) => {
      const target = event.target as HTMLElement | null;
      if (!keyboard || !target || !(target instanceof HTMLElement)) return;
      clear(target);
      requestAnimationFrame(() => clear(target));
    };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onPointer, true);
    document.addEventListener("focusin", onFocus);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onPointer, true);
      document.removeEventListener("focusin", onFocus);
    };
  }, []);
  return null;
}

export function AppShell() {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const { pathname } = useLocation();
  return (
    <div className="app-glow min-h-dvh lg:grid lg:grid-cols-[18rem_minmax(0,1fr)]">
      <SkipLink />
      <RouteEffects />
      <FocusClearance />
      <aside className="sticky top-0 hidden h-dvh overflow-y-auto border-r border-line bg-surface px-4 py-6 lg:block">
        <Wordmark className="mb-8 ml-3" />
        <SidebarNav />
      </aside>
      <div className="flex min-h-dvh min-w-0 flex-col">
        <TopBar onOpenMenu={() => setMenuOpen(true)} menuButtonRef={menuButton} />
        <main id="main" tabIndex={-1} className="flex-1 outline-none">
          <div key={pathname} className="route-enter mx-auto w-full max-w-[70rem] px-4 py-10 sm:px-6 lg:px-10 lg:py-14">
            <Outlet />
          </div>
        </main>
        <Footer />
      </div>
      <MobileDrawer open={menuOpen} onOpenChange={setMenuOpen} returnFocusTo={menuButton} />
    </div>
  );
}
