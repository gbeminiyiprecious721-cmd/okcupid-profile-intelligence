import { Network } from "lucide-react";
import { useState } from "react";
import type { LabSummary } from "../api/client";
import { BarChart, ChartFrame, Choice, DataTable, type Bar } from "../components/charts/charts";
import { PageHeader } from "../components/ui/PageHeader";
import { Link } from "react-router";
import { AtAGlance, Callout, FIELD_NAMES, LabGate, Section } from "../features/lab/common";
import { cn } from "../lib/cn";
import { dec, int, share } from "../lib/format";

export default function Similarity() {
  return (
    <>
      <PageHeader icon={Network} title="Profile similarity" lead="Can the words of a profile find people who live in similar ways? TF-IDF and sentence embeddings are compared on real profiles, using a proxy that has clear limits." />
      <LabGate>{(lab) => <Content lab={lab} />}</LabGate>
    </>
  );
}

const CHECKS = new Set(["sex", "age_band"]);

function Content({ lab }: { lab: LabSummary }) {
  const s = lab.similarity;
  const [method, setMethod] = useState<"both" | "tfidf" | "embeddings">("both");
  const [view, setView] = useState<"agreement" | "lift">("lift");
  const [order, setOrder] = useState<"strongest" | "fixed">("strongest");
  const [r1, setR1] = useState<string | null>(null);
  const [r2, setR2] = useState<string | null>(null);
  const lifestyle = s.fields.filter((f) => !CHECKS.has(f.field));
  const checks = s.fields.filter((f) => CHECKS.has(f.field));
  const sorted = [...lifestyle].sort((a, b) => (order === "strongest" ? Math.max(b.embeddings_lift, b.tfidf_lift) - Math.max(a.embeddings_lift, a.tfidf_lift) : 0));
  const demo = s.invented_profile_demo;
  const cost = s.representation_cost;

  const bars: Bar[] = sorted.flatMap((f) => {
    const name = FIELD_NAMES[f.field] ?? f.field;
    const out: Bar[] = [];
    const add = (m: "tfidf" | "embeddings") => {
      const value = view === "lift" ? f[`${m}_lift`] : f[m];
      const label = m === "tfidf" ? "TF-IDF" : "Embeddings";
      out.push({
        id: `${f.field}-${m}`,
        label: name,
        sublabel: method === "both" ? label : undefined,
        value,
        display: view === "lift" ? `${value.toFixed(2)}×` : share(value),
        tone: m === "tfidf" ? "alt" : "main",
        detail: `${name}, ${label}: neighbours agree ${share(f[m])} of the time against ${share(f.chance)} by chance, ${f[`${m}_lift`].toFixed(2)} times chance.`,
      });
    };
    if (method !== "embeddings") add("tfidf");
    if (method !== "tfidf") add("embeddings");
    return out;
  });

  const checkBars: Bar[] = checks.flatMap((f) => {
    const name = FIELD_NAMES[f.field];
    return [
      { id: `${f.field}-c`, label: name, sublabel: "by chance", value: f.chance, display: share(f.chance), tone: "muted" as const, detail: `${name}: two random users agree ${share(f.chance)} of the time.` },
      { id: `${f.field}-t`, label: name, sublabel: "TF-IDF neighbours", value: f.tfidf, display: share(f.tfidf), tone: "alt" as const, detail: `${name}: TF-IDF neighbours agree ${share(f.tfidf)} of the time, against ${share(f.chance)} by chance.` },
      { id: `${f.field}-e`, label: name, sublabel: "Embedding neighbours", value: f.embeddings, display: share(f.embeddings), tone: "main" as const, detail: `${name}: embedding neighbours agree ${share(f.embeddings)} of the time, against ${share(f.chance)} by chance.` },
    ];
  });

  return (
    <div className="space-y-12">
      <AtAGlance
        items={[
          "Neighbours agree a little more often than chance, never by much.",
          "Sentence embeddings are slightly better than TF-IDF at finding profiles that live in similar ways.",
          "Neighbours are also more often the same sex and age group, so writing style carries information about both.",
          "This measures agreement on lifestyle answers as a proxy. It is not a test of matching, and similar writing is not romantic compatibility.",
        ]}
      />
      <Callout title="Similar writing is not romantic compatibility" tone="caution">
        <p>
          The data has no matches, messages or ratings, so nothing here shows whether two similar people would get on. This page measures whether people with similar essays also give similar lifestyle answers. That is a proxy, and a modest one.
        </p>
        <p>
          The Profile Discovery page works on a pool of invented profiles. Its results illustrate the method. They are not evidence, and they do not reproduce the numbers on this page, which come from {int(s.searchable_users)} real profiles.
        </p>
      </Callout>

      <Section id="methods" title="Two ways to compare writing" lead="Both turn each user's essays into numbers and look for the closest users by cosine similarity, an exact search over every user.">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="glass p-5">
            <h3 className="text-xl font-semibold">TF-IDF matches words</h3>
            <p className="mt-2 text-muted">Two users are close when they use the same distinctive words. Each user becomes {int(s.tfidf_columns)} columns. It is easy to explain, because a match can be traced to shared words.</p>
          </div>
          <div className="glass p-5">
            <h3 className="text-xl font-semibold">Sentence embeddings match meaning</h3>
            <p className="mt-2 text-muted">Two users can be close without a single shared word. Each user becomes {s.embedding_columns} numbers. It finds more lifestyle agreement and is somewhat less tied to sex and age.</p>
          </div>
        </div>
        <div className="max-w-[44rem]">
          <DataTable
            caption="A test with three invented sentences"
            data={{
              columns: ["Pair of invented sentences", "TF-IDF", "Embeddings"],
              rows: [
                ["Hiking and trekking (same meaning)", dec(demo.same_meaning.tfidf, 2), dec(demo.same_meaning.embeddings, 2)],
                ["Hiking and accountant (different)", dec(demo.different.tfidf, 2), dec(demo.different.embeddings, 2)],
              ],
            }}
          />
          <p className="mt-2 text-sm text-muted">Three invented sentences, no real profile text. TF-IDF scores the first pair at zero because the sentences share no words. The two methods use different scales, so compare ranks within one method, not numbers across methods. Average similarity of neighbours: TF-IDF {dec(s.average_similarity.tfidf, 2)}, embeddings {dec(s.average_similarity.embeddings, 2)}.</p>
        </div>
      </Section>

      <Section id="agreement" title="Do neighbours share lifestyle answers?" lead={`${int(s.queries)} random users were used as queries. The search saw essay text only, so every lifestyle answer was held out. For each query, the ${s.neighbours} closest other users were checked.`}>
        <ChartFrame
          title="Neighbours agree a little more often than chance, never by much"
          note="Agreement is the share of neighbours who give the same answer as the query. Lift is agreement divided by what two random users would show. A lift of 1.00 is chance."
          table={{
            columns: ["Field", "By chance", "TF-IDF", "Embeddings", "TF-IDF lift", "Embeddings lift"],
            rows: sorted.map((f) => [FIELD_NAMES[f.field] ?? f.field, share(f.chance), share(f.tfidf), share(f.embeddings), f.tfidf_lift.toFixed(2), f.embeddings_lift.toFixed(2)]),
          }}
          source={`Source: notebook section 11.3. Users with a blank answer are skipped. A proxy for similarity, not a test of matching. Embeddings are above chance on all nine fields and TF-IDF on eight.`}
          readout={r1}
          controls={
            <>
              <Choice label="Method" value={method} onChange={setMethod} options={[{ value: "both", label: "Both" }, { value: "tfidf", label: "TF-IDF" }, { value: "embeddings", label: "Embeddings" }]} />
              <Choice label="Show" value={view} onChange={setView} options={[{ value: "lift", label: "Lift" }, { value: "agreement", label: "Agreement" }]} />
              <Choice label="Order" value={order} onChange={setOrder} options={[{ value: "strongest", label: "Strongest first" }, { value: "fixed", label: "Notebook order" }]} />
            </>
          }
        >
          <BarChart label={`${view === "lift" ? "Lift over chance" : "Agreement"} by lifestyle field`} bars={bars} max={view === "lift" ? 1.7 : 1} reference={view === "lift" ? { value: 1, label: "1.00: chance" } : undefined} onReadout={setR1} />
        </ChartFrame>
        <div className="max-w-[44rem] space-y-3 border-l-2 border-[var(--thread)] pl-4">
          <p>
            The strongest signal is work: {share(lifestyle.find((f) => f.field === "job")!.embeddings)} agreement against {share(lifestyle.find((f) => f.field === "job")!.chance)} by chance. Drinking is barely above chance ({share(lifestyle.find((f) => f.field === "drinks_level")!.tfidf)} with TF-IDF and {share(lifestyle.find((f) => f.field === "drinks_level")!.embeddings)}
            with embeddings, against {share(lifestyle.find((f) => f.field === "drinks_level")!.chance)}). Relationship status is the one field where TF-IDF falls slightly below chance, partly because nearly everyone is single.
          </p>
        </div>

        <ChartFrame
          title="Neighbours are also more often the same sex and age group"
          note="These are checks on what the search picks up, not goals. Writing style carries information about sex and age even when the search is never told them."
          table={{ columns: ["Check", "By chance", "TF-IDF", "Embeddings"], rows: checks.map((f) => [FIELD_NAMES[f.field], share(f.chance), share(f.tfidf), share(f.embeddings)]) }}
          source="Source: notebook section 11.3. TF-IDF is slightly more affected than embeddings. A search that returns people who look alike may keep showing people who look alike."
          readout={r2}
        >
          <BarChart label="Agreement on sex and age group" bars={checkBars} max={1} onReadout={setR2} />
        </ChartFrame>
      </Section>

      <Section id="limits" title="What this evaluation cannot show">
        <ul className="grid list-none gap-4 p-0 md:grid-cols-2">
          <li className="glass p-4">
            <strong className="text-heading">A proxy, not a test of matching.</strong> Similar essays going with similar lives does not mean two people would get along.
          </li>
          <li className="glass p-4">
            <strong className="text-heading">No outcomes.</strong> Without matches or messages the system cannot be scored on what a dating app cares about.
          </li>
          <li className="glass p-4">
            <strong className="text-heading">Only users with text.</strong> {int(lab.overview.dataset.no_text)} users wrote nothing and cannot be searched.
          </li>
          <li className="glass p-4">
            <strong className="text-heading">A narrow view.</strong> The search uses essay text only. Real recommendations would add preferences, location and behaviour.
          </li>
          <li className="glass p-4">
            <strong className="text-heading">A sample of queries.</strong> {int(s.queries)} users were used as queries, not all {int(s.searchable_users)}.
          </li>
          <li className="glass p-4">
            <strong className="text-heading">Privacy.</strong> The system returns scores and lifestyle answers, never another user&rsquo;s text.
          </li>
        </ul>
        <div className="max-w-[44rem]">
          <DataTable
            caption="Size of each representation on the computer used for the notebook"
            data={{ columns: ["Representation", "Columns per user", "Memory (MB)"], rows: Object.entries(cost).map(([name, c]) => [name === "TF-IDF" ? "TF-IDF" : "Sentence embeddings", int(c.columns), c.memory_mb]) }}
          />
        </div>
        <p className={cn("max-w-[44rem]")}>
          Try the method yourself, on invented profiles, in <Link to="/discover">Profile Discovery</Link>.
        </p>
      </Section>
    </div>
  );
}
