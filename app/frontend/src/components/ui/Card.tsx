import type { LucideIcon } from "lucide-react";
import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";

/** A round gold tinted badge that holds an icon. The icon is decoration, so it is hidden from assistive technology. */
export function IconBadge({ icon: Icon, className = "" }: { icon: LucideIcon; className?: string }) {
  return (
    <span className={`inline-flex size-12 shrink-0 items-center justify-center rounded-full border border-glass bg-bg text-gold ${className}`}>
      <Icon aria-hidden="true" className="size-6" />
    </span>
  );
}

/** One research figure, as an item of a list. In the markup the label comes first, so a screen reader hears what the
 *  number is and then the number. On screen the number leads, then the label, then the note (set by the order classes). */
export function StatCard({ icon, label, value, hint }: { icon: LucideIcon; label: string; value: string; hint?: string }) {
  return (
    <li className="glass flex items-center gap-3.5 p-4 sm:p-5">
      <IconBadge icon={icon} className="size-11" />
      <div className="flex min-w-0 flex-col">
        <p className="order-2 font-medium text-muted">{label}</p>
        <p className="order-1 m-0 whitespace-nowrap font-display text-[1.7rem] font-semibold tabular-nums text-heading">{value}</p>
        {hint && <p className="order-3 m-0 text-sm text-muted">{hint}</p>}
      </div>
    </li>
  );
}

/** A whole card that is one link. Lifts and glows on hover, and shows the normal focus ring from the keyboard. */
export function FeatureCard({ to, icon, title, children }: { to: string; icon: LucideIcon; title: string; children: ReactNode }) {
  return (
    <Link to={to} className="glass glass-hover group flex h-full flex-col gap-4 p-5 text-fg no-underline sm:p-6">
      <IconBadge icon={icon} />
      <div>
        <h3 className="text-2xl font-semibold">{title}</h3>
        <p className="mt-2 text-muted">{children}</p>
      </div>
      <span className="mt-auto self-end">
        <span className="inline-flex size-9 items-center justify-center rounded-full bg-primary text-on-primary">
          <ArrowRight aria-hidden="true" className="size-5 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" />
        </span>
      </span>
    </Link>
  );
}
