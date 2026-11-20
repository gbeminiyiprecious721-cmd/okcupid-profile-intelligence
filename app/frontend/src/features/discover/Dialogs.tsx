import * as Dialog from "@radix-ui/react-dialog";
import { useQueries } from "@tanstack/react-query";
import { Check, Plus, X } from "lucide-react";
import type { ReactNode, RefObject } from "react";
import { getProfile, type Meta, type ProfileDetail, type SimilarResponse } from "../../api/client";
import { useProfile } from "../../api/hooks";
import { Button, Chip } from "../../components/ui/Button";
import { cn } from "../../lib/cn";
import { FIELD_ORDER, fieldLabel } from "../../lib/labels";
import { NO_KEYWORDS_MESSAGE, sharedKeywords } from "../../lib/sharedWords";
import { formatShare, splitByEmphasis } from "../../lib/weighting";
import { ErrorPanel } from "./ErrorPanel";
import { METHOD_NAMES } from "./Results";

function Shell({ open, onClose, title, description, wide, returnTo, children }: { open: boolean; onClose: () => void; title: string; description: string; wide?: boolean; returnTo?: RefObject<HTMLElement | null>; children: ReactNode }) {
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="drawer-overlay fixed inset-0 z-40 bg-[#1a0e1e]/70 backdrop-blur-[2px]" />
        <Dialog.Content
          onCloseAutoFocus={(event) => {
            // Put focus back on the control that opened the dialog, even though it was not a Radix trigger.
            if (returnTo?.current?.isConnected) {
              event.preventDefault();
              returnTo.current.focus();
            }
          }}
          className={cn(
            "dialog-content fixed left-1/2 top-1/2 z-50 max-h-[90dvh] w-[calc(100vw-1.5rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[18px] border border-glass bg-bg p-5 shadow-[inset_0_3px_0_var(--gold-fill),0_28px_70px_-24px_rgb(0_0_0/0.65)] sm:p-7",
            wide ? "max-w-5xl" : "max-w-2xl",
          )}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="font-display text-3xl font-semibold text-heading">{title}</Dialog.Title>
              <Dialog.Description className="mt-1 text-muted">{description}</Dialog.Description>
            </div>
            <Dialog.Close aria-label="Close" className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-control hover:bg-surface">
              <X aria-hidden="true" className="size-5" />
            </Dialog.Close>
          </div>
          <div className="mt-5">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Lifestyle({ profile, highlight = [] }: { profile: ProfileDetail; highlight?: string[] }) {
  const fields = FIELD_ORDER.filter((f) => profile.lifestyle[f]);
  if (fields.length === 0) return <p className="text-muted">No lifestyle answers.</p>;
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
      {fields.map((f) => (
        <div key={f} className="contents">
          <dt className="text-muted">{fieldLabel(f)}</dt>
          <dd className={cn(highlight.includes(f) && "font-semibold text-accent")}>
            {profile.lifestyle[f]}
            {highlight.includes(f) && <span className="sr-only"> (shared)</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function Loading({ label }: { label: string }) {
  return (
    <div role="status" aria-busy="true" aria-label={label} className="space-y-3">
      <span className="sr-only">{label}</span>
      {[0, 1, 2].map((i) => (
        <div key={i} className={cn("h-4 rounded bg-line motion-safe:animate-pulse", i === 2 ? "w-1/2" : "w-full")} />
      ))}
    </div>
  );
}

export function ProfileDialog({ id, onClose, selected, onToggle, returnTo }: { id: string | null; onClose: () => void; selected: boolean; onToggle: (id: string, handle: string) => void; returnTo: RefObject<HTMLElement | null> }) {
  const query = useProfile(id);
  const profile = query.data;
  return (
    <Shell open={id !== null} onClose={onClose} returnTo={returnTo} title={profile?.display_handle ?? "Profile"} description="A fictional profile written for this demonstration. It is not a real person.">
      {query.isPending && <Loading label="Loading the profile" />}
      {query.isError && <ErrorPanel error={query.error} onRetry={() => query.refetch()} />}
      {profile && (
        <div className="space-y-5">
          <p className="whitespace-pre-line leading-relaxed" data-testid="profile-text">
            {profile.text}
          </p>
          {profile.themes.length > 0 && (
            <ul className="flex flex-wrap gap-1.5" aria-label="Themes">
              {profile.themes.map((t) => (
                <li key={t}>
                  <Chip>{t}</Chip>
                </li>
              ))}
            </ul>
          )}
          <div>
            <h3 className="mb-2 text-lg font-semibold">Lifestyle answers</h3>
            <Lifestyle profile={profile} />
          </div>
          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" aria-pressed={selected} className={cn("active:translate-y-px", selected && "border-gold text-gold")} onClick={() => onToggle(profile.profile_id, profile.display_handle)}>
              {selected ? <Check aria-hidden="true" className="size-4" /> : <Plus aria-hidden="true" className="size-4" />}
              {selected ? "Selected for comparison" : "Add to comparison"}
            </Button>
          </div>
        </div>
      )}
    </Shell>
  );
}

export function CompareDialog({ ids, onClose, meta, response, returnTo }: { ids: string[] | null; onClose: () => void; meta: Meta; response: SimilarResponse | undefined; returnTo: RefObject<HTMLElement | null> }) {
  const open = ids !== null && ids.length === 2;
  const queries = useQueries({
    queries: (ids ?? []).map((id) => ({ queryKey: ["profile", id], queryFn: () => getProfile(id), retry: 1, staleTime: Infinity, enabled: open })),
  });
  const [a, b] = queries.map((q) => q.data);
  const failed = queries.find((q) => q.isError);
  const ready = a && b;

  const sharedFields = ready ? FIELD_ORDER.filter((f) => a.lifestyle[f] && a.lifestyle[f] === b.lifestyle[f]) : [];
  const sharedAnswers = sharedFields.map((f) => ({ field: f, value: a!.lifestyle[f] as string, share_of_pool: meta.answer_shares?.[f]?.[a!.lifestyle[f] as string] ?? 1 }));
  const { informative, common } = splitByEmphasis(sharedAnswers);
  const sharedThemes = ready ? a.themes.filter((t) => b.themes.includes(t)) : [];
  const keywords = ready ? sharedKeywords(a.text, b.text) : [];

  const placement = (id: string) =>
    (response?.results ?? []).map((r) => {
      const hit = r.neighbours.find((n) => n.profile_id === id);
      return hit ? `rank ${hit.rank} by ${METHOD_NAMES[r.method]}, score ${hit.score.toFixed(3)}` : `not in the ${METHOD_NAMES[r.method]} list`;
    });

  return (
    <Shell open={open} onClose={onClose} returnTo={returnTo} wide title="Compare two profiles" description="Both are fictional. This shows what the two profiles have in common. It does not score them against each other.">
      {queries.some((q) => q.isPending) && !failed && <Loading label="Loading both profiles" />}
      {failed && <ErrorPanel error={failed.error} onRetry={() => queries.forEach((q) => q.isError && q.refetch())} />}
      {ready && (
        <div className="space-y-6">
          <section aria-label="What they have in common" className="glass p-4 sm:p-5" data-testid="in-common">
            <h3 className="text-xl font-semibold">What they have in common</h3>
            <div className="mt-3 space-y-3 text-[0.9375rem]">
              <p>
                <span className="font-medium text-heading">Themes: </span>
                {sharedThemes.length ? sharedThemes.map((t) => <Chip key={t} tone="shared">{t}</Chip>) : <span className="text-muted">none in common</span>}
              </p>
              <div>
                <p className="font-medium text-heading">Keywords in both texts</p>
                {keywords.length === 0 ? (
                  <p className="text-muted">{NO_KEYWORDS_MESSAGE}</p>
                ) : (
                  <ul className="mt-1 space-y-1.5" aria-label="Shared keywords">
                    {keywords.map((k) => (
                      <li key={k.term}>
                        <Chip tone="shared">{k.term}</Chip>
                        <span className="ml-2 text-sm text-muted">
                          “{k.contextA}” and “{k.contextB}”
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <p className="font-medium text-heading">Lifestyle answers in common</p>
                {informative.length === 0 && common.length === 0 && <p className="text-muted">None.</p>}
                <ul className="space-y-0.5">
                  {informative.map((x) => (
                    <li key={x.field}>
                      <span className="font-medium">{fieldLabel(x.field)}:</span> {x.value} <span className="text-muted">(shared by {formatShare(x.share_of_pool)} of profiles)</span>
                    </li>
                  ))}
                </ul>
                {common.length > 0 && (
                  <p className="mt-1 text-sm text-muted">
                    Very common, so not telling: {common.map((x) => `${fieldLabel(x.field).toLowerCase()} ${x.value} (${formatShare(x.share_of_pool)})`).join(", ")}.
                  </p>
                )}
              </div>
            </div>
          </section>
          <div className="grid gap-5 md:grid-cols-2">
            {[a, b].map((p) => (
              <section key={p.profile_id} aria-label={p.display_handle} className="rounded-[18px] border border-line bg-card p-4 sm:p-5">
                <h3 className="text-2xl font-semibold">{p.display_handle}</h3>
                {placement(p.profile_id).length > 0 && <p className="mt-1 text-sm text-muted">In your search: {placement(p.profile_id).join("; ")}.</p>}
                <p className="mt-3 whitespace-pre-line leading-relaxed">{p.text}</p>
                <div className="mt-4">
                  <Lifestyle profile={p} highlight={sharedFields} />
                </div>
              </section>
            ))}
          </div>
        </div>
      )}
    </Shell>
  );
}
