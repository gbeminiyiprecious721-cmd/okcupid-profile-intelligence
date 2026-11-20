import { CheckCircle2, Info, TriangleAlert } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { PageHeader } from "../components/ui/PageHeader";
import { AtAGlance, Section } from "../features/lab/common";

/** A list inside a card, with a round icon in front of each line. */
function CardList({ title, icon: Icon, tone, children }: { title: string; icon: LucideIcon; tone: "gold" | "rose"; children: ReactNode[] }) {
  return (
    <div className="glass p-5 sm:p-6">
      <h3 className="text-2xl font-semibold">{title}</h3>
      <ul className="mt-4 space-y-3">
        {children.map((item, i) => (
          <li key={i} className="flex gap-3">
            <Icon aria-hidden="true" className={`mt-1 size-5 shrink-0 ${tone === "gold" ? "text-gold" : "text-accent"}`} />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function About() {
  return (
    <>
      <PageHeader
        icon={Info}
        title="Data, ethics and limits"
        lead="Where the data comes from, what was done about privacy, and what this project does not show."
      />
      <div className="max-w-[52rem] space-y-10">
        <AtAGlance
          items={[
            "The data is a historical teaching file of public profiles from 2011 and 2012. This site never shows a real profile.",
            "Orientation, religion and ethnicity are not predicted and not used as inputs.",
            "Similar writing is not compatibility, and the drinking model must never be used to profile anyone.",
          ]}
        />
        <Section id="data" title="The data">
          <div className="glass max-w-[44rem] space-y-3 p-5 sm:p-6">
            <p>
              The analysis uses a teaching file of 59,946 OkCupid profiles, scraped from public profiles in 2012 around San
              Francisco. It appears to be the educational dataset by Albert Y. Kim and Adriana Escobedo-Land (2015). The
              authors had OkCupid&rsquo;s permission to share it for teaching. No source says that the individual users agreed.
            </p>
            <p>The data is not part of this repository and this site never shows a real profile.</p>
          </div>
        </Section>
        <Section id="privacy" title="What was done about privacy">
          <CardList title="Privacy choices" icon={CheckCircle2} tone="gold">
            {[
              "Orientation, religion and ethnicity are not predicted and not used as inputs.",
              "Contact details are removed from the text before any processing.",
              "The notebook shows aggregates only, no essay text and no individual rows.",
              "The profiles you search on this site are invented.",
            ]}
          </CardList>
        </Section>
        <Section id="limits" title="Limits">
          <CardList title="What this project does not show" icon={TriangleAlert} tone="rose">
            {[
              "The data is from California in 2011 and 2012, and answers are self reported.",
              "There are no matches, messages or ratings, so nothing here shows that similar profiles would match.",
              "Results are associations, not causes. The fairness checks are not a full audit.",
              "The drinking model is wrong for many individuals and must not be used to profile anyone.",
            ]}
          </CardList>
        </Section>
        <p className="text-sm text-muted">This page is a short summary of the notebook&rsquo;s README.</p>
      </div>
    </>
  );
}
