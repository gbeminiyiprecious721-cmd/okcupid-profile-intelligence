import type { ReactNode } from "react";
import { Info, Lightbulb, type LucideIcon } from "lucide-react";
import type { LabSummary } from "../../api/client";
import { useLab } from "../../api/hooks";
import { ApiError } from "../../api/client";
import { ErrorPanel } from "../discover/ErrorPanel";
import { ResultsSkeleton } from "../discover/Skeleton";
import { cn } from "../../lib/cn";
import { int } from "../../lib/format";

/** Loads the approved aggregate findings and hands them to a page. Shows loading and error states itself. */
export function LabGate({ children }: { children: (data: LabSummary) => ReactNode }) {
  const lab = useLab();
  if (lab.isPending) return <ResultsSkeleton columns={1} announce={false} />;
  if (lab.isError) {
    const unavailable = lab.error instanceof ApiError && lab.error.kind === "unavailable";
    return <ErrorPanel error={lab.error} onRetry={unavailable ? undefined : () => lab.refetch()} />;
  }
  return <>{children(lab.data)}</>;
}

/** A page section. A thin rule with one gold node on it marks where a new section starts, the same thread as the navigation. */
export function Section({ id, title, lead, children }: { id: string; title: string; lead?: ReactNode; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="group relative mt-12 border-t border-line pt-9 first:mt-0 first:border-t-0 first:pt-0">
      <span aria-hidden="true" className="absolute -top-[5px] left-0 size-2.5 rounded-full bg-gold-fill group-first:hidden" />
      <h2 id={id} className="text-3xl font-semibold">
        {title}
      </h2>
      {lead && <div className="mt-3 max-w-[44rem] text-lg text-muted">{lead}</div>}
      <div className="mt-6 space-y-6">{children}</div>
    </section>
  );
}

/** A note. Gold edge for information, rose edge for a caution. */
export function Callout({ title, children, tone = "info" }: { title: string; children: ReactNode; tone?: "info" | "caution" }) {
  const caution = tone === "caution";
  return (
    <div role="note" className={cn("glass flex max-w-[48rem] gap-3 border-l-4 p-4 sm:p-5", caution ? "border-l-accent" : "border-l-[var(--thread)]")}>
      <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-glass bg-bg">
        <Info aria-hidden="true" className={cn("size-5", caution ? "text-accent" : "text-gold")} />
      </span>
      <div>
        <p className="font-semibold text-heading">{title}</p>
        <div className="mt-1 space-y-2">{children}</div>
      </div>
    </div>
  );
}

/** The few things to take away from a page, stated from the same verified results shown below. */
export function AtAGlance({ items, title = "In short" }: { items: ReactNode[]; title?: string }) {
  return (
    <section aria-label={title} className="glass max-w-[52rem] border-l-4 border-l-[var(--thread)] p-4 sm:p-5">
      <h2 className="flex items-center gap-2 font-display text-xl font-semibold text-heading">
        <Lightbulb aria-hidden="true" className="size-5 text-gold" />
        {title}
      </h2>
      <ul className="mt-3 space-y-2">
        {items.map((item, i) => (
          <li key={i} className="flex gap-3">
            <span aria-hidden="true" className="mt-2 size-2 shrink-0 rounded-full bg-gold-fill" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function Stat({ value, label, hint, icon: Icon }: { value: string; label: string; hint?: string; icon?: LucideIcon }) {
  return (
    <div className="glass p-4 sm:p-5">
      <dt className="flex items-center gap-2 font-medium text-muted">
        {Icon && <Icon aria-hidden="true" className="size-4 shrink-0 text-gold" />}
        {label}
      </dt>
      <dd className="mt-1">
        <span className="block font-display text-3xl font-semibold tabular-nums text-heading">{value}</span>
        {hint && <span className="mt-1 block text-sm text-muted">{hint}</span>}
      </dd>
    </div>
  );
}

export function Stats({ children }: { children: ReactNode }) {
  return <dl className="grid grid-cols-[repeat(auto-fit,minmax(12rem,1fr))] gap-3">{children}</dl>;
}

export function Words({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="glass p-4">
      <dt className="font-semibold text-gold">{term}</dt>
      <dd className="mt-1 text-muted">{children}</dd>
    </div>
  );
}

export const FIELD_NAMES: Record<string, string> = {
  smokes: "Smoking",
  drugs: "Drug use",
  diet_type: "Diet",
  education_level: "Education",
  job: "Work",
  offspring: "Children",
  pets: "Pets",
  status: "Relationship status",
  body_type: "Body type",
  drinks_level: "Drinking",
  age_band: "Age group",
  sex: "Sex",
};

/** Turns a one hot column name such as "body_type_athletic" into "body type: athletic". The field name itself contains
 *  underscores, so the field is found first and only the join after it becomes a colon. */
export function answerLabel(answer: string): string {
  const field = Object.keys(FIELD_NAMES).find((key) => answer.startsWith(`${key}_`));
  if (!field) return answer;
  return `${field.replaceAll("_", " ")}: ${answer.slice(field.length + 1)}`;
}

export const countOf = (n: number) => int(n);
