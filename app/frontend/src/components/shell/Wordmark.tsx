import { Link } from "react-router";
import { SITE_NAME } from "../../lib/nav";
import { ThreadMark } from "../ui/Thread";

export function Wordmark({ className = "", compact = false }: { className?: string; compact?: boolean }) {
  return (
    <Link to="/" className={`inline-flex items-center gap-2 font-display text-xl font-semibold text-heading no-underline ${className}`}>
      <ThreadMark className="size-7" />
      <span className={compact ? "max-sm:sr-only" : undefined}>{SITE_NAME}</span>
    </Link>
  );
}
