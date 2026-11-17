import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { IconBadge } from "./Card";
import { ThreadOrnament } from "./Thread";

export function PageHeader({ title, lead, icon }: { title: string; lead: ReactNode; icon?: LucideIcon }) {
  return (
    <header className="mb-10 max-w-[44rem]">
      <div className="flex items-center gap-4">
        {icon && (
          <span className="hidden sm:inline-flex">
            <IconBadge icon={icon} className="size-14" />
          </span>
        )}
        <h1 tabIndex={-1} className="text-[2.25rem] font-semibold sm:text-5xl">
          {title}
        </h1>
      </div>
      <p className="mt-4 text-lg text-muted">{lead}</p>
      <ThreadOrnament />
    </header>
  );
}
