import { useLayoutEffect, useState, type RefObject } from "react";

type Line = { key: string; d: string; x: number; y: number };

/**
 * Gold threads from the submitted profile to each list of results.
 * The paths are measured from the real positions of the page, so they follow the layout at every width.
 * They are decoration only: hidden from assistive technology, never looped, and static under reduced motion.
 */
export function ThreadLayer({
  container,
  source,
  targets,
  runKey,
}: {
  container: RefObject<HTMLElement | null>;
  source: RefObject<HTMLElement | null>;
  targets: string[];
  runKey: string;
}) {
  const [lines, setLines] = useState<Line[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const joined = targets.join("|");

  useLayoutEffect(() => {
    const root = container.current;
    if (!root) return;
    const measure = () => {
      const from = source.current;
      if (!from) return setLines([]);
      const base = root.getBoundingClientRect();
      const s = from.getBoundingClientRect();
      const next: Line[] = [];
      for (const key of joined ? joined.split("|") : []) {
        const el = root.querySelector<HTMLElement>(`[data-thread-target="${key}"]`);
        if (!el) continue;
        const t = el.getBoundingClientRect();
        if (t.width === 0 && t.height === 0) continue; // hidden at this width
        const ex = t.left - base.left + 1;
        const ey = t.top - base.top;
        const stacked = t.top > s.bottom - 10;
        const sx = stacked ? s.left - base.left + 12 : s.right - base.left;
        const sy = stacked ? s.bottom - base.top : s.top - base.top + 36;
        const gap = Math.max(40, Math.abs(ey - sy) / 2);
        const d = stacked
          ? `M${sx} ${sy} C ${sx} ${sy + gap}, ${ex} ${ey - gap}, ${ex} ${ey}`
          : `M${sx} ${sy} C ${sx + Math.abs(ex - sx) * 0.6} ${sy}, ${ex} ${ey - 48}, ${ex} ${ey}`;
        next.push({ key, d, x: ex, y: ey });
      }
      setSize({ w: base.width, h: base.height });
      setLines(next);
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(root);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [container, source, joined, runKey]);

  if (size.w === 0) return null;
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={size.w}
      height={size.h}
      className="pointer-events-none absolute left-0 top-0 z-0 drop-shadow-[0_0_5px_var(--glow)]"
      data-testid="thread-layer"
    >
      {lines.map((line, index) => (
        <g key={`${runKey}-${line.key}`}>
          <path
            pathLength={1}
            className={index === 0 ? "thread-draw" : "thread-draw thread-draw-2"}
            d={line.d}
            fill="none"
            stroke="var(--thread)"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <circle cx={line.x} cy={line.y} r="5" fill="var(--bg)" stroke="var(--thread)" strokeWidth="2.5" className="thread-node" />
        </g>
      ))}
    </svg>
  );
}
