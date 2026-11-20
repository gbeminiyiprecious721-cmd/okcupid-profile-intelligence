import { GitCompare } from "lucide-react";
import { useLayoutEffect, useRef } from "react";
import { Button } from "../../components/ui/Button";

/** Appears at the foot of the page once a profile is picked. Two picks make a comparison. */
export function CompareTray({ selected, onCompare, onClear }: { selected: { id: string; handle: string }[]; onCompare: (from: HTMLElement) => void; onClear: () => void }) {
  const bar = useRef<HTMLDivElement>(null);
  const showing = selected.length > 0;
  // Tell the page how tall the tray is, so keyboard focus is scrolled clear of it (see scroll-padding in index.css).
  useLayoutEffect(() => {
    const el = bar.current;
    if (!showing || !el) return;
    const root = document.documentElement;
    const update = () => root.style.setProperty("--tray-height", `${el.offsetHeight}px`);
    update();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(el);
    return () => {
      observer?.disconnect();
      root.style.removeProperty("--tray-height");
    };
  }, [showing]);
  if (!showing) return null;
  return (
    <div ref={bar} role="region" aria-label="Comparison" className="fixed inset-x-0 bottom-0 z-30 border-t border-glass bg-card/95 p-3 shadow-[0_-12px_32px_-18px_var(--glow)] backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3">
        <GitCompare aria-hidden="true" className="size-5 text-gold" />
        <p className="min-w-0 flex-1" aria-live="polite">
          {selected.length === 1 ? (
            <>
              <strong className="font-semibold text-heading">{selected[0].handle}</strong> selected. Pick one more to compare.
            </>
          ) : (
            <>
              <strong className="font-semibold text-heading">{selected[0].handle}</strong> and <strong className="font-semibold text-heading">{selected[1].handle}</strong> selected.
            </>
          )}
        </p>
        <Button variant="gold" className="active:translate-y-px" disabled={selected.length < 2} onClick={(e) => onCompare(e.currentTarget)}>
          Compare profiles
        </Button>
        <Button variant="quiet" onClick={onClear}>
          Clear selection
        </Button>
      </div>
    </div>
  );
}
