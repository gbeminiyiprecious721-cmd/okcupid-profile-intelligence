import { Scale } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import type { LabSummary } from "../api/client";
import { BarChart, ChartFrame, Choice, SplitBadge, type Bar } from "../components/charts/charts";
import { PageHeader } from "../components/ui/PageHeader";
import { AtAGlance, Callout, LabGate, Section } from "../features/lab/common";
import { dec, int, pct, share, signed } from "../lib/format";

export default function Fairness() {
  return (
    <>
      <PageHeader icon={Scale} title="Fairness and limitations" lead="Who the results serve less well, what the models pick up that they were not told, how identifiable the text is, and what a responsible product would and would not do." />
      <LabGate>{(lab) => <Content lab={lab} />}</LabGate>
    </>
  );
}

const KINDS = { sex: "Sex", age_band: "Age", essay_length: "Essay length", segment: "Segment" } as const;
type Kind = keyof typeof KINDS;

/** The three weaker spots the notebook names (section 12.5). */
const WEAK = new Set(["age_band:45 and over", "essay_length:shortest quarter", "segment:no text"]);
const NAMES: Record<string, string> = { f: "Women", m: "Men" };
const groupName = (kind: string, g: string) => (kind === "sex" ? (NAMES[g] ?? g) : kind === "age_band" ? `Aged ${g}` : g);

function Content({ lab }: { lab: LabSummary }) {
  const t = lab.models.test;
  const all = lab.fairness.subgroups;
  const [kind, setKind] = useState<Kind>("sex");
  const [r, setR] = useState<string | null>(null);
  const overall = t.final.macro_f1;
  const get = (k: string, g: string) => all.find((x) => x.kind === k && x.group === g)!;
  const women = get("sex", "f");
  const men = get("sex", "m");
  const older = get("age_band", "45 and over");
  const noText = get("segment", "no text");
  const privacy = lab.fairness.privacy;
  const sex = lab.similarity.fields.find((f) => f.field === "sex")!;
  const age = lab.similarity.fields.find((f) => f.field === "age_band")!;
  const [seg1, seg2] = lab.segments.items;

  const cards = [
    { name: "Women", row: women, note: "A small gap from men." },
    { name: "Men", row: men, note: "A small gap from women." },
    { name: "Aged 45 and over", row: older, note: "The smallest age group, and the one that drinks often least, so there is less to learn from." },
    { name: "Users without essay text", row: noText, note: "The model has only their structured answers." },
  ];

  const bars: Bar[] = all
    .filter((x) => x.kind === kind)
    .map((x) => ({
      id: x.group,
      label: groupName(x.kind, x.group),
      sublabel: `${int(x.users)} test users · ${share(x.often_share)} drink often`,
      value: x.macro_f1,
      display: dec(x.macro_f1),
      tone: WEAK.has(`${x.kind}:${x.group}`) ? "highlight" : "main",
      detail: `${groupName(x.kind, x.group)}: macro F1 ${dec(x.macro_f1)} on ${int(x.users)} test users, ${signed(x.macro_f1 - overall)} from the overall ${dec(overall)}. ${share(x.often_share)} of them drink often.`,
    }));

  return (
    <div className="space-y-12">
      <AtAGlance
        items={[
          "Performance is fairly even across groups of users, with three weaker spots.",
          "Leaving a column out does not remove its influence: writing style carries information about sex and age.",
          "No profile, essay or individual record is shown or served by the public application.",
          "A model like this could suit a soft estimate shown with its uncertainty. It must never decide anything about a person.",
        ]}
      />
      <Section id="subgroups" title="Subgroup results" lead="A good average can hide a group the model fails on. The final model's macro F1 was recomputed within groups of test users.">
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Four groups called out">
          {cards.map((c) => (
            <li key={c.name} className="glass p-4">
              <h3 className="text-lg font-semibold">{c.name}</h3>
              <p className="mt-1 font-display text-3xl font-semibold tabular-nums text-heading">{dec(c.row.macro_f1)}</p>
              <p className="text-sm text-muted">
                {signed(c.row.macro_f1 - overall)} from the overall {dec(overall)} · {int(c.row.users)} users
              </p>
              <p className="mt-2 text-sm">{c.note}</p>
            </li>
          ))}
        </ul>
        <ChartFrame
          title="Performance is fairly even, with three weaker spots"
          badges={<SplitBadge kind="test" />}
          note="Group scores partly reflect the mix of drinking habits in each group, so the share who drink often is shown beside each. Small groups give noisy scores. The vertical line is the overall test score."
          table={{ columns: ["Group", "Test users", "Drink often", "Macro F1"], rows: all.filter((x) => x.kind === kind).map((x) => [groupName(x.kind, x.group), int(x.users), share(x.often_share), dec(x.macro_f1)]) }}
          source={`Source: notebook section 12.5, ${int(t.users)} test users. Essay length bands use cut points from the training set. Sex is reported only as the two values in the data. This checks for uneven performance. It is not a full fairness audit, and proxy effects can remain.`}
          readout={r}
          controls={<Choice label="Group by" value={kind} onChange={setKind} options={(Object.keys(KINDS) as Kind[]).map((k) => ({ value: k, label: KINDS[k] }))} />}
        >
          <BarChart label={`Macro F1 by ${KINDS[kind].toLowerCase()}`} bars={bars} max={0.5} reference={{ value: overall, label: `Overall ${dec(overall)}` }} onReadout={setR} />
        </ChartFrame>
        <p className="max-w-[44rem] text-muted">
          Weaker spots are shown in a stronger colour: users aged 45 and over, users who write the least, and users with no text. Any feature built on this model would work less well for them.
        </p>
      </Section>

      <Section id="proxy" title="Proxy effects" lead="Leaving a column out does not remove its influence. Writing style carries information about sex and age.">
        <ul className="grid list-none gap-4 p-0 lg:grid-cols-3">
          <li className="glass p-4">
            <strong className="text-heading">Segments.</strong> Sex was not used to build them, yet Segment 1 is {pct(seg1.male_pct)} men and Segment 2 is {pct(seg2.male_pct)} men. Segment 6 is mostly an age group.
          </li>
          <li className="glass p-4">
            <strong className="text-heading">Similarity.</strong> Nearest neighbours are the same sex {share(sex.tfidf)} of the time with TF-IDF and {share(sex.embeddings)} with embeddings, against {share(sex.chance)} by chance. They share the age group {share(age.tfidf)} and {share(age.embeddings)} of the time, against {share(age.chance)}.
          </li>
          <li className="glass p-4">
            <strong className="text-heading">Sameness.</strong> A search that returns people who look alike may narrow who anyone sees. Measure variety, not only agreement.
          </li>
        </ul>
      </Section>

      <Section id="privacy" title="Privacy considerations" lead="Dating profiles are personal. The notebook measures how identifying they are and what the public application therefore does.">
        <dl className="grid max-w-[60rem] gap-4 sm:grid-cols-2">
          <div className="glass p-4">
            <dt className="font-semibold text-heading">Essays that contain contact details</dt>
            <dd className="mt-1 text-muted">
              About {int(privacy.essays_with_web_link)} have a web link, {privacy.essays_with_handle} a social media handle, {privacy.essays_with_email} an email address and {privacy.essays_with_phone} a phone number. These counts are approximate because they use simple text patterns.
            </dd>
          </div>
          <div className="glass p-4">
            <dt className="font-semibold text-heading">Ordinary fields can single people out</dt>
            <dd className="mt-1 text-muted">
              On six ordinary fields, {pct(privacy.unique_on_six_fields.pct, 1)} of complete profiles are unique ({int(privacy.unique_on_six_fields.unique)} of {int(privacy.unique_on_six_fields.of)}). On just age, sex, location and height, {pct(privacy.unique_on_four_fields.pct, 1)} are unique.
            </dd>
          </div>
          <div className="glass p-4">
            <dt className="font-semibold text-heading">Consent</dt>
            <dd className="mt-1 text-muted">The data was scraped from public profiles and shared for teaching. No source says the users agreed to research use. It is used for education only and is not redistributed.</dd>
          </div>
          <div className="glass p-4">
            <dt className="font-semibold text-heading">Left out on purpose</dt>
            <dd className="mt-1 text-muted">Orientation, religion and ethnicity are neither predicted nor used as inputs, because essays can reveal them indirectly.</dd>
          </div>
        </dl>
        <Callout title="What this application does about it">
          <ul className="list-disc space-y-1 pl-5 marker:text-gold">
            <li>Public mode serves approved aggregate findings only. No essay, profile or individual record is loaded or shown.</li>
            <li>Profile Discovery searches a pool of invented profiles. Contact details you type are removed before searching and nothing you type is stored.</li>
            <li>Words that stand out in a segment are averages over many users, with common first names removed.</li>
          </ul>
        </Callout>
      </Section>

      <Section id="recommendations" title="Responsible AI recommendations" lead="Grouped by how well the results support them.">
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="glass p-5">
            <h3 className="text-xl font-semibold">Implement</h3>
            <p className="text-sm text-muted">Supported by the results</p>
            <ul className="mt-3 list-disc space-y-2 pl-5 marker:text-gold">
              <li>Use similarity as a cold start fallback, ranked with embeddings, only for users with text.</li>
              <li>Show every result with an explanation from shared answers and themes, never another user&rsquo;s text.</li>
              <li>Encourage a first essay at sign up.</li>
              <li>Treat a blank answer as unknown, and let people correct any suggestion.</li>
              <li>Build privacy in from the start.</li>
            </ul>
          </div>
          <div className="glass p-5">
            <h3 className="text-xl font-semibold">Keep experimental</h3>
            <p className="text-sm text-muted">Promising, not proven</p>
            <ul className="mt-3 list-disc space-y-2 pl-5 marker:text-gold">
              <li>Similarity combined with preferences and behaviour, tested on real outcomes.</li>
              <li>Suggesting an answer for a person to confirm, shown with its uncertainty.</li>
              <li>Segments for internal analysis, after a fairness audit.</li>
            </ul>
          </div>
          <div className="glass border-accent bg-accent-soft p-5">
            <h3 className="text-xl font-semibold">Do not deploy</h3>
            <p className="text-sm">Not supported, or too risky</p>
            <ul className="mt-3 list-disc space-y-2 pl-5 marker:text-accent">
              <li>Automatic profiling of drinking or any lifestyle trait.</li>
              <li>Inferring orientation, religion or ethnicity.</li>
              <li>Treating users differently by segment.</li>
              <li>Decisions about an individual from these models.</li>
              <li>Showing one user&rsquo;s essay text to another.</li>
              <li>Calling a similarity score compatibility.</li>
            </ul>
          </div>
        </div>
      </Section>

      <Section id="limits" title="Limitations">
        <div className="grid max-w-[60rem] gap-4 md:grid-cols-2">
          <div className="glass p-5">
            <h3 className="text-xl font-semibold">Demonstrated here</h3>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 marker:text-gold">
              <li>
                Prediction is modest: a test macro F1 of {dec(t.final.macro_f1)} against {dec(t.baseline.macro_f1)}.
              </li>
              <li>Predictions are wrong for many individuals, and weaker for the groups above.</li>
              <li>Segments are stable but weakly separated, add nothing to prediction and partly reflect sex and age.</li>
              <li>Similarity beats chance by small margins only.</li>
            </ul>
          </div>
          <div className="glass p-5">
            <h3 className="text-xl font-semibold">Assumed, not tested</h3>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 marker:text-gold">
              <li>That similar writing improves matches. The data has no match outcomes.</li>
              <li>That explanations built from shared answers and themes build trust.</li>
              <li>That California in {lab.overview.dataset.period} tells us about other places and today.</li>
              <li>That self reported answers are accurate.</li>
              <li>That the explanations offered for the weak results are the true causes.</li>
            </ul>
          </div>
        </div>
        <p className="max-w-[44rem]">
          The synthetic profiles in <Link to="/discover">Profile Discovery</Link> are demonstrations. They are not real people and not evidence for any result on these pages.
        </p>
      </Section>
    </div>
  );
}
