import { MousePointerClick, Table2 } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { cn } from "../../lib/cn";

/* Charts are built from HTML and SVG with no chart library. Every chart can be read three ways:
   the picture, a readout line that explains the mark you point at, focus or press, and a table of the same numbers. */

export type Split = "training" | "validation" | "test";

const SPLIT = {
  training: { label: "Training score", help: "measured on the data the model learned from", shape: "○" },
  validation: { label: "Validation score", help: "measured on held back parts of the training data", shape: "◐" },
  test: { label: "Test score", help: "measured once on data kept apart until the end", shape: "●" },
} as const;

/** The kind of score a number is. Always words plus a shape, never colour alone. */
export function SplitBadge({ kind }: { kind: Split }) {
  const s = SPLIT[kind];
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-glass bg-bg px-2.5 py-0.5 text-sm font-medium text-heading">
      <span aria-hidden="true">{s.shape}</span>
      {s.label}
      <span className="sr-only">, {s.help}</span>
    </span>
  );
}

export type TableData = { columns: string[]; rows: (string | number)[][] };

export function DataTable({ caption, data }: { caption: string; data: TableData }) {
  return (
    <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={`${caption}, scrolls sideways on small screens`}>
      <table className="w-full min-w-[28rem] border-collapse text-left text-[0.9375rem]">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {data.columns.map((c) => (
              <th key={c} scope="col" className="border-b border-glass bg-bg px-3 py-2 font-semibold text-heading first:rounded-tl-lg last:rounded-tr-lg">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row, i) => (
            <tr key={i} className="border-b border-line">
              {row.map((cell, j) =>
                j === 0 ? (
                  <th key={j} scope="row" className="px-3 py-2 font-medium">
                    {cell}
                  </th>
                ) : (
                  <td key={j} className="px-3 py-2 tabular-nums">
                    {cell}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type FrameProps = {
  title: string;
  note?: ReactNode;
  badges?: ReactNode;
  table: TableData;
  source: string;
  children: ReactNode;
  readout?: string | null;
  controls?: ReactNode;
};

/** Title that states the finding, optional controls, the chart, a readout line, a table switch and the source. */
export function ChartFrame({ title, note, badges, table, source, children, readout, controls }: FrameProps) {
  const id = useId();
  const [asTable, setAsTable] = useState(false);
  return (
    <figure aria-labelledby={`${id}-t`} className="glass p-4 shadow-[inset_0_3px_0_var(--thread),0_12px_32px_-18px_var(--glow)] sm:p-6">
      <figcaption>
        <h3 id={`${id}-t`} className="text-xl font-semibold">
          {title}
        </h3>
        {badges && <div className="mt-2 flex flex-wrap gap-2">{badges}</div>}
        {note && <p className="mt-2 text-muted">{note}</p>}
      </figcaption>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">{controls}</div>
        <button
          type="button"
          aria-pressed={asTable}
          onClick={() => setAsTable((v) => !v)}
          className={cn("inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors motion-reduce:transition-none", asTable ? "border-gold bg-bg text-gold" : "border-glass hover:bg-bg")}
        >
          <Table2 aria-hidden="true" className="size-4" />
          {asTable ? "Show chart" : "Show as table"}
        </button>
      </div>
      <div className="mt-3">
        {asTable ? <DataTable caption={title} data={table} /> : children}
        {!asTable && readout !== undefined && (
          <p aria-live="polite" className="mt-3 flex min-h-[3.25rem] items-start gap-2.5 rounded-xl border border-line bg-bg px-3.5 py-2.5 text-[0.9375rem]">
            <MousePointerClick aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-gold" />
            <span>{readout ?? <span className="text-muted">Point at, focus or press a mark to see what it means.</span>}</span>
          </p>
        )}
      </div>
      <p className="mt-3 text-sm text-muted">{source}</p>
    </figure>
  );
}

/** A group of choices that act as a filter. A real radio group, so it works with a keyboard and a screen reader. */
export function Choice<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  const name = useId();
  return (
    <fieldset className="flex flex-wrap items-center gap-2">
      <legend className="sr-only">{label}</legend>
      <span aria-hidden="true" className="text-sm text-muted">
        {label}
      </span>
      <div className="inline-flex flex-wrap gap-0.5 rounded-full border border-glass bg-bg p-1">
        {options.map((o) => (
          <label
            key={o.value}
            className={cn(
              "inline-flex min-h-10 cursor-pointer items-center rounded-full px-3.5 text-sm font-medium transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus motion-reduce:transition-none",
              value === o.value ? "bg-gold-fill text-on-gold" : "text-fg hover:bg-card",
            )}
          >
            <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} className="sr-only" />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

// ------------------------------------------------------------------ horizontal bars
export type Bar = {
  id: string;
  label: string;
  sublabel?: string;
  value: number;
  display: string;
  low?: number;
  high?: number;
  tone?: "main" | "alt" | "muted" | "highlight";
  /** Draw only the span from low to high, with no bar from zero. For a figure the notebook gives as a range. */
  rangeOnly?: boolean;
  detail: string;
};

const TONE = { main: "bg-teal", alt: "bg-primary", muted: "bg-control", highlight: "bg-accent" } as const;

export function BarChart({ bars, max, reference, onReadout, label }: { bars: Bar[]; max: number; reference?: { value: number; label: string }; onReadout: (s: string | null) => void; label: string }) {
  const [pinned, setPinned] = useState<string | null>(null);
  const at = (v: number) => `${Math.min(100, Math.max(0, (v / max) * 100))}%`;
  return (
    <ul aria-label={label} className="space-y-1.5">
      {bars.map((b) => (
        <li key={b.id}>
          <button
            type="button"
            aria-pressed={pinned === b.id}
            onClick={() => {
              const next = pinned === b.id ? null : b.id;
              setPinned(next);
              onReadout(next ? b.detail : null);
            }}
            onMouseEnter={() => onReadout(b.detail)}
            onMouseLeave={() => onReadout(pinned ? (bars.find((x) => x.id === pinned)?.detail ?? null) : null)}
            onFocus={() => onReadout(b.detail)}
            className={cn("grid w-full min-h-11 grid-cols-1 items-center gap-x-3 gap-y-1 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-bg motion-reduce:transition-none sm:grid-cols-[minmax(9rem,32%)_1fr_4.5rem]", pinned === b.id && "bg-bg outline outline-1 outline-[var(--thread)]")}
          >
            <span className="text-[0.9375rem] leading-snug">
              <span className="font-medium text-heading">{b.label}</span>
              {b.sublabel && <span className="block text-sm text-muted">{b.sublabel}</span>}
            </span>
            <span className="relative block h-5">
              <span aria-hidden="true" className="absolute inset-y-0 left-0 right-0 rounded-sm bg-line" />
              {b.rangeOnly && b.low !== undefined && b.high !== undefined ? (
                <span aria-hidden="true" className={cn("absolute inset-y-0 rounded-sm", TONE[b.tone ?? "main"])} style={{ left: at(b.low), width: `calc(${at(b.high)} - ${at(b.low)})` }} />
              ) : (
                <span aria-hidden="true" className={cn("absolute inset-y-0 left-0 rounded-sm", TONE[b.tone ?? "main"])} style={{ width: at(b.value) }} />
              )}
              {!b.rangeOnly && b.low !== undefined && b.high !== undefined && (
                <span aria-hidden="true" className="absolute top-1/2 h-0.5 -translate-y-1/2 bg-heading" style={{ left: at(b.low), width: `calc(${at(b.high)} - ${at(b.low)})` }}>
                  <span className="absolute -left-px top-1/2 h-3 w-0.5 -translate-y-1/2 bg-heading" />
                  <span className="absolute -right-px top-1/2 h-3 w-0.5 -translate-y-1/2 bg-heading" />
                </span>
              )}
              {reference && <span aria-hidden="true" className="absolute inset-y-[-3px] w-0.5 bg-heading" style={{ left: at(reference.value) }} />}
            </span>
            <span className="text-sm font-semibold tabular-nums text-heading sm:text-right">{b.display}</span>
          </button>
        </li>
      ))}
      {reference && (
        <li className="px-2 text-sm text-muted" aria-hidden="false">
          <span aria-hidden="true" className="mr-1.5 inline-block h-3 w-0.5 translate-y-0.5 bg-heading" />
          {reference.label}
        </li>
      )}
    </ul>
  );
}

// ------------------------------------------------------------------ lines over a few categories
export type Series = { name: string; tone: "main" | "alt" | "accent"; dash?: string; values: number[] };

const STROKE = { main: "var(--teal)", alt: "var(--primary)", accent: "var(--accent)" } as const;

/** Lines across a short list of categories (such as k or C). Each category is one button that reads out all lines. */
export function LineChart({
  categories,
  series,
  yMin,
  yMax,
  yLabel,
  xLabel,
  lines,
  format,
  onReadout,
}: {
  categories: string[];
  series: Series[];
  yMin: number;
  yMax: number;
  yLabel: string;
  xLabel: string;
  lines?: { y: number; label: string }[];
  format: (n: number) => string;
  onReadout: (s: string | null) => void;
}) {
  const W = 480;
  const H = 300;
  const m = { l: 56, r: 16, t: 14, b: 46 };
  const x = (i: number) => m.l + ((W - m.l - m.r) * (i + 0.5)) / categories.length;
  const y = (v: number) => m.t + (H - m.t - m.b) * (1 - (v - yMin) / (yMax - yMin));
  const ticks = Array.from({ length: 5 }, (_, i) => yMin + ((yMax - yMin) * i) / 4);
  const say = (i: number) => `${xLabel} ${categories[i]}: ${series.map((s) => `${s.name} ${format(s.values[i])}`).join(", ")}.`;
  return (
    <div>
      <div className="relative mx-auto max-w-[560px]">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${yLabel} by ${xLabel}. ${series.map((s) => s.name).join(" and ")}. A table view has the numbers.`} className="mx-auto h-auto w-full max-w-[560px]">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={m.l} x2={W - m.r} y1={y(t)} y2={y(t)} stroke="var(--line)" />
              <text x={m.l - 8} y={y(t) + 4} textAnchor="end" fontSize="14" fill="var(--fg-muted)">
                {format(t)}
              </text>
            </g>
          ))}
          {lines?.map((l) => (
            <g key={l.label}>
              <line x1={m.l} x2={W - m.r} y1={y(l.y)} y2={y(l.y)} stroke="var(--heading)" strokeDasharray="6 4" />
              <text x={W - m.r} y={y(l.y) - 5} textAnchor="end" fontSize="14" fill="var(--heading)">
                {l.label}
              </text>
            </g>
          ))}
          {categories.map((c, i) => (
            <text key={c} x={x(i)} y={H - 24} textAnchor="middle" fontSize="14" fill="var(--fg-muted)">
              {c}
            </text>
          ))}
          <text x={(W + m.l) / 2} y={H - 4} textAnchor="middle" fontSize="14" fill="var(--fg-muted)">
            {xLabel}
          </text>
          {series.map((s) => (
            <g key={s.name}>
              <polyline fill="none" stroke={STROKE[s.tone]} strokeWidth="2.5" strokeDasharray={s.dash} points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ")} />
              {s.values.map((v, i) => (
                <circle key={i} cx={x(i)} cy={y(v)} r="4.5" fill="var(--bg)" stroke={STROKE[s.tone]} strokeWidth="2.5" />
              ))}
            </g>
          ))}
        </svg>
        <div className="absolute inset-0 flex" style={{ left: `${(m.l / W) * 100}%`, right: `${(m.r / W) * 100}%` }}>
          {categories.map((c, i) => (
            <button
              key={c}
              type="button"
              aria-label={say(i)}
              onMouseEnter={() => onReadout(say(i))}
              onFocus={() => onReadout(say(i))}
              onClick={() => onReadout(say(i))}
              className="h-full flex-1 rounded-sm hover:bg-[color-mix(in_srgb,var(--heading)_6%,transparent)]"
            />
          ))}
        </div>
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
        {series.map((s) => (
          <li key={s.name} className="inline-flex items-center gap-2">
            <svg width="28" height="10" aria-hidden="true">
              <line x1="0" x2="28" y1="5" y2="5" stroke={STROKE[s.tone]} strokeWidth="2.5" strokeDasharray={s.dash} />
            </svg>
            {s.name}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ------------------------------------------------------------------ share of a whole, as one split bar
export function SplitBar({ parts, selected, onSelect }: { parts: { id: number; label: string; value: number; display: string }[]; selected: number; onSelect: (id: number) => void }) {
  const total = parts.reduce((n, p) => n + p.value, 0);
  const tones = ["bg-teal", "bg-primary", "bg-accent", "bg-gold", "bg-fg", "bg-muted"];
  return (
    <div role="group" aria-label="Segments by share of users. Press one to read about it." className="flex h-12 gap-0.5 overflow-hidden rounded-md">
      {parts.map((p, i) => (
        <button
          key={p.id}
          type="button"
          aria-pressed={selected === p.id}
          aria-label={`Segment ${p.id}, ${p.label}, ${p.display} of users`}
          onClick={() => onSelect(p.id)}
          style={{ width: `${(p.value / total) * 100}%` }}
          className={cn("relative min-w-0 text-sm font-semibold text-on-primary", tones[i % tones.length], selected === p.id ? "outline outline-[3px] -outline-offset-[3px] outline-heading" : "opacity-85 hover:opacity-100")}
        >
          <span aria-hidden="true" className="px-1">
            {p.id}
          </span>
        </button>
      ))}
    </div>
  );
}
