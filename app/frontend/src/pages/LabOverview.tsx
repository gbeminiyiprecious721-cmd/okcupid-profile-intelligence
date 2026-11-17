import { ArrowRight, Layers, LayoutDashboard, SplitSquareHorizontal, Users, UserCheck } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { BarChart, ChartFrame, SplitBadge } from "../components/charts/charts";
import { PageHeader } from "../components/ui/PageHeader";
import { AtAGlance, Callout, LabGate, Section, Stat, Stats, Words } from "../features/lab/common";
import { dec, int, pct } from "../lib/format";
import { numberWordCap } from "../lib/numberWord";

export default function LabOverview() {
  return (
    <>
      <PageHeader icon={LayoutDashboard} title="Research overview" lead="The questions asked, the data used and how the results were checked. Every number on these pages comes from the notebook's saved results." />
      <LabGate>{(lab) => <Content lab={lab} />}</LabGate>
    </>
  );
}

function Content({ lab }: { lab: import("../api/client").LabSummary }) {
  const o = lab.overview;
  const ds = o.dataset;
  const [target, setTarget] = useState<string | null>(null);
  const [missing, setMissing] = useState<string | null>(null);
  const [assoc, setAssoc] = useState<string | null>(null);
  const social = o.target.levels.find((l) => l.level === "socially")!;
  const t = lab.models.test;
  const seg = lab.segments;
  const sim = lab.similarity;
  const emb = (field: string) => sim.fields.find((f) => f.field === field)!;
  const job = emb("job");

  return (
    <div>
      <AtAGlance
        items={[
          `${int(ds.profiles)} public profiles from ${ds.period}, almost all in California. It is a teaching file that describes those users at that time, not people today.`,
          `Drinking can be predicted only modestly: macro F1 ${dec(t.final.macro_f1)} on the test set, against ${dec(t.baseline.macro_f1)} for always guessing the most common answer.`,
          `${numberWordCap(seg.items.length)} groups of users appear and are stable, but they are weakly separated (silhouette about ${dec(seg.silhouette.k6_about, 2)}), and adding them did not improve validation macro F1.`,
          "Text finds similar profiles only a little better than chance. Similar writing is not romantic compatibility.",
        ]}
      />
      <div className="mt-8" />
      <Callout title="What you are looking at">
        <p>
          Aggregate results from a notebook that studied {int(ds.profiles)} public dating profiles from {ds.period}. No profile, essay or individual record is shown or served here. The invented profiles on the Profile
          Discovery page are a separate demonstration and are not evidence for any result on these pages.
        </p>
      </Callout>

      <div className="mt-12 space-y-12">
        <Section id="data" title="The data" lead="A teaching file of profiles from one dating site, collected in 2012. It describes those users, at that time, in their own words.">
          <Stats>
            <Stat icon={Users} value={int(ds.profiles)} label="Profiles" hint={`${ds.columns} columns: answers and ten short essays`} />
            <Stat icon={UserCheck} value={int(ds.labelled)} label="With a drinking answer" hint={`${int(ds.unlabelled)} did not answer and were kept for grouping only`} />
            <Stat icon={SplitSquareHorizontal} value={`${int(ds.train)} and ${int(ds.test)}`} label="Training and test users" hint="Split once, before any model was fitted" />
            <Stat icon={Layers} value={int(ds.segmented)} label="Users grouped and searched" hint={`${int(ds.no_text)} wrote no text, so they are left out`} />
          </Stats>
          <ChartFrame
            title={`${pct(social.share_pct)} of users say they drink socially, so accuracy alone would mislead`}
            note="The prediction target is the drinking answer, grouped into four levels. Because one group is so large, a model that always guessed it would look accurate. The notebook therefore uses macro F1, which counts every group equally."
            table={{ columns: ["Drinking level", "Users", "Share"], rows: o.target.levels.map((l) => [l.level, int(l.count), pct(l.share_pct, 1)]) }}
            source={`Source: notebook section 4.5, ${int(ds.labelled)} users with a drinking answer. The largest group is ${o.target.largest_to_smallest} times the smallest.`}
            readout={target}
          >
            <BarChart
              label="Share of users by drinking level"
              max={100}
              onReadout={setTarget}
              bars={o.target.levels.map((l) => ({ id: l.level, label: l.level, value: l.share_pct, display: pct(l.share_pct, 1), detail: `${l.level}: ${int(l.count)} users, ${pct(l.share_pct, 1)} of the ${int(ds.labelled)} who answered.` }))}
            />
          </ChartFrame>
          <ChartFrame
            title="Children, diet and religion are left blank most often"
            note={`Blank answers are treated as unknown, not filled in silently. Income looks complete but holds a code for "no answer" for ${pct(ds.income_not_given_pct, 1)} of profiles, so it is the most incomplete field of all.`}
            table={{ columns: ["Field", "Blank"], rows: o.missing.map((m) => [m.field, pct(m.missing_pct, 1)]) }}
            source="Source: notebook section 4.1. The ten most incomplete fields other than essays."
            readout={missing}
          >
            <BarChart
              label="Share of profiles with a blank answer"
              max={100}
              onReadout={setMissing}
              bars={o.missing.map((m) => ({ id: m.field, label: m.field, value: m.missing_pct, display: pct(m.missing_pct, 1), tone: "muted", detail: `${m.field}: ${pct(m.missing_pct, 1)} of profiles left it blank.` }))}
            />
          </ChartFrame>
        </Section>

        <Section id="questions" title="Three research questions" lead="Each question has a short answer here and a page with the evidence.">
          <ol className="grid gap-4 lg:grid-cols-3">
            <li className="glass flex flex-col p-5">
              <h3 className="text-xl font-semibold">1. Are there meaningful user groups?</h3>
              <p className="mt-3 inline-flex self-start rounded-xl border border-gold bg-bg px-3 py-1 font-medium text-heading">Partly.</p>
              <p className="mt-1 text-muted">
                Six groups appear and they are stable, but users blend into one another: the silhouette score is about {dec(seg.silhouette.k6_about, 2)}, far below the {dec(seg.silhouette.weak_below, 2)} mark for weak structure.
              </p>
              <Link to="/lab/segments" className="mt-auto inline-flex items-center gap-1.5 pt-4 font-medium">
                See the segments
                <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
            </li>
            <li className="glass flex flex-col p-5">
              <h3 className="text-xl font-semibold">2. Can drinking be predicted, and does clustering help?</h3>
              <p className="mt-3 inline-flex self-start rounded-xl border border-gold bg-bg px-3 py-1 font-medium text-heading">Modestly, and clustering does not help.</p>
              <p className="mt-1 text-muted">
                On the test set the best model scores a macro F1 of {dec(t.final.macro_f1)} against {dec(t.baseline.macro_f1)} for guessing. Adding the groups did not improve validation macro F1 (the change was {dec(lab.models.segment_effect.mean_change, 4)}).
              </p>
              <Link to="/lab/models" className="mt-auto inline-flex items-center gap-1.5 pt-4 font-medium">
                See model performance
                <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
            </li>
            <li className="glass flex flex-col p-5">
              <h3 className="text-xl font-semibold">3. Can text find similar profiles, and which method is better?</h3>
              <p className="mt-3 inline-flex self-start rounded-xl border border-gold bg-bg px-3 py-1 font-medium text-heading">Yes, but only weakly.</p>
              <p className="mt-1 text-muted">
                Neighbours share lifestyle answers a little more often than chance, for example {pct(job.embeddings * 100, 1)} on work against {pct(job.chance * 100, 1)} by chance. Embeddings are slightly better for similarity.
              </p>
              <Link to="/lab/similarity" className="mt-auto inline-flex items-center gap-1.5 pt-4 font-medium">
                See profile similarity
                <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
            </li>
          </ol>
        </Section>

        <Section id="method" title="How the results were checked" lead="The order of the steps matters more than the models. Each step is there to stop a result looking better than it is.">
          <ol className="relative max-w-[44rem] space-y-5 border-l-2 border-thread/50 pl-9">
            <li className="relative">
              <span aria-hidden="true" className="absolute -left-[3.2rem] top-0 flex size-8 items-center justify-center rounded-full bg-gold-fill font-display font-semibold text-on-gold ring-4 ring-[var(--bg)]">1</span>
              <p className="font-semibold text-heading">Clean with fixed rules.</p>
              <p className="text-muted">Impossible values and hidden &ldquo;no answer&rdquo; codes become blanks. These rules learn nothing from the data.</p>
            </li>
            <li className="relative">
              <span aria-hidden="true" className="absolute -left-[3.2rem] top-0 flex size-8 items-center justify-center rounded-full bg-gold-fill font-display font-semibold text-on-gold ring-4 ring-[var(--bg)]">2</span>
              <p className="font-semibold text-heading">Split before anything is fitted.</p>
              <p className="text-muted">
                {int(ds.train)} training users and {int(ds.test)} test users, split once with a fixed random seed so each drinking group has the same share in both.
              </p>
            </li>
            <li className="relative">
              <span aria-hidden="true" className="absolute -left-[3.2rem] top-0 flex size-8 items-center justify-center rounded-full bg-gold-fill font-display font-semibold text-on-gold ring-4 ring-[var(--bg)]">3</span>
              <p className="font-semibold text-heading">Compare models on the training set only.</p>
              <p className="text-muted">
                Five fold cross validation: each model learns from four fifths and is scored on the fifth it has not seen. These are <SplitBadge kind="validation" />.
              </p>
            </li>
            <li className="relative">
              <span aria-hidden="true" className="absolute -left-[3.2rem] top-0 flex size-8 items-center justify-center rounded-full bg-gold-fill font-display font-semibold text-on-gold ring-4 ring-[var(--bg)]">4</span>
              <p className="font-semibold text-heading">Freeze the choice, then test once.</p>
              <p className="text-muted">
                The final model, its setting and the metric were fixed before the test set was opened. These are <SplitBadge kind="test" />. Scores on the data a model learned from are <SplitBadge kind="training" /> and only show overfitting.
              </p>
            </li>
            <li className="relative">
              <span aria-hidden="true" className="absolute -left-[3.2rem] top-0 flex size-8 items-center justify-center rounded-full bg-gold-fill font-display font-semibold text-on-gold ring-4 ring-[var(--bg)]">5</span>
              <p className="font-semibold text-heading">Check groups, not only averages.</p>
              <p className="text-muted">Scores are repeated within groups of users to find who the model serves less well.</p>
            </li>
          </ol>
          <ChartFrame
            title="Drug use and smoking show the clearest links with drinking, and every link is small"
            note="Effect sizes with a 95% range from resampling. Cramér's V and the share of variation explained are different measures, so compare bars of the same measure only."
            table={{ columns: ["Factor", "Measure", "Effect", "Low", "High"], rows: o.associations.map((a) => [a.factor, a.measure, dec(a.effect), dec(a.low), dec(a.high)]) }}
            source={`Source: notebook section 6, training set. Among users who use drugs often, ${pct(o.drug_contrast.often_group_pct, 1)} drink often (${int(o.drug_contrast.often_group_n)} users), against ${pct(o.drug_contrast.never_group_pct, 1)} of those who never use drugs. These are associations, not causes.`}
            readout={assoc}
          >
            <BarChart
              label="Effect size of each factor on the drinking answer"
              max={0.25}
              onReadout={setAssoc}
              bars={o.associations.map((a) => ({
                id: a.factor,
                label: a.factor,
                sublabel: a.measure,
                value: a.effect,
                low: a.low,
                high: a.high,
                display: dec(a.effect),
                tone: a.measure.startsWith("Cram") ? "main" : "alt",
                detail: `${a.factor}: ${a.measure} ${dec(a.effect)}, 95% range ${dec(a.low)} to ${dec(a.high)}.`,
              }))}
            />
          </ChartFrame>
        </Section>

        <Section id="words" title="Technical terms in plain words">
          <dl className="grid max-w-[60rem] gap-5 sm:grid-cols-2">
            <Words term="Macro F1">A score from 0 to 1 that averages how well each drinking group is found, so small groups count as much as the big one.</Words>
            <Words term="Validation, training and test">Training scores are measured on data the model has seen. Validation scores use held back parts of the training data. The test score uses data kept apart until the end.</Words>
            <Words term="TF-IDF">Describes a text by which words it uses, giving more weight to words that are rare overall.</Words>
            <Words term="Sentence embedding">Describes a text by its meaning, as a list of numbers. Texts about the same thing end up close, even with different words.</Words>
            <Words term="Silhouette score">How clearly separate groups are, from −1 to 1. Above about {dec(seg.silhouette.clear_above, 1)} is clear and below {dec(seg.silhouette.weak_below, 2)} is weak.</Words>
            <Words term="Lift">How many times more often a result happens than by chance. A lift of 1 is chance.</Words>
          </dl>
        </Section>

        <Section id="limits" title="What the data cannot tell us">
          <ul className="glass max-w-[44rem] list-disc space-y-2 p-5 pl-9 marker:text-accent">
            <li>Profiles were last online in {ds.period}, so patterns may not match people today.</li>
            <li>
              Almost all profiles ({int(ds.california)} of {int(ds.profiles)}) are in California.
            </li>
            <li>Answers are self reported and nothing is verified.</li>
            <li>The data has two values for sex and cannot support conclusions about other identities.</li>
            <li>There are no match or message outcomes, so nothing here shows whether similar people get on.</li>
          </ul>
          <p className="max-w-[44rem]">
            More on privacy and responsible use is on the <Link to="/lab/fairness">fairness and limitations</Link> page.
          </p>
        </Section>
      </div>
    </div>
  );
}
