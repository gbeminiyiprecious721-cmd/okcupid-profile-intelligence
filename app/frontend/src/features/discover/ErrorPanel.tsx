import { CloudOff, TriangleAlert } from "lucide-react";
import { ApiError } from "../../api/client";
import { Button } from "../../components/ui/Button";

const TITLES: Record<string, string> = {
  offline: "The service did not answer",
  timeout: "The search took too long",
  too_large: "That profile is too long",
  unavailable: "Discovery is not available",
  local_only: "This feature runs in local mode only",
  rate_limited: "Too many requests",
  not_found: "That profile could not be found",
  invalid: "That profile could not be searched",
  server: "Something went wrong on the server",
  unknown: "The search did not finish",
};
const HELP: Record<string, string> = {
  offline: "Check your connection and try again. What you wrote is still in the form.",
  timeout: "Try again in a moment. What you wrote is still in the form.",
  too_large: "Shorten the text and search again.",
  unavailable: "The search files are not loaded on the server, so nothing can be searched yet.",
  server: "Nothing you wrote was stored. Try again in a moment.",
  rate_limited: "The service limits how fast it can be used. Wait a little, then try again. What you wrote is still in the form.",
};

export function ErrorPanel({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const api = error instanceof ApiError ? error : new ApiError("Something unexpected happened.");
  const Icon = api.kind === "offline" || api.kind === "timeout" ? CloudOff : TriangleAlert;
  return (
    <div role="alert" className="rounded-[14px] border border-accent bg-accent-soft p-5">
      <div className="flex gap-3">
        <Icon aria-hidden="true" className="mt-1 size-5 shrink-0 text-accent" />
        <div>
          <h2 className="text-xl font-semibold">{TITLES[api.kind] ?? TITLES.unknown}</h2>
          <p className="mt-1">{api.message}</p>
          {HELP[api.kind] && <p className="mt-1 text-muted">{HELP[api.kind]}</p>}
          {onRetry && api.kind !== "unavailable" && api.kind !== "invalid" && api.kind !== "too_large" && (
            <Button variant="secondary" className="mt-4" onClick={onRetry}>
              Try again
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
