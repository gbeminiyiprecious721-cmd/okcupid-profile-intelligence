import { Layers } from "lucide-react";
import { useState } from "react";
import { BarChart, ChartFrame, LineChart, SplitBar } from "../components/charts/charts";
import { PageHeader } from "../components/ui/PageHeader";
import { answerLabel, AtAGlance, Callout, LabGate, Section } from "../features/lab/common";
import { dec, int, pct } from "../lib/format";
import { numberWordCap } from "../lib/numberWord";

export default function Segments() {
  return (
    <>
      <PageHeader icon={Layers} title="Segments" lead="Six groups of users found from what they write and how they describe their lives. They are stable and readable, but they blend into one another." />
      <LabGate>{(lab) => <Content lab={lab} />}</LabGate>
    </>
  );
}

function Content({ lab }: { lab: import("../api/client").LabSummary }) {
  const s = lab.segments;
  const [picked, setPicked] = useState(s.items[0].id);
  const [stab, setStab] = useState<string | null>(null);
  const [sil, setSil] = useState<string | null>(null);
  const [drink, setDrink] = useState<string | null>(null);
  const seg = s.items.find((i) => i.id === picked)!;
  const d = s.drinking_check;
  const sex1 = s.items[0];
  const sex2 = s.items[1];
  const older = s.items[5];

  return (
    <div className="space-y-12">
      <AtAGlance
        items={[
          `${numberWordCap(s.items.length)} groups of users, found from the meaning of their essays and their lifestyle answers. Drinking was never used to make them.`,
          `The groups are stable up to six (agreement ${dec(s.stability_k6.new_seed, 2)} and ${dec(s.stability_k6.new_sample, 2)} at six) but weakly separated: the silhouette score is about ${dec(s.silhouette.k6_about, 2)} and never passes ${dec(s.silhouette.maximum, 3)}.`,
          `Sex and age show up in the groups although they were not used: Segment 1 is ${pct(sex1.male_pct)} men and Segment 2 is ${pct(sex2.male_pct)} men.`,
          "Segments describe tendencies. They should never be used to treat users differently.",
        ]}
      />
      <Callout title="How the groups were made" tone="info">
        <p>
          The groups use the meaning of each user&rsquo;s essays ({s.reduction.text_columns} numbers, reduced to {s.reduction.text_components} that keep {s.reduction.text_variation_pct}% of the variation) and their lifestyle answers ({s.reduction.lifestyle_columns} columns, reduced to{" "}
          {s.reduction.lifestyle_components} that keep {s.reduction.lifestyle_variation_pct}%). Drinking, sex, location, orientation, religion and ethnicity were not used. The plain names below are the notebook author&rsquo;s interpretation, not something the
          model produced.
        </p>
      </Callout>

      <Section id="groups" title="The six segments" lead={`${int(lab.overview.dataset.segmented)} users could be grouped. The ${int(lab.overview.dataset.no_text)} who wrote nothing are left out.`}>
        <ChartFrame
          title="No segment is tiny or dominant"
          note="Press a segment to read about it."
          table={{
            columns: ["Segment", "Interpretation", "Users", "Share", "Mean age", "Men"],
            rows: s.items.map((i) => [`Segment ${i.id}`, i.name, int(i.users), pct(i.share_pct, 1), i.mean_age.toFixed(1), pct(i.male_pct)]),
          }}
          source="Source: notebook sections 9.4 and 9.5, from the training users and users with no drinking answer. The test set was not used."
        >
          <SplitBar selected={picked} onSelect={setPicked} parts={s.items.map((i) => ({ id: i.id, label: i.name, value: i.users, display: pct(i.share_pct, 1) }))} />
          <article aria-live="polite" className="mt-4 rounded-[14px] border border-line bg-bg p-5" data-testid="segment-card">
            <h4 className="font-display text-2xl font-semibold text-heading">
              Segment {seg.id}: {seg.name}
            </h4>
            <p className="text-sm text-muted">Interpretation of the tables below, not a model output.</p>
            <dl className="mt-4 grid gap-4 sm:grid-cols-3">
              <div>
                <dt className="text-sm text-muted">Users</dt>
                <dd className="font-semibold tabular-nums">
                  {int(seg.users)} ({pct(seg.share_pct, 1)})
                </dd>
              </div>
              <div>
                <dt className="text-sm text-muted">Average age</dt>
                <dd className="font-semibold tabular-nums">
                  {seg.mean_age.toFixed(1)} <span className="font-normal text-muted">(all users {s.population.mean_age.toFixed(1)})</span>
                </dd>
              </div>
              <div>
                <dt className="text-sm text-muted">Men</dt>
                <dd className="font-semibold tabular-nums">
                  {pct(seg.male_pct)} <span className="font-normal text-muted">(all users {pct(s.population.male_pct)})</span>
                </dd>
              </div>
            </dl>
            <h5 className="mt-4 font-semibold text-heading">Words that stand out</h5>
            <p className="text-sm text-muted">Averages over many users, never one person&rsquo;s text. The ten words the notebook prints, in its order. The notebook had already removed common first names. This page removes and edits nothing else, so informal and strong words appear as written.</p>
            <ul className="mt-1 flex flex-wrap gap-1.5" aria-label={`Words that stand out in segment ${seg.id}`}>
              {seg.top_words.map((w) => (
                <li key={w} className="rounded-full border border-control px-2.5 py-0.5 text-sm">
                  {w}
                </li>
              ))}
            </ul>
            <h5 className="mt-4 font-semibold text-heading">Answers more common here than overall</h5>
            <p className="text-sm text-muted">A ratio of 2.0 means twice as common as among all users.</p>
            <ul className="mt-1 space-y-0.5">
              {seg.over_represented.map((a) => (
                <li key={a.answer}>
                  {answerLabel(a.answer)} <span className="text-muted">({a.ratio.toFixed(1)} times)</span>
                </li>
              ))}
            </ul>
          </article>
        </ChartFrame>

        <ChartFrame
          title={`Segment ${d.highest_segment} drinks often the most and Segment ${d.lowest_segment} the least`}
          note="Drinking was never used to make the groups, so this is a check, not a result of the grouping. The notebook gives figures for two segments and only a range for the other four, so that is all this chart shows."
          table={{
            columns: ["Segment", "Drink often"],
            rows: [
              [`Segment ${d.highest_segment}`, `${d.highest_often_pct}%`],
              [`Segment ${d.lowest_segment}`, `${d.lowest_often_pct}%`],
              ["The other four segments", `${d.others_often_low_pct}% to ${d.others_often_high_pct}%`],
            ],
          }}
          source={`Source: notebook section 9.5. In Segment ${d.lowest_segment}, ${d.lowest_rarely_or_never_pct}% drink rarely or not at all. Training users with a drinking answer.`}
          readout={drink}
        >
          <BarChart
            label="Share of each segment who drink often"
            max={25}
            onReadout={setDrink}
            bars={[
              { id: "hi", label: `Segment ${d.highest_segment}`, value: d.highest_often_pct, display: `${d.highest_often_pct}%`, tone: "highlight", detail: `Segment ${d.highest_segment}: ${d.highest_often_pct}% drink often, the highest.` },
              { id: "lo", label: `Segment ${d.lowest_segment}`, value: d.lowest_often_pct, display: `${d.lowest_often_pct}%`, tone: "alt", detail: `Segment ${d.lowest_segment}: ${d.lowest_often_pct}% drink often, the lowest. ${d.lowest_rarely_or_never_pct}% drink rarely or not at all.` },
              { id: "rest", label: "Other four segments", sublabel: "a range, no single figures", value: d.others_often_high_pct, low: d.others_often_low_pct, high: d.others_often_high_pct, rangeOnly: true, display: `${d.others_often_low_pct}–${d.others_often_high_pct}%`, tone: "muted", detail: `The notebook reports the other four segments only as a range, ${d.others_often_low_pct}% to ${d.others_often_high_pct}% drinking often. No figure is given for any one of them, so the chart shows the span and nothing more.` },
            ]}
          />
        </ChartFrame>

        <Callout title="Sex shows up even though it was not used" tone="caution">
          <p>
            Segment 1 is {pct(sex1.male_pct)} men and Segment 2 is {pct(sex2.male_pct)} men. Writing style and body type act as proxies for sex, and Segment {older.id} is mostly an age group (average age {older.mean_age.toFixed(1)}). Segments describe tendencies and should
            never be used to treat users differently.
          </p>
        </Callout>
      </Section>

      <Section id="stability" title="Stable, but not separate" lead="Two checks ask different questions. Stability asks whether the same groups appear again. Separation asks whether the groups are really apart.">
        <ChartFrame
          title="The groups stay the same up to six, then fall apart"
          note="Agreement between a new fit and the original groups, measured with the adjusted Rand index: 1 means identical, 0 means no agreement beyond chance."
          table={{ columns: ["Groups (k)", "New random start", "New 80% sample"], rows: s.stability.map((r) => [r.k, dec(r.new_seed, 2), dec(r.new_sample, 2)]) }}
          source={`Source: notebook section 9.3. Six is the largest number of groups that is still stable (${dec(s.stability_k6.new_seed, 2)} and ${dec(s.stability_k6.new_sample, 2)} at six).`}
          readout={stab}
        >
          <LineChart
            categories={s.stability.map((r) => String(r.k))}
            xLabel="Groups (k)"
            yLabel="Agreement"
            yMin={0.5}
            yMax={1}
            format={(n) => n.toFixed(2)}
            onReadout={setStab}
            series={[
              { name: "New random start", tone: "main", values: s.stability.map((r) => r.new_seed) },
              { name: "New 80% sample", tone: "alt", dash: "6 4", values: s.stability.map((r) => r.new_sample) },
            ]}
          />
        </ChartFrame>

        <ChartFrame
          title={`Separation is weak: a silhouette score of about ${dec(s.silhouette.k6_about, 2)}`}
          note={`Scores above about ${dec(s.silhouette.clear_above, 1)} mean clear groups and below ${dec(s.silhouette.weak_below, 2)} mean weak structure. The notebook prints these values for two, six and ten groups; the figure below shows every k.`}
          table={{
            columns: ["Groups (k)", "Silhouette score"],
            rows: [
              [2, dec(s.silhouette.k2)],
              [`6 (about)`, dec(s.silhouette.k6_about, 2)],
              [10, dec(s.silhouette.k10, 2)],
            ],
          }}
          source={`Source: notebook sections 9.3 and 14.1. It never passes ${dec(s.silhouette.maximum)} for any number of groups.`}
          readout={sil}
        >
          <BarChart
            label="Silhouette score"
            max={s.silhouette.clear_above}
            reference={{ value: s.silhouette.weak_below, label: `${dec(s.silhouette.weak_below, 2)}: below this, structure is weak` }}
            onReadout={setSil}
            bars={[
              { id: "k2", label: "Two groups", sublabel: "the best of any k", value: s.silhouette.k2, display: dec(s.silhouette.k2), detail: `Two groups: ${dec(s.silhouette.k2)}, the highest silhouette score for any number of groups.` },
              { id: "k6", label: "Six groups", sublabel: "the choice made", value: s.silhouette.k6_about, display: `about ${dec(s.silhouette.k6_about, 2)}`, tone: "highlight", detail: `Six groups: about ${dec(s.silhouette.k6_about, 2)}. Far below the ${dec(s.silhouette.weak_below, 2)} mark for weak structure.` },
              { id: "k10", label: "Ten groups", value: s.silhouette.k10, display: dec(s.silhouette.k10, 2), tone: "muted", detail: `Ten groups: ${dec(s.silhouette.k10, 2)}.` },
            ]}
          />
          <details className="mt-4 rounded-md border border-line">
            <summary className="min-h-11 cursor-pointer px-3 py-2.5 font-medium text-heading">Notebook figure: every k, with the inertia curve</summary>
            <div className="p-3">
              <img
                src="/api/v1/lab/figures/clusters_vs_k"
                width={1100}
                height={400}
                loading="lazy"
                alt={`Two charts from the notebook. Left: inertia falls smoothly from two to ten groups with no clear bend. Right: silhouette score falls slowly from ${dec(s.silhouette.k2)} at two groups to ${dec(s.silhouette.k10, 2)} at ten, always far under the ${dec(s.silhouette.weak_below, 2)} line.`}
                className="h-auto w-full rounded bg-white"
              />
            </div>
          </details>
        </ChartFrame>

        <div className="space-y-4">
          <h3 className="text-2xl font-semibold">Why the separation is weak</h3>
          <div className="grid gap-4 lg:grid-cols-3">
            <p className="glass p-4">
            <strong className="text-heading">Demonstrated.</strong> The silhouette score is low at every number of groups, the inertia curve has no bend, and the groups overlap although they are stable. Users form a continuum, not distinct types.
          </p>
            <p className="glass p-4">
            <strong className="text-heading">Likely explanations, not tested here.</strong> Profiles vary smoothly more than they fall into types. K-means looks for round groups of similar size. Reducing the text to {s.reduction.text_components} directions drops more than half of its variation. Short, informal essays give noisy embeddings.
          </p>
            <p className="glass p-4">
            <strong className="text-heading">What could help.</strong> Methods that allow overlapping or uneven groups, different features, or longer text.
          </p>
          </div>
          <p className="max-w-[44rem]">
            A new profile can be placed in a segment without refitting. Checking this on {s.assignment_check.users_checked} users gave the same segment as before for {pct(s.assignment_check.agreement_pct)} of them.
          </p>
        </div>
      </Section>
    </div>
  );
}
