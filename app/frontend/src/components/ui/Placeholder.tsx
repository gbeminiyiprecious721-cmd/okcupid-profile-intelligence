import type { ReactNode } from "react";
import { Construction } from "lucide-react";

/** Every page that does not yet hold real content says so, in words, at the top. */
export function PlaceholderNotice({ children }: { children: ReactNode }) {
  return (
    <div role="note" className="mb-8 flex max-w-[44rem] gap-3 rounded-[14px] border border-control bg-surface p-4">
      <Construction aria-hidden="true" className="mt-1 size-5 shrink-0 text-gold" />
      <p>
        <strong className="font-semibold text-heading">Placeholder.</strong> {children}
      </p>
    </div>
  );
}

/** A dashed outline that marks where planned content will go. It shows no data. */
export function PlannedArea({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={`${title}, planned`} className="rounded-[14px] border border-dashed border-control p-5">
      <h2 className="text-xl font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-muted">Planned</p>
      <div className="mt-3 text-muted">{children}</div>
    </section>
  );
}
