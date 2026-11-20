import { useState } from "react";
import type { LabSummary } from "../../api/client";
import { BarChart, ChartFrame, Choice, SplitBadge, type Bar } from "../../components/charts/charts";
import { cn } from "../../lib/cn";
import { dec, int } from "../../lib/format";

/** The test set results of the final model: headline scores, per group precision and recall, and the confusion matrix. */
export function TestEvidence({ lab }: { lab: LabSummary }) {
  const t = lab.models.test;
  const [metric, setMetric] = useState<"recall" | "precision" | "f1">("recall");
  const [r4, setR4] = useState<string | null>(null);
  const [r5, setR5] = useState<string | null>(null);
  const classMetric = (c: (typeof t.per_class)[number]) => (metric === "recall" ? c.recall : metric === "precision" ? c.precision : c.f1);
  const recallRange = (level: string) => t.intervals.find((i) => i.metric === `recall ${level}`);
  const classBars: Bar[] = t.per_class.map((c) => {
    const r = metric === "recall" ? recallRange(c.level) : undefined;
    return {
      id: c.level,
      label: c.level,
      sublabel: `${int(c.support)} test users`,
      value: classMetric(c),
      low: r?.low,
      high: r?.high,
      display: dec(classMetric(c)),
      tone: c.level === "socially" ? "alt" : "main",
      detail: `${c.level}: precision ${dec(c.precision)}, recall ${dec(c.recall)}, F1 ${dec(c.f1)}, ${int(c.support)} test users.${r ? ` Recall 95% range ${dec(r.low)} to ${dec(r.high)}.` : ""}`,
    };
  });

  const finalCi = t.intervals.find((i) => i.metric === "final model")!;
  const baseCi = t.intervals.find((i) => i.metric === "baseline")!;
  const gain = t.intervals.find((i) => i.metric === "gain over baseline")!;
  return (
    <>
        <ChartFrame
        title={`The final model scores ${dec(finalCi.score)} against ${dec(baseCi.score)} for guessing, a gain of ${dec(gain.score)}`}
        badges={
          <>
            <SplitBadge kind="test" />
            <SplitBadge kind="validation" />
          </>
        }
        note="Macro F1 with a 95% range from resampling the test users 1,000 times. The validation score is shown for comparison and sits inside the test range."
        table={{
          columns: ["Result", "Evaluated on", "Macro F1", "95% low", "95% high", "Accuracy"],
          rows: [
            ["Baseline", "Test", dec(baseCi.score), dec(baseCi.low), dec(baseCi.high), dec(t.baseline.accuracy)],
            ["Final model", "Test", dec(finalCi.score), dec(finalCi.low), dec(finalCi.high), dec(t.final.accuracy)],
            ["Final model", "Validation", dec(t.final.validation_macro_f1), "", "", ""],
          ],
        }}
        source={`Source: notebook sections 12.3 and 12.4, ${int(t.users)} test users. The gain of ${dec(gain.score)} has a 95% range of ${dec(gain.low)} to ${dec(gain.high)}.`}
        readout={r4}
      >
        <BarChart
          label="Macro F1 on the test set"
          max={0.6}
          onReadout={setR4}
          bars={[
            { id: "b", label: "Baseline", sublabel: "test score", value: baseCi.score, low: baseCi.low, high: baseCi.high, display: dec(baseCi.score), tone: "muted", detail: `Baseline, test score: ${dec(baseCi.score)} (95% range ${dec(baseCi.low)} to ${dec(baseCi.high)}).` },
            { id: "f", label: "Final model", sublabel: "test score", value: finalCi.score, low: finalCi.low, high: finalCi.high, display: dec(finalCi.score), tone: "main", detail: `Final model, test score: ${dec(finalCi.score)} (95% range ${dec(finalCi.low)} to ${dec(finalCi.high)}).` },
            { id: "v", label: "Final model", sublabel: "validation score", value: t.final.validation_macro_f1, display: dec(t.final.validation_macro_f1), tone: "alt", detail: `Final model, validation score: ${dec(t.final.validation_macro_f1)}. It agrees with the test score, so the cross validation estimate was reliable.` },
          ]}
        />
      </ChartFrame>
      <p className="max-w-[44rem]">
        Accuracy is {dec(t.final.accuracy)}, below the baseline&rsquo;s {dec(t.baseline.accuracy)}. This is deliberate: the model gives up some accuracy on the big group to find more of the small ones, which is exactly what macro F1 rewards.
      </p>

      <ChartFrame
        title="The model finds about half of social and frequent drinkers and four in ten of the others"
        badges={<SplitBadge kind="test" />}
        note="Precision: of the users predicted into a group, how many truly belong. Recall: of the users truly in a group, how many are found. Precision for the three smaller groups is low, so most predictions into them are wrong."
        table={{ columns: ["Drinking level", "Test users", "Precision", "Recall", "F1"], rows: t.per_class.map((c) => [c.level, int(c.support), dec(c.precision), dec(c.recall), dec(c.f1)]) }}
        source={`Source: notebook section 12.3. Macro average: precision ${dec(t.macro_precision)}, recall ${dec(t.macro_recall)}, F1 ${dec(t.final.macro_f1)}.`}
        readout={r5}
        controls={<Choice label="Metric" value={metric} onChange={setMetric} options={[{ value: "recall", label: "Recall" }, { value: "precision", label: "Precision" }, { value: "f1", label: "F1" }]} />}
      >
        <BarChart label={`${metric} by drinking level`} bars={classBars} max={1} onReadout={setR5} />
      </ChartFrame>

      <Confusion lab={lab} />
    </>
  );
}

export function Confusion({ lab }: { lab: LabSummary }) {
  const c = lab.models.confusion_pct;
  const [cell, setCell] = useState<string | null>(null);
  return (
    <ChartFrame
      title="Mistakes mostly go to the neighbouring group"
      badges={<SplitBadge kind="test" />}
      note="Each row is the true drinking level and adds to about 100%. The darker the cell, the larger the share. These are rounded whole number percentages transcribed from the notebook's figure. They are not recomputed here, so a row may not add to exactly 100."
      table={{ columns: ["True level", ...c.labels.map((l) => `Predicted ${l}`)], rows: c.rows.map((row, i) => [c.labels[i], ...row.map((v) => `${v}%`)]) }}
      source={`Source: notebook section 12.3, ${int(lab.models.test.users)} test users. ${c.source}`}
      readout={cell}
    >
      <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Confusion matrix, scrolls sideways on small screens">
        <table className="w-full min-w-[26rem] border-separate border-spacing-1 text-center">
          <caption className="sr-only">Confusion matrix: share of each true drinking level that was predicted into each level, rounded values transcribed from the notebook figure</caption>
          <thead>
            <tr>
              <td />
              {c.labels.map((l) => (
                <th key={l} scope="col" className="px-1 pb-1 text-sm font-medium text-muted">
                  Predicted
                  <br />
                  <span className="text-heading">{l}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {c.rows.map((row, i) => (
              <tr key={c.labels[i]}>
                <th scope="row" className="pr-2 text-right text-sm font-medium">
                  <span className="text-muted">True </span>
                  <span className="text-heading">{c.labels[i]}</span>
                </th>
                {row.map((v, j) => (
                  <td key={j} className="p-0">
                    <button
                      type="button"
                      aria-label={`${v}% of users who truly are ${c.labels[i]} were predicted ${c.labels[j]}`}
                      onMouseEnter={() => setCell(`${v}% of users who truly are "${c.labels[i]}" were predicted "${c.labels[j]}".`)}
                      onFocus={() => setCell(`${v}% of users who truly are "${c.labels[i]}" were predicted "${c.labels[j]}".`)}
                      onClick={() => setCell(`${v}% of users who truly are "${c.labels[i]}" were predicted "${c.labels[j]}".`)}
                      className={cn("h-14 w-full min-w-14 rounded-md text-base font-semibold tabular-nums text-heading", i === j && "outline outline-2 -outline-offset-2 outline-heading")}
                      style={{ background: `color-mix(in srgb, var(--teal) ${Math.round(v * 0.8)}%, var(--bg))` }}
                    >
                      {v}%
                    </button>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-sm text-muted">Cells with a dark outline are correct predictions. Rounded values transcribed from the notebook figure.</p>
    </ChartFrame>
  );
}
