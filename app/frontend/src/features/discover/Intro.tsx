import { Info } from "lucide-react";

const STEPS = ["Write or choose a fictional profile", "Choose how to compare", "Read why each profile matched"];

/** What Discovery does, in three steps, and the notice that similarity is not compatibility. Kept short so the form stays near the top. */
export function Intro() {
  return (
    <div className="mb-8 space-y-4">
      <div role="note" className="glass flex max-w-[48rem] gap-3 p-4">
        <Info aria-hidden="true" className="mt-1 size-5 shrink-0 text-gold" />
        <p>
          <strong className="font-semibold text-heading">Every profile here is fictional.</strong> They were written for this demonstration. Similar writing is not
          compatibility, and a high score does not mean two people would get on.
        </p>
      </div>
      <section aria-labelledby="how-it-works">
        <h2 id="how-it-works" className="sr-only">
          How it works
        </h2>
        <ol className="grid gap-2 md:grid-cols-3">
          {STEPS.map((step, i) => (
            <li key={step} className="glass flex items-center gap-3 px-4 py-3">
              <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gold-fill font-display text-base font-semibold text-on-gold">
                {i + 1}
              </span>
              <span className="font-medium text-heading">{step}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
