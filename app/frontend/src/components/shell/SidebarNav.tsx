import { NavLink } from "react-router";
import { useMeta } from "../../api/hooks";
import { navGroups } from "../../lib/nav";
import { cn } from "../../lib/cn";

/** Page links drawn along a gold thread. The active page is a filled node on the thread. */
export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const { data } = useMeta();
  return (
    <nav aria-label="Main">
      {navGroups(data?.mode).map((group) => (
        <div key={group.label} className="mb-6">
          <p className="mb-2 px-3 text-sm font-semibold text-muted">{group.label}</p>
          <ul className="ml-4 border-l-2 border-thread/60">
            {group.items.map((item) => (
              <li key={item.to} className="relative">
                <NavLink
                  to={item.to}
                  end={item.end}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    cn(
                      "flex min-h-10 items-center gap-2.5 rounded-r-lg border border-transparent py-2 pr-3 pl-5 text-[0.95rem] no-underline transition-colors motion-reduce:transition-none",
                      isActive ? "border-glass bg-card font-semibold text-heading shadow-[0_6px_18px_-10px_var(--glow)]" : "text-fg hover:bg-card",
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      <span
                        aria-hidden="true"
                        className={cn(
                          "absolute top-1/2 -left-[7px] size-3 -translate-y-1/2 rounded-full border-2 border-thread transition-transform motion-reduce:transition-none",
                          isActive ? "scale-125 bg-thread" : "bg-surface",
                        )}
                      />
                      <item.icon aria-hidden="true" className={cn("size-[1.1rem] shrink-0", isActive ? "text-gold" : "text-muted")} />
                      {item.label}
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
