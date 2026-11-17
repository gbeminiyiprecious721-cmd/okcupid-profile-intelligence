import { Globe, Laptop, ShieldAlert, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import type { ClassifyExample, LabSummary, PredictResponse } from "../api/client";
import { useClassifyExamples, useMeta, usePredict } from "../api/hooks";
import { Button } from "../components/ui/Button";
import { PageHeader } from "../components/ui/PageHeader";
import { AtAGlance, Callout, LabGate, Section } from "../features/lab/common";
import { ErrorPanel } from "../features/discover/ErrorPanel";
import { TestEvidence } from "../features/lab/TestEvidence";
import { cn } from "../lib/cn";
import { fieldLabel } from "../lib/labels";
import { classifyNames } from "../lib/nav";
import { dec, int, share } from "../lib/format";

export default function Classify() {
  const meta = useMeta();
  const local = meta.data?.mode === "local";
  return (
    <>
      <PageHeader
        icon={ShieldCheck}
        title={classifyNames(meta.data?.mode).title}
        lead={
          local
            ? "An educational look at how the drinking classifier works, what it gets right and why it must never be used to profile anyone."
            : "How well the notebook's drinking classifier worked on users it had never seen, what it gets wrong and why it must never be used to profile anyone."
        }
      />
      <Callout title="Educational and experimental" tone="caution">
        <p>
          This page covers a research model and six fictional examples. It is not a profiling feature and it is not a service for people. A prediction here is an estimate from patterns in 2011 and 2012 dating profiles. It is not a fact about any person.
        </p>
      </Callout>
      <div className="mt-12 space-y-12">
        <Demo />
        <LabGate>{(lab) => <Evidence lab={lab} />}</LabGate>
      </div>
    </>
  );
}

const inches = (n: number) => `${Math.floor(n / 12)} ft ${n % 12} in`;

function Demo() {
  const meta = useMeta();
  const local = meta.data?.mode === "local";
  const on = meta.data?.features.classifier_demo === true;
  const examples = useClassifyExamples(on);
  const predict = usePredict();
  const [picked, setPicked] = useState<string | null>(null);
  const Icon = local ? Laptop : Globe;

  let status = "Checking which mode the service is in.";
  if (meta.isError) status = "The service did not answer, so the mode is unknown.";
  else if (meta.data && !local) status = "Public mode. The demonstration is switched off. It needs a model made from the real profiles, and public mode never loads one. The research evidence below is still shown, because it holds aggregate numbers only.";
  else if (meta.data && local && !on) status = "Local mode, but the classifier files are not on this computer. Export them with scripts/export_classifier.py to turn the demonstration on.";
  else if (meta.data) status = "Local mode, with the classifier loaded from verified local files.";

  return (
    <Section id="demo" title={local ? "Try the classifier on a fictional example" : "Live demonstration"}>
      <section aria-labelledby="mode-heading" className="glass max-w-[44rem] p-5">
        <h3 id="mode-heading" className="flex items-center gap-2 text-xl font-semibold">
          <Icon aria-hidden="true" className="size-5 text-primary" />
          Availability
        </h3>
        <p className="mt-2" aria-busy={meta.isPending}>
          {status}
        </p>
      </section>

      {on && examples.isError && <ErrorPanel error={examples.error} onRetry={() => examples.refetch()} />}
      {on && examples.data && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (picked) predict.mutate(picked);
          }}
          className="space-y-5"
        >
          <fieldset>
            <legend className="text-xl font-semibold text-heading">Choose one of six fictional examples</legend>
            <p className="mt-1 max-w-[44rem] text-muted">
              You cannot type or change anything. Each example is an invented person with fixed details, including the sex and location the original model used as inputs.
            </p>
            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {examples.data.map((ex) => (
                <ExampleCard key={ex.example_id} ex={ex} picked={picked === ex.example_id} onPick={() => setPicked(ex.example_id)} />
              ))}
            </div>
          </fieldset>
          <Button type="submit" variant="gold" className="min-h-12 px-6 active:translate-y-px" disabled={!picked || predict.isPending} aria-busy={predict.isPending}>
            {predict.isPending ? "Running" : "Run the classifier"}
          </Button>
          {!picked && <p className="text-sm text-muted">Choose an example to run the classifier.</p>}
        </form>
      )}
      {predict.isError && <ErrorPanel error={predict.error} onRetry={picked ? () => predict.mutate(picked) : undefined} />}
      {predict.data && !predict.isPending && <Result result={predict.data} />}
    </Section>
  );
}

function ExampleCard({ ex, picked, onPick }: { ex: ClassifyExample; picked: boolean; onPick: () => void }) {
  const p = ex.persona;
  return (
    <div className={cn("glass p-4", picked && "border-gold shadow-[0_14px_34px_-16px_var(--glow)]")}>
      <label className="flex min-h-11 cursor-pointer items-start gap-3 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus">
        <input type="radio" name="example" value={ex.example_id} checked={picked} onChange={onPick} className="mt-1.5 size-4 accent-[var(--primary)]" />
        <span>
          <span className="block font-display text-xl font-semibold text-heading">{ex.display_handle}</span>
          <span className="block text-sm text-muted">Fictional example</span>
        </span>
      </label>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">
        <dt className="text-muted">Age</dt>
        <dd>{p.age}</dd>
        <dt className="text-muted">Height</dt>
        <dd>{inches(p.height)}</dd>
        <dt className="text-muted">Sex</dt>
        <dd>
          {p.sex === "f" ? "female" : "male"} <span className="text-muted">(fixed)</span>
        </dd>
        <dt className="text-muted">Location</dt>
        <dd>
          {p.location} <span className="text-muted">(fixed)</span>
        </dd>
        {Object.entries(ex.lifestyle)
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted">{fieldLabel(k)}</dt>
              <dd>{v}</dd>
            </div>
          ))}
      </dl>
      <details className="mt-3">
        <summary className="min-h-11 cursor-pointer py-2.5 text-sm font-medium text-heading">Read the fictional profile text</summary>
        <p className="text-sm">{ex.text}</p>
      </details>
    </div>
  );
}

function Result({ result }: { result: PredictResponse }) {
  const top = result.classes.find((c) => c.is_predicted)!;
  return (
    <div aria-live="polite" className="glass p-5 shadow-[inset_0_3px_0_var(--thread),0_12px_32px_-18px_var(--glow)] sm:p-6" data-testid="prediction">
      <p className="text-sm text-muted">Model estimate for the fictional example {result.display_handle}</p>
      <h3 className="mt-1 font-display text-3xl font-semibold text-heading sm:text-4xl" data-testid="predicted">
        Most probable category: {result.predicted}
      </h3>
      <p className="mt-2 max-w-[44rem]">
        The model gives this category {share(top.probability)}, against a base rate of {top.base_rate.toFixed(1)}% among the training users. That is an estimate, not certainty. Its lead over the next most probable category is {share(result.margin)}, and many individuals are predicted wrongly.
      </p>
      <ul aria-label="Probability of each drinking category" className="mt-5 space-y-3">
        {result.classes.map((c) => (
          <li key={c.level} data-testid={`prob-${c.level}`}>
            <div className="flex items-baseline justify-between gap-3">
              <span className={cn("font-medium text-heading", c.is_predicted && "underline decoration-gold decoration-2 underline-offset-4")}>
                {c.level}
                {c.is_predicted && <span className="ml-2 text-sm font-normal text-muted">most probable</span>}
              </span>
              <span className="tabular-nums">
                <strong className="text-heading">{share(c.probability)}</strong> <span className="text-sm text-muted">base rate {c.base_rate.toFixed(1)}%</span>
              </span>
            </div>
            <div className="relative mt-1 h-4" aria-hidden="true">
              <div className="absolute inset-0 rounded-sm bg-line" />
              <div className={cn("absolute inset-y-0 left-0 rounded-sm", c.is_predicted ? "bg-primary" : "bg-teal")} style={{ width: `${c.probability * 100}%` }} />
              <div className="absolute inset-y-[-3px] w-0.5 bg-heading" style={{ left: `${c.base_rate}%` }} />
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-sm text-muted">
        <span aria-hidden="true" className="mr-1.5 inline-block h-3 w-0.5 translate-y-0.5 bg-heading" />
        The black mark on each bar is the base rate: how common that category is among the training users.
      </p>
      <div className="mt-5 max-w-[44rem] space-y-2 text-[0.9375rem]">
        <p>
          <strong className="text-heading">These probabilities are not true frequencies.</strong> The model was trained with balanced class weights so that it pays attention to the small groups. That raises their probabilities well above their base rates, so a prediction of &ldquo;rarely&rdquo; does not mean this person is likely to drink rarely.
        </p>
        <p>
          <strong className="text-heading">Not a fact about a person.</strong> The example is fictional. If it were a real person, the estimate would still describe patterns in other people&rsquo;s profiles.
        </p>
      </div>
    </div>
  );
}

function Evidence({ lab }: { lab: LabSummary }) {
  const t = lab.models.test;
  const women = lab.fairness.subgroups.find((s) => s.kind === "sex" && s.group === "f")!;
  const men = lab.fairness.subgroups.find((s) => s.kind === "sex" && s.group === "m")!;
  const older = lab.fairness.subgroups.find((s) => s.kind === "age_band" && s.group === "45 and over")!;
  const ci = t.intervals.find((i) => i.metric === "final model")!;
  const base = t.intervals.find((i) => i.metric === "baseline")!;
  const [seg1, seg2] = lab.segments.items;
  const sex = lab.similarity.fields.find((f) => f.field === "sex")!;

  return (
    <>
      <AtAGlance
        items={[
          `Macro F1 is ${dec(t.final.macro_f1)} on users the model never saw, against ${dec(t.baseline.macro_f1)} for the baseline. Accuracy is lower than the baseline on purpose, to find more of the small groups.`,
          "Individual behaviour cannot be predicted this way. Mistakes mostly go to the neighbouring group, and many individuals are predicted wrongly.",
          "Sex and location were inputs to the validated model, which is a proxy risk, so the demonstration fixes them.",
          "It is educational only and must never be used to profile anyone.",
        ]}
      />
      <Section id="evidence" title="How well does it work?" lead="These are the notebook's results on the test set: users the model never learned from, scored once.">
        <dl className="grid max-w-[60rem] gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Headline test results">
          <Fact label="Macro F1" value={dec(t.final.macro_f1)} hint={`95% range ${dec(ci.low)} to ${dec(ci.high)}`} />
          <Fact label="Baseline macro F1" value={dec(t.baseline.macro_f1)} hint="Always guessing the most common answer" />
          <Fact label="Accuracy" value={dec(t.final.accuracy)} hint="Below the baseline, on purpose" />
          <Fact label="Baseline accuracy" value={dec(t.baseline.accuracy)} hint={`${int(t.users)} test users`} />
        </dl>
        <TestEvidence lab={lab} />
      </Section>

      <Section id="reading" title="Reading the evidence">
        <div className="grid max-w-[60rem] gap-6 md:grid-cols-2">
          <Explain title="Why macro F1 was chosen">
            Most users say they drink socially, so a model that always guessed it would be right {share(t.baseline.accuracy, 0)} of the time and would never find anyone in the other three groups. Macro F1 averages how well each of the four groups is found, so the small groups count as much as the big one. The baseline scores {dec(base.score)} on it, against {dec(t.final.macro_f1)} for the model.
          </Explain>
          <Explain title="Why accuracy is lower than the baseline">
            The model gives up accuracy on the big group to find more of the small ones. Its accuracy is {dec(t.final.accuracy)}, below the baseline&rsquo;s {dec(t.baseline.accuracy)}, and that is deliberate. A lower accuracy here is not a failure. It is the price of catching more of the groups the baseline ignores.
          </Explain>
          <Explain title="Precision and recall">
            Recall asks: of the people who truly are in a group, how many does the model find? Precision asks: of the people the model puts in a group, how many truly belong? The model finds about half of the social drinkers and of the frequent drinkers, but precision for the three smaller groups is only {dec(Math.min(...t.per_class.filter((c) => c.level !== "socially").map((c) => c.precision)))} to {dec(Math.max(...t.per_class.filter((c) => c.level !== "socially").map((c) => c.precision)))}, so most people it puts in them do not belong.
          </Explain>
          <Explain title="Why individual behaviour cannot be predicted this way">
            A pattern across thousands of profiles is not a fact about one person. Drinking is only weakly tied to what a person writes, answers are self reported, and the groups overlap. Mistakes mostly go to the neighbouring group: {t.often_predicted_socially_pct}% of frequent drinkers are predicted &ldquo;socially&rdquo; and {t.not_at_all_predicted_rarely_pct}% of non drinkers are predicted &ldquo;rarely&rdquo;. It could suit a soft estimate shown with its uncertainty. It must never decide anything about a person.
          </Explain>
        </div>
      </Section>

      <Section id="fairness" title="Sex, location and fairness" lead="The original model used some inputs that deserve a closer look.">
        <div className="grid max-w-[60rem] gap-6 md:grid-cols-2">
          <Explain title="Sex and location were inputs">
            The validated model uses sex and location among its 19 structured inputs, as the notebook describes. That is why each fictional example has a fixed sex and location and why you cannot change them here: changing them would show how much the estimate rests on them, which is exactly the proxy risk. Orientation, religion and ethnicity were left out on purpose.
          </Explain>
          <Explain title="Proxy effects">
            Leaving a column out does not remove its influence. In the notebook, groups made without sex still split by sex (Segment 1 is {seg1.male_pct}% men and Segment 2 is {seg2.male_pct}% men), and similar essays go with the same sex {share(sex.embeddings)} to {share(sex.tfidf)} of the time against {share(sex.chance)} by chance. Writing style, and likely location, carry information about sex and age.
          </Explain>
          <Explain title="Uneven performance">
            The macro F1 is {dec(women.macro_f1)} for women and {dec(men.macro_f1)} for men, a small gap. It is lower for users aged 45 and over ({dec(older.macro_f1)}), users who write little and users with no text. Any use of this model would serve those people less well. See <Link to="/lab/fairness">fairness and limitations</Link>.
          </Explain>
          <Explain title="What it must never be used for">
            Profiling users, showing a guess about a person to others, filtering people by it, inferring any sensitive trait, or treating anyone differently because of it. It is here to teach how a classifier works and where it fails.
          </Explain>
        </div>
      </Section>

      <Section id="privacy" title="Privacy and where this runs">
        <ul className="glass max-w-[44rem] list-disc space-y-2 p-5 pl-9 marker:text-gold">
          <li>Only a fixed fictional example can be classified. The request holds the name of an example and nothing else, so there is no visitor input to collect, log or store.</li>
          <li>The model was fitted on the real profiles, so it is a local only file. Public mode refuses to load it, and refuses the classifier endpoints.</li>
          <li>No original profile, essay or individual record is loaded, shown or returned. The fictional texts were written for this demonstration.</li>
          <li>The research numbers above are aggregates from the notebook. They are the only part of this page that appears in public mode.</li>
        </ul>
        <div className="glass flex max-w-[44rem] items-start gap-3 border-accent bg-accent-soft p-4">
          <ShieldAlert aria-hidden="true" className="mt-1 size-5 shrink-0 text-accent" />
          <p>
            <strong className="text-heading">Educational use only.</strong> Do not use this page or its output to make or support any decision about a real person.
          </p>
        </div>
      </Section>
    </>
  );
}

function Fact({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="glass p-4">
      <dt className="font-medium text-muted">{label}</dt>
      <dd className="mt-1">
        <span className="block font-display text-3xl font-semibold tabular-nums text-heading">{value}</span>
        <span className="mt-1 block text-sm text-muted">{hint}</span>
      </dd>
    </div>
  );
}

function Explain({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="glass p-5">
      <h3 className="text-xl font-semibold">{title}</h3>
      <p className="mt-2 text-muted">{children}</p>
    </div>
  );
}
