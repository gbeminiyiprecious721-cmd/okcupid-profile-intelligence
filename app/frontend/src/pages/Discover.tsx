import { useEffect, useRef, useState } from "react";
import { ApiError, type SimilarRequest } from "../api/client";
import { useExamples, useMeta, useSimilarSearch } from "../api/hooks";
import { PageHeader } from "../components/ui/PageHeader";
import { ThreadFan } from "../components/ui/Thread";
import { CompareTray } from "../features/discover/CompareTray";
import { CompareDialog, ProfileDialog } from "../features/discover/Dialogs";
import { ErrorPanel } from "../features/discover/ErrorPanel";
import { Intro } from "../features/discover/Intro";
import { ProfileForm } from "../features/discover/ProfileForm";
import { Results } from "../features/discover/Results";
import { ResultsSkeleton } from "../features/discover/Skeleton";
import { ThreadLayer } from "../features/discover/ThreadLayer";

type Pick = { id: string; handle: string };
const TEXT_ERRORS = new Set(["no_usable_text", "text_too_short"]);

export default function Discover() {
  const meta = useMeta();
  const enabled = meta.data?.features.discovery === true;
  const examples = useExamples(enabled);
  const search = useSimilarSearch();
  const [request, setRequest] = useState<SimilarRequest | null>(null);
  const [picked, setPicked] = useState<Pick[]>([]);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [comparing, setComparing] = useState<string[] | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const resultsArea = useRef<HTMLDivElement>(null);
  const source = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  // The control that was pressed, taken from the event. Safari does not focus a button when it is clicked, so
  // document.activeElement would be the page body there and focus could not return to the button.
  const openProfile = (id: string, from: HTMLElement) => {
    opener.current = from;
    setProfileId(id);
  };
  const openCompare = (from: HTMLElement) => {
    opener.current = from;
    setComparing(picked.map((p) => p.id));
  };

  // On a phone the results sit below the form, out of sight. When a search finishes, bring them into view.
  // Nothing takes focus, and the live region still announces the result. Reduced motion gets an instant jump.
  const finished = search.data ? String(search.submittedAt) : null;
  useEffect(() => {
    if (!finished || typeof window.matchMedia !== "function") return;
    if (!window.matchMedia("(max-width: 1023px)").matches) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    resultsArea.current?.scrollIntoView?.({ behavior: reduced ? "auto" : "smooth", block: "start" });
  }, [finished]);

  function run(next: SimilarRequest) {
    setRequest(next);
    setPicked([]);
    search.mutate(next);
  }

  function toggle(id: string, handle: string) {
    setPicked((current) => {
      if (current.some((p) => p.id === id)) return current.filter((p) => p.id !== id);
      return current.length >= 2 ? current : [...current, { id, handle }];
    });
  }

  const header = <PageHeader title="Profile Discovery" lead="Write a fictional profile and see which profiles read most like it." />;

  if (meta.isPending) {
    // A full screen of height, so the footer is never visible while the page loads and then pushed out of view by the form.
    return (
      <div className="min-h-dvh">
        {header}
        <ResultsSkeleton columns={1} announce={false} />
      </div>
    );
  }
  if (meta.isError) {
    return (
      <>
        {header}
        <ErrorPanel error={meta.error} onRetry={() => meta.refetch()} />
      </>
    );
  }
  if (!enabled) {
    return (
      <>
        {header}
        <ErrorPanel error={new ApiError("The profile search files are not loaded on the server.", "unavailable", 503)} />
      </>
    );
  }

  const fieldError = search.error instanceof ApiError && search.error.code && TEXT_ERRORS.has(search.error.code) ? search.error.message : null;
  const showError = search.isError && !fieldError;
  const targets = search.data?.results.map((r) => r.method) ?? [];
  const answersGiven = Object.keys(request?.answers ?? {}).length > 0;

  return (
    <div className={picked.length > 0 ? "pb-28" : undefined}>
      {header}
      <Intro />

      <div ref={container} className="relative grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-x-16">
        {search.data && <ThreadLayer container={container} source={source} targets={targets} runKey={String(search.submittedAt)} />}
        <div ref={source} className="relative z-10 self-start">
          <ProfileForm meta={meta.data} examples={examples.data ?? []} examplesLoading={examples.isPending} pending={search.isPending} serverError={fieldError} onSubmit={run} onReset={() => { search.reset(); setRequest(null); setPicked([]); }} />
        </div>
        <div ref={resultsArea} className="relative z-10 min-w-0 scroll-mt-20 lg:pt-4" aria-live="polite">
          {search.isPending && <ResultsSkeleton columns={request?.method === "both" ? 2 : 1} />}
          {showError && <ErrorPanel error={search.error} onRetry={request ? () => run(request) : undefined} />}
          {search.data && !search.isPending && (
            <Results
              response={search.data}
              method={request?.method ?? "both"}
              shared={{ answersGiven, selected: picked, onOpen: openProfile, onToggle: toggle }}
            />
          )}
          {search.isIdle && (
            <div className="glass border-dashed p-6" data-testid="empty-state">
              <h2 className="text-2xl font-semibold">Results appear here</h2>
              <p className="mt-2 max-w-prose text-muted">
                Write a few sentences about an invented person, or start from an example, then choose how to compare. Each result explains itself with shared words, shared themes and lifestyle answers.
              </p>
              <div className="mt-4">
                <ThreadFan />
              </div>
            </div>
          )}
        </div>
      </div>

      <CompareTray selected={picked} onCompare={openCompare} onClear={() => setPicked([])} />
      <ProfileDialog id={profileId} onClose={() => setProfileId(null)} selected={picked.some((p) => p.id === profileId)} onToggle={toggle} returnTo={opener} />
      <CompareDialog ids={comparing} onClose={() => setComparing(null)} meta={meta.data} response={search.data} returnTo={opener} />
    </div>
  );
}
