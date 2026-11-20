import { Menu } from "lucide-react";
import type { Ref } from "react";
import { ModeBadge, ServiceStatus } from "./StatusIndicators";
import { ThemeToggle } from "./ThemeToggle";
import { Wordmark } from "./Wordmark";

export function TopBar({ onOpenMenu, menuButtonRef }: { onOpenMenu: () => void; menuButtonRef: Ref<HTMLButtonElement> }) {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-bg/95 backdrop-blur-sm">
      <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-10">
        <button
          ref={menuButtonRef}
          type="button"
          onClick={onOpenMenu}
          aria-label="Open navigation"
          aria-haspopup="dialog"
          className="inline-flex size-11 items-center justify-center rounded-md border border-control text-fg lg:hidden"
        >
          <Menu aria-hidden="true" className="size-5" />
        </button>
        <Wordmark compact className="lg:hidden" />
        <p className="hidden text-sm text-muted lg:block">Fictional profiles only. Please do not enter real personal details.</p>
        <div className="ml-auto flex items-center gap-3 sm:gap-4">
          <ModeBadge />
          <ServiceStatus />
          <div className="hidden sm:block">
            <ThemeToggle />
          </div>
        </div>
      </div>
    </header>
  );
}
