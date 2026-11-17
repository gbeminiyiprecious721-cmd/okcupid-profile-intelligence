import { Brain, GitCompare, Type } from "lucide-react";
import { useState } from "react";
import type { Method, MethodResult, SimilarResponse } from "../../api/client";
import { Chip } from "../../components/ui/Button";
import { cn } from "../../lib/cn";
import { OverlapMark } from "./OverlapMark";
import { ResultCard } from "./ResultCard";

export const METHOD_NAMES = { embeddings: "Sentence embeddings", tfidf: "TF-IDF" } as const;
const METHOD_HELP = {
  embeddings: "Ranked by similar meaning.",
  tfidf: "Ranked by shared, distinctive words.",
} as const;

const METHOD_ICON = { embeddings: Brain, tfidf: Type } as const;
function MethodIcon({ method, className }: { method: "embeddings" | "tfidf"; className: string }) {
  const Icon = METHOD_ICON[method];
  return <Icon aria-hidden="true" className={className} />;
}

// Words are gold, meaning is rose. The colour only repeats what the heading and icon already say.
const METHOD_TONE = { embeddings: "border-accent/60", tfidf: "border-thread/60" } as const;

type Shared = {
  answersGiven: boolean;
  selected: { id: string; handle: string }[];
  onOpen: (id: string, from: HTMLElement) => void;
  onToggle: (id: string, handle: string) => void;
};

function Column({ result, shared, inBoth }: { result: MethodResult; shared: Shared; inBoth: Set<string> }) {
  const name = METHOD_NAMES[result.method];
  const Icon = METHOD_ICON[result.method];
  return (
    <section aria-labelledby={`col-${result.method}`} data-thread-target={result.method} className="relative border-l-2 border-thread/50 pl-6">
      <div className={cn("glass mb-4 flex items-center gap-3 border-l-4 p-4", METHOD_TONE[result.method])}>
        <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-glass bg-bg text-gold">
          <Icon aria-hidden="true" className="size-5" />
        </span>
        <div>
          <h2 id={`col-${result.method}`} className="text-2xl font-semibold">
            {name}
          </h2>
          <p className="text-sm text-muted">
            {METHOD_HELP[result.method]} {result.score_name}.
          </p>
        </div>
      </div>
      {result.neighbours.length === 0 ? (
        <p role="status" className="rounded-[14px] border border-dashed border-control p-5 text-muted">
          {result.note ?? "No profiles were found."}
        </p>
      ) : (
        <ol className="space-y-4" aria-label={`Similar profiles by ${name}`}>
          {result.neighbours.map((n) => (
            <ResultCard
              key={n.profile_id}
              neighbour={n}
              method={result.method}
              methodLabel={result.score_name}
              answersGiven={shared.answersGiven}
              selected={shared.selected.some((s) => s.id === n.profile_id)}
              selectionFull={shared.selected.length >= 2}
              inBothLists={inBoth.has(n.profile_id)}
              onOpen={shared.onOpen}
              onToggle={shared.onToggle}
            />
          ))}
        </ol>
      )}
    </section>
  );
}

export function Results({ response, method, shared }: { response: SimilarResponse; method: Method; shared: Shared }) {
  const [active, setActive] = useState<"embeddings" | "tfidf">("embeddings");
  const both = response.results.length === 2;
  const handles = new Map(response.results.flatMap((r) => r.neighbours.map((n) => [n.profile_id, n.display_handle] as const)));
  const { input, comparison } = response;
  const inBoth = new Set(both && comparison ? comparison.in_both : []);

  return (
    <div className="space-y-6">
      <div className="glass p-4" data-testid="input-summary">
        <p className="text-muted">
          Compared <strong className="font-semibold text-heading">{input.words_used} words</strong> against {response.pool.size} fictional profiles.
          {input.themes_detected.length > 0 && <> Themes found in your text: {input.themes_detected.join(", ")}.</>}
        </p>
        {Object.keys(input.personal_details_removed).length > 0 && (
          <p className="mt-1" role="note">
            Removed before searching:{" "}
            {Object.entries(input.personal_details_removed)
              .map(([kind, n]) => `${n} ${kind}${n > 1 ? "s" : ""}`)
              .join(", ")}
            .
          </p>
        )}
        {!shared.answersGiven && <p className="mt-1 text-muted">You gave no lifestyle answers, so no lifestyle comparison is shown.</p>}
      </div>

      {both && comparison && (
        <div className="glass flex flex-wrap items-center gap-x-6 gap-y-3 p-4 sm:p-5" data-testid="comparison">
          <OverlapMark overlap={comparison.overlap_count} total={response.results[0].neighbours.length} />
          <div className="min-w-0 flex-1 basis-60">
            <h2 className="flex items-center gap-2 text-xl font-semibold">
              <GitCompare aria-hidden="true" className="size-5 shrink-0 text-gold" />
              Where the two methods agree
            </h2>
            <p className="mt-1" data-testid="overlap">
              {comparison.overlap_count === 0
                ? "The two lists have no profile in common."
                : `${comparison.overlap_count} of ${response.results[0].neighbours.length} profiles appear in both lists.`}
            </p>
            {comparison.in_both.length > 0 && (
              <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Profiles in both lists">
                {comparison.in_both.map((id) => (
                  <li key={id}>
                    <Chip>{handles.get(id) ?? id}</Chip>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-sm text-muted">{comparison.note}</p>
          </div>
        </div>
      )}

      {both && (
        <div role="tablist" aria-label="Choose a method" className="flex gap-1 rounded-full border border-glass bg-card p-1 2xl:hidden">
          {response.results.map((r) => (
            <button
              key={r.method}
              role="tab"
              id={`tab-${r.method}`}
              aria-selected={active === r.method}
              aria-controls={`panel-${r.method}`}
              onClick={() => setActive(r.method)}
              className={cn(
                "inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full px-2 font-medium transition-colors motion-reduce:transition-none",
                active === r.method ? "bg-gold-fill text-on-gold" : "text-fg hover:bg-bg",
              )}
            >
              <MethodIcon method={r.method} className="size-4 shrink-0" />
              {METHOD_NAMES[r.method]}
            </button>
          ))}
        </div>
      )}

      <div className={cn("grid gap-8", both && "2xl:grid-cols-2")}>
        {response.results.map((r) => (
          <div
            key={r.method}
            id={`panel-${r.method}`}
            role={both ? "tabpanel" : undefined}
            aria-labelledby={both ? `tab-${r.method}` : undefined}
            className={cn(both && active !== r.method && "hidden 2xl:block")}
          >
            <Column result={r} shared={shared} inBoth={inBoth} />
          </div>
        ))}
      </div>
      <p className="text-sm text-muted">
        {response.notice} {method === "both" ? "" : "Run the other method to see how the lists differ."}
      </p>
    </div>
  );
}
