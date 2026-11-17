import { Check, Link2, Plus } from "lucide-react";
import type { Neighbour } from "../../api/client";
import { Button } from "../../components/ui/Button";
import { cn } from "../../lib/cn";
import { Explanation } from "./Explanation";

type Props = {
  neighbour: Neighbour;
  method: "embeddings" | "tfidf";
  methodLabel: string;
  answersGiven: boolean;
  selected: boolean;
  selectionFull: boolean;
  inBothLists?: boolean;
  onOpen: (id: string, from: HTMLElement) => void;
  onToggle: (id: string, handle: string) => void;
};

export function ResultCard({ neighbour, method, methodLabel, answersGiven, selected, selectionFull, inBothLists = false, onOpen, onToggle }: Props) {
  const blocked = selectionFull && !selected;
  return (
    <li
      className={cn("result-in glass relative p-5 transition-[border-color,box-shadow] motion-reduce:transition-none", selected && "border-gold shadow-[0_14px_34px_-16px_var(--glow)]")}
      style={{ animationDelay: `${600 + neighbour.rank * 70}ms` }}
      data-testid={`result-${method}-${neighbour.rank}`}
    >
      <span aria-hidden="true" className="absolute -left-[2.05rem] top-6 size-3.5 rounded-full border-2 border-thread bg-bg" />
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 flex-1 basis-44 items-start gap-3">
          <p className="flex size-11 shrink-0 flex-col items-center justify-center rounded-full bg-gold-fill text-on-gold">
            <span className="sr-only">Rank </span>
            <span className="font-display text-lg font-semibold leading-none">#{neighbour.rank}</span>
          </p>
          <div className="min-w-0">
            <p className="text-sm text-muted">Fictional profile</p>
            <h3 className="mt-0.5 text-2xl font-semibold">{neighbour.display_handle}</h3>
            {inBothLists && (
              <p className="mt-1 inline-flex items-center gap-1.5 rounded-full border border-glass bg-bg px-2.5 py-0.5 text-sm text-gold">
                <Link2 aria-hidden="true" className="size-3.5" />
                Found by both methods
              </p>
            )}
          </div>
        </div>
        <p className="shrink-0 rounded-xl border border-glass bg-bg px-3 py-1.5 text-right">
          <span className="block text-2xl font-semibold tabular-nums text-heading">{neighbour.score.toFixed(3)}</span>
          <span className="block text-xs text-muted">
            similarity<span className="sr-only">, {methodLabel}</span>
          </span>
        </p>
      </div>

      <Explanation neighbour={neighbour} method={method} answersGiven={answersGiven} />

      <div className="mt-5 flex flex-wrap gap-2">
        <Button variant="secondary" className="active:translate-y-px" onClick={(e) => onOpen(neighbour.profile_id, e.currentTarget)} aria-label={`View profile ${neighbour.display_handle}`}>
          View profile
        </Button>
        <Button
          variant="secondary"
          aria-pressed={selected}
          disabled={blocked}
          onClick={() => onToggle(neighbour.profile_id, neighbour.display_handle)}
          aria-label={`Compare ${neighbour.display_handle}`}
          title={blocked ? "Two profiles are already selected. Remove one first." : undefined}
          className={cn("active:translate-y-px", selected && "border-gold bg-bg text-gold")}
        >
          {selected ? <Check aria-hidden="true" className="size-4" /> : <Plus aria-hidden="true" className="size-4" />}
          Compare
        </Button>
      </div>
    </li>
  );
}
