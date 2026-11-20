import { ListChecks, Tag, Type } from "lucide-react";
import type { ReactNode } from "react";
import type { Neighbour } from "../../api/client";
import { Chip } from "../../components/ui/Button";
import { fieldLabel } from "../../lib/labels";
import { formatShare, splitByEmphasis } from "../../lib/weighting";

function Block({ icon: Icon, title, children }: { icon: typeof Type; title: string; children: ReactNode }) {
  return (
    <div className="p-3">
      <p className="flex items-center gap-2 font-medium text-heading">
        <Icon aria-hidden="true" className="size-4 shrink-0 text-gold" />
        {title}
      </p>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

/**
 * Why a profile was returned. Three kinds of evidence, each from the API:
 * shared words (TF-IDF weights), shared themes, and shared lifestyle answers.
 * Lifestyle answers that most profiles give are set aside, using the weighting in lib/weighting.ts.
 */
export function Explanation({ neighbour, method, answersGiven }: { neighbour: Neighbour; method: "embeddings" | "tfidf"; answersGiven: boolean }) {
  const { informative, common } = splitByEmphasis(neighbour.shared_answers);
  const otherThemes = neighbour.themes.filter((t) => !neighbour.shared_themes.includes(t));
  return (
    <div className="mt-4 divide-y divide-line rounded-xl border border-line bg-bg text-[0.9375rem]">
      <Block icon={Type} title="Words you both use">
        {neighbour.shared_terms.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5" aria-label="Shared words">
            {neighbour.shared_terms.map((term) => (
              <li key={term}>
                <Chip tone="shared">{term}</Chip>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted">{method === "embeddings" ? "None in common. This match comes from similar meaning, not shared wording." : "No shared words."}</p>
        )}
      </Block>

      <Block icon={Tag} title="Themes">
        {neighbour.themes.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5" aria-label="Themes of this profile">
            {neighbour.shared_themes.map((theme) => (
              <li key={theme}>
                <Chip tone="shared">{theme}, shared</Chip>
              </li>
            ))}
            {otherThemes.map((theme) => (
              <li key={theme}>
                <Chip>{theme}</Chip>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted">No theme stands out.</p>
        )}
      </Block>

      {answersGiven && (
        <Block icon={ListChecks} title="Lifestyle answers you share">
          {informative.length === 0 && common.length === 0 && <p className="text-muted">None. Lifestyle answers do not affect the ranking.</p>}
          {informative.length > 0 && (
            <ul className="space-y-0.5">
              {informative.map((answer) => (
                <li key={answer.field}>
                  <span className="font-medium">{fieldLabel(answer.field)}:</span> {answer.value}{" "}
                  <span className="text-muted">
                    (shared by {formatShare(answer.share_of_pool)} of profiles)
                  </span>
                </li>
              ))}
            </ul>
          )}
          {common.length > 0 && (
            <p className="mt-1 text-sm text-muted">
              Also alike, but very common and so not telling:{" "}
              {common.map((a) => `${fieldLabel(a.field).toLowerCase()} ${a.value} (${formatShare(a.share_of_pool)})`).join(", ")}.
            </p>
          )}
        </Block>
      )}
    </div>
  );
}
