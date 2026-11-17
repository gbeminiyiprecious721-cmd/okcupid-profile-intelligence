import { Globe, Laptop } from "lucide-react";
import { useHealth, useMeta } from "../../api/hooks";
import { cn } from "../../lib/cn";

/** Public or local. The two modes are labelled in words and icons, never by colour alone. */
export function ModeBadge() {
  const { data, isError } = useMeta();
  if (isError) return <span className="rounded-full border border-control px-3 py-1 text-sm text-muted">Mode unknown</span>;
  if (!data) return <span className="rounded-full border border-control px-3 py-1 text-sm text-muted">Checking mode</span>;
  const local = data.mode === "local";
  const Icon = local ? Laptop : Globe;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium",
        local ? "border-accent bg-accent-soft text-accent" : "border-control text-fg",
      )}
    >
      <Icon aria-hidden="true" className="size-4" />
      {local ? "Local mode" : "Public mode"}
    </span>
  );
}

export function ServiceStatus() {
  const { data, isError, isPending } = useHealth();
  const state = isError ? "offline" : isPending || !data ? "checking" : "online";
  const label = { online: "Service online", offline: "Service offline", checking: "Checking service" }[state];
  return (
    <span role="status" className="inline-flex items-center gap-2 text-sm text-muted">
      <span
        aria-hidden="true"
        className={cn("size-2.5 rounded-full", state === "online" && "bg-teal", state === "offline" && "bg-accent", state === "checking" && "bg-control")}
      />
      <span className="hidden sm:inline">{label}</span>
      <span className="sr-only sm:hidden">{label}</span>
    </span>
  );
}
