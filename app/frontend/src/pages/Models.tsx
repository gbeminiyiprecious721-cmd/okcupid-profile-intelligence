import { BarChart3 } from "lucide-react";
import { useState } from "react";
import type { LabSummary } from "../api/client";
import { BarChart, Choice, ChartFrame, LineChart, SplitBadge, type Bar } from "../components/charts/charts";
import { PageHeader } from "../components/ui/PageHeader";
import { AtAGlance, Callout, LabGate, Section } from "../features/lab/common";
import { TestEvidence } from "../features/lab/TestEvidence";
import { cn } from "../lib/cn";
import { dec, int, pct, signed } from "../lib/format";

export default function Models() {
  return (
    <>
      <PageHeader icon={BarChart3} title="Model performance" lead="How well a drinking habit can be predicted from a profile, with every score labelled as training, validation or test." />
      <LabGate>{(lab) => <Content lab={lab} />}</LabGate>
    </>
  );
}

const label = (m: { model: string; inputs: string }) => (m.model === "Baseline" ? "Baseline: always guess the most common answer" : `${m.model}`);

function Content({ lab }: { lab: LabSummary }) {
  const m = lab.models;
  const t = m.test;
  const baseline = m.validation.find((v) => v.model === "Baseline")!;
  const best = m.validation[0];
  const [which, setWhich] = useState<"validation" | "both">("validation");
  const [family, setFamily] = useState<"all" | "logistic" | "other">("all");
  const [r1, setR1] = useState<string | null>(null);
  const [r2, setR2] = useState<string | null>(null);
  const [r3, setR3] = useState<string | null>(null);

  const shown = m.validation.filter((v) => family === "all" || (family === "logistic" ? v.model === "Logistic regression" || v.model === "Baseline" : v.model !== "Logistic regression"));
  const bars: Bar[] = shown.flatMap((v, i) => {
    const id = `${i}-${v.model}-${v.inputs}`;
    const name = label(v);
    const validation: Bar = {
      id: `${id}-val`,
      label: name,
      sublabel: `${v.inputs}${which === "both" ? " · validation" : ""}`,
      value: v.validation_macro_f1,
      low: v.validation_macro_f1 - v.fold_spread,
      high: v.validation_macro_f1 + v.fold_spread,
      display: dec(v.validation_macro_f1),
      tone: v.model === "Baseline" ? "muted" : "main",
      detail: `${name}, ${v.inputs}. Validation macro F1 ${dec(v.validation_macro_f1)} (spread across folds ${dec(v.fold_spread)}), accuracy ${dec(v.validation_accuracy)}. Training macro F1 ${dec(v.training_macro_f1)}.`,
    };
    if (which === "validation") return [validation];
    return [validation, { id: `${id}-train`, label: name, sublabel: `${v.inputs} · training`, value: v.training_macro_f1, display: dec(v.training_macro_f1), tone: "alt", detail: `${name}, ${v.inputs}. Training macro F1 ${dec(v.training_macro_f1)}, against ${dec(v.validation_macro_f1)} on validation. The gap shows overfitting.` }];
  });

  const segFolds = m.segment_effect.fold_changes;
  const noDrink = (inputs: string) => m.validation.find((v) => v.inputs === inputs)!.validation_macro_f1;

  return (
    <div className="space-y-12">
      <AtAGlance
        items={[
          "Every model beats the baseline. Text carries more signal than the structured answers, and the two together do best.",
          `On the test set the final model scores a macro F1 of ${dec(lab.models.test.final.macro_f1)}, against ${dec(lab.models.test.baseline.macro_f1)} for the baseline. That is a modest signal.`,
          "More flexible settings fit the training data better and the validation data worse, and tuning gained nothing over the default.",
          "Adding segments did not improve validation macro F1.",
        ]}
      />
      <Callout title="Three kinds of score, kept apart on this page">
        <ul className="space-y-1.5">
          <li>
            <SplitBadge kind="training" /> The model is scored on the users it learned from. It flatters the model and is shown only to reveal overfitting.
          </li>
          <li>
            <SplitBadge kind="validation" /> Used to compare models. Each is scored on parts of the {int(lab.overview.dataset.train)} training users that it did not learn from, in five rounds.
          </li>
          <li>
            <SplitBadge kind="test" /> Scored once, on {int(t.users)} users kept apart until the end, for the final model and the baseline only.
          </li>
        </ul>
      </Callout>

      <Section id="compare" title="Comparing the models" lead="Every model beats the baseline. Text carries more signal than the structured answers, and the two together do best.">
        <ChartFrame
          title="Essay words plus lifestyle answers score best, and simple models match complex ones"
          badges={
            <>
              <SplitBadge kind="validation" />
              {which === "both" && <SplitBadge kind="training" />}
            </>
          }
          note="Bars show macro F1. The black line on each bar is the spread across the five validation rounds. The vertical line marks the baseline."
          table={{
            columns: ["Model", "Inputs", "Validation macro F1", "Fold spread", "Training macro F1", "Validation accuracy"],
            rows: shown.map((v) => [v.model, v.inputs, dec(v.validation_macro_f1), dec(v.fold_spread), dec(v.training_macro_f1), dec(v.validation_accuracy)]),
          }}
          source="Source: notebook sections 10 and 12.2. Five fold cross validation on the training set. These are not test scores."
          readout={r1}
          controls={
            <>
              <Choice label="Models" value={family} onChange={setFamily} options={[{ value: "all", label: "All" }, { value: "logistic", label: "Logistic regression" }, { value: "other", label: "Other methods" }]} />
              <Choice label="Scores" value={which} onChange={setWhich} options={[{ value: "validation", label: "Validation" }, { value: "both", label: "With training" }]} />
            </>
          }
        >
          <BarChart label="Macro F1 by model" bars={bars} max={0.7} reference={{ value: baseline.validation_macro_f1, label: `Baseline ${dec(baseline.validation_macro_f1)}` }} onReadout={setR1} />
        </ChartFrame>
        <div className="max-w-[44rem] space-y-3 border-l-2 border-[var(--thread)] pl-4">
          <p>
            The best model, logistic regression on lifestyle answers plus essay words, reaches a validation macro F1 of {dec(best.validation_macro_f1)} against {dec(baseline.validation_macro_f1)} for the baseline. Its training score is {dec(best.training_macro_f1)}, far above its validation score, so it overfits. Turn on
            &ldquo;With training&rdquo; to see the gap for every model.
          </p>
          <p>
            Removing every drinking related word from the text lowers the best model from {dec(best.validation_macro_f1)} to {dec(noDrink("Structured fields and essay words, drinking words removed"))}. {pct(m.drinking_words.users_mentioning_pct, 1)} of users mention a drinking word, so some of the signal is people saying how they drink, but most is not.
          </p>
        </div>

        <ChartFrame
          title="More flexible settings fit the training data better and the validation data worse"
          badges={
            <>
              <SplitBadge kind="training" />
              <SplitBadge kind="validation" />
            </>
          }
          note={`The setting C controls how closely the model follows the training data. The best value, ${m.tuning_best_c}, is in the middle of the range tried, and tuning gained nothing over the default.`}
          table={{ columns: ["C", "Validation macro F1", "Fold spread", "Training macro F1"], rows: m.tuning.map((r) => [r.c, dec(r.validation_macro_f1), dec(r.fold_spread), dec(r.training_macro_f1)]) }}
          source="Source: notebook section 10.5, structured fields plus essay words, five fold cross validation on the training set."
          readout={r2}
        >
          <LineChart
            categories={m.tuning.map((r) => String(r.c))}
            xLabel="C (larger follows the training data more closely)"
            yLabel="Macro F1"
            yMin={0.3}
            yMax={1}
            format={(n) => n.toFixed(2)}
            onReadout={setR2}
            series={[
              { name: "Training score", tone: "alt", dash: "6 4", values: m.tuning.map((r) => r.training_macro_f1) },
              { name: "Validation score", tone: "main", values: m.tuning.map((r) => r.validation_macro_f1) },
            ]}
          />
        </ChartFrame>
      </Section>

      <Section id="clustering" title="Why clustering did not improve classification" lead="The second research question asks whether knowing a user's segment helps predict their drinking. It did not.">
        <ChartFrame
          title="Adding segments did not improve validation macro F1."
          badges={<SplitBadge kind="validation" />}
          note="Change in macro F1 in each of the five validation rounds. Bars to the left are worse, to the right better."
          table={{ columns: ["Round", "Change in macro F1"], rows: segFolds.map((f, i) => [i + 1, signed(f, 4)]) }}
          source={`Source: notebook section 10.6. Average change ${signed(m.segment_effect.mean_change, 4)}, spread between folds ${dec(m.segment_effect.fold_spread, 4)}.`}
          readout={r3}
        >
          <ul aria-label="Change in macro F1 per validation round" className="space-y-1.5">
            {segFolds.map((f, i) => {
              const scale = 0.005;
              const w = Math.min(50, (Math.abs(f) / scale) * 50);
              return (
                <li key={i}>
                  <button type="button" onMouseEnter={() => setR3(`Round ${i + 1}: ${signed(f, 4)}.`)} onFocus={() => setR3(`Round ${i + 1}: ${signed(f, 4)}.`)} onClick={() => setR3(`Round ${i + 1}: ${signed(f, 4)}.`)} className="grid w-full min-h-11 grid-cols-[4.5rem_1fr_4.5rem] items-center gap-3 rounded-md px-2 text-left hover:bg-bg">
                    <span className="text-[0.9375rem] font-medium text-heading">Round {i + 1}</span>
                    <span className="relative block h-5">
                      <span aria-hidden="true" className="absolute inset-0 rounded-sm bg-line" />
                      <span aria-hidden="true" className="absolute inset-y-[-3px] left-1/2 w-0.5 bg-heading" />
                      <span aria-hidden="true" className={cn("absolute inset-y-0 rounded-sm", f < 0 ? "bg-accent" : "bg-teal")} style={f < 0 ? { right: "50%", width: `${w}%` } : { left: "50%", width: `${w}%` }} />
                    </span>
                    <span className="text-right text-sm font-semibold tabular-nums text-heading">{signed(f, 4)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </ChartFrame>
        <div className="grid gap-4 lg:grid-cols-3">
          <p className="glass p-4">
            <strong className="text-heading">The segments add nothing new.</strong> They were built from the same essay meaning and lifestyle answers that the model already sees, so telling the model which segment a user is in repeats what it knew.
          </p>
          <p className="glass p-4">
            <strong className="text-heading">The segments are weakly separated.</strong> With a silhouette score of about {dec(lab.segments.silhouette.k6_about, 2)}, users blend into one another, so a segment label is a blunt summary of where a user sits.
          </p>
          <p className="glass p-4">
            <strong className="text-heading">They were built without the drinking answer.</strong> That keeps the check honest, but it also means nothing in them was designed to separate drinkers from non drinkers. A small possible bias exists, explained in the notebook: validation users took part in finding the segment centres.
          </p>
        </div>
      </Section>

      <Section id="test" title="Final results on the test set" lead="The model, its setting and the metric were fixed before the test set was opened, and nothing was changed afterwards.">
        <TestEvidence lab={lab} />
        <Callout title="What this means" tone="caution">
          <p>
            The model is a modest predictor, far better than guessing the most common answer and wrong for many individuals. {t.often_predicted_socially_pct}% of users who drink often are predicted &ldquo;socially&rdquo;, and {t.not_at_all_predicted_rarely_pct}% of non drinkers are predicted &ldquo;rarely&rdquo;. It suits a soft estimate shown with its
            uncertainty, never a decision about a person.
          </p>
        </Callout>
      </Section>
    </div>
  );
}
