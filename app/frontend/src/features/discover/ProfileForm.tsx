import { Brain, GitCompare, Loader2, Search, Sparkles, Type, type LucideIcon } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import type { Answers, Meta, Method, ProfileDetail, SimilarRequest } from "../../api/client";
import { Button } from "../../components/ui/Button";
import { cn } from "../../lib/cn";
import { FIELD_ORDER, fieldLabel } from "../../lib/labels";

const METHODS: { value: Method; label: string; help: string; icon: LucideIcon }[] = [
  { value: "both", label: "Compare both", icon: GitCompare, help: "Two separate lists, one per method. Their scores are on different scales." },
  { value: "embeddings", label: "Sentence embeddings", icon: Brain, help: "Compares meaning. Finds profiles that say similar things in different words." },
  { value: "tfidf", label: "TF-IDF", icon: Type, help: "Compares the words themselves. Finds profiles that share distinctive words." },
];

export const wordCount = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

/** The same limits the service enforces, so most mistakes are caught before a request is sent. */
export function validateText(text: string, limits: Meta["limits"]): string | null {
  if (wordCount(text) === 0) return "Write a few sentences about your fictional person first.";
  if (text.length > limits.max_text_chars) return `That is ${text.length - limits.max_text_chars} characters over the limit of ${limits.max_text_chars}. Shorten it.`;
  if (wordCount(text) < limits.min_words) return `Write at least ${limits.min_words} words so there is something to compare.`;
  return null;
}

type Props = {
  meta: Meta;
  examples: ProfileDetail[];
  examplesLoading?: boolean;
  pending: boolean;
  serverError: string | null;
  onSubmit: (request: SimilarRequest) => void;
  onReset: () => void;
};

export function ProfileForm({ meta, examples, examplesLoading = false, pending, serverError, onSubmit, onReset }: Props) {
  const id = useId();
  const [text, setText] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [method, setMethod] = useState<Method>("both");
  const [k, setK] = useState(5);
  const [touched, setTouched] = useState(false);
  const [open, setOpen] = useState(false);

  const localError = touched ? validateText(text, meta.limits) : null;
  const error = localError ?? serverError;
  const over = text.length > meta.limits.max_text_chars;

  function submit(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (validateText(text, meta.limits)) return;
    const given = Object.fromEntries(Object.entries(answers).filter(([, v]) => v)) as Answers;
    onSubmit({ text, answers: given, method, k });
  }

  function fillFrom(profile: ProfileDetail) {
    setText(profile.text);
    setAnswers(Object.fromEntries(Object.entries(profile.lifestyle).filter(([, v]) => v)) as Record<string, string>);
    setTouched(false);
  }

  function reset() {
    setText("");
    setAnswers({});
    setMethod("both");
    setK(5);
    setTouched(false);
    onReset();
  }

  return (
    <form onSubmit={submit} noValidate aria-labelledby={`${id}-title`} className="glass p-5 sm:p-6">
      <h2 id={`${id}-title`} className="text-2xl font-semibold">
        Your fictional profile
      </h2>
      <p className="mt-2 text-muted">Describe an invented person. Links, emails and phone numbers are removed before searching, and nothing you type is stored.</p>

      {examplesLoading && examples.length === 0 && (
        // Holds the space of the starter buttons while they load, so the form does not jump when they arrive.
        <div className="mt-5" aria-hidden="true">
          <p className="font-medium text-heading">Start from an example</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <span key={i} className="inline-block h-11 w-[7.5rem] rounded-full border border-line bg-bg" />
            ))}
          </div>
        </div>
      )}
      {examples.length > 0 && (
        <div className="mt-5">
          <p id={`${id}-examples`} className="font-medium text-heading">
            Start from an example
          </p>
          <div role="group" aria-labelledby={`${id}-examples`} className="mt-2 flex flex-wrap gap-2">
            {examples.map((profile) => (
              <button
                key={profile.profile_id}
                type="button"
                onClick={() => fillFrom(profile)}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-glass bg-bg px-4 text-sm font-medium transition-[border-color,background-color,transform] hover:border-gold hover:bg-card active:translate-y-px motion-reduce:transition-none"
              >
                <Sparkles aria-hidden="true" className="size-3.5 text-gold" />
                {profile.display_handle}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-5">
        <label htmlFor={`${id}-text`} className="font-medium text-heading">
          Profile text
        </label>
        <textarea
          id={`${id}-text`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => text && setTouched(true)}
          rows={7}
          aria-invalid={error ? true : undefined}
          aria-describedby={cn(`${id}-count`, error && `${id}-error`)}
          placeholder="I spend weekends in second hand bookshops and I am slowly learning to bake bread."
          className={cn("mt-2 w-full resize-y rounded-xl border bg-bg p-3.5 text-fg transition-shadow placeholder:text-muted focus:shadow-[0_0_0_4px_var(--glow)] motion-reduce:transition-none", error ? "border-accent" : "border-control")}
        />
        <div className="mt-1 flex items-start justify-between gap-3 text-sm">
          <p id={`${id}-error`} className="text-accent">
            {error}
          </p>
          <p id={`${id}-count`} className={cn("ml-auto shrink-0", over ? "font-semibold text-accent" : "text-muted")}>
            {text.length} of {meta.limits.max_text_chars} characters
          </p>
        </div>
      </div>

      <details open={open} onToggle={(e) => setOpen(e.currentTarget.open)} className="mt-4 rounded-xl border border-glass bg-bg">
        <summary className="min-h-11 cursor-pointer px-3 py-2.5 font-medium text-heading">Lifestyle answers, optional</summary>
        <div className="px-3 pb-4">
          <p className="text-sm text-muted">Used only to explain the results. They never change which profiles are found or their order.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {FIELD_ORDER.filter((field) => meta.answer_options[field]).map((field) => (
              <div key={field}>
                <label htmlFor={`${id}-${field}`} className="text-sm font-medium text-heading">
                  {fieldLabel(field)}
                </label>
                <select
                  id={`${id}-${field}`}
                  value={answers[field] ?? ""}
                  onChange={(e) => setAnswers((a) => ({ ...a, [field]: e.target.value }))}
                  className="mt-1 min-h-11 w-full rounded-lg border border-control bg-bg px-2"
                >
                  <option value="">No answer</option>
                  {meta.answer_options[field].map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      </details>

      <fieldset className="mt-5">
        <legend className="font-medium text-heading">How to compare</legend>
        <div className="mt-2 space-y-2">
          {METHODS.map((option) => (
            <label
              key={option.value}
              className={cn(
                "flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border p-3 transition-[border-color,box-shadow] has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus motion-reduce:transition-none",
                method === option.value ? "border-gold bg-bg shadow-[0_8px_22px_-12px_var(--glow)]" : "border-line hover:border-glass",
              )}
            >
              <input type="radio" name={`${id}-method`} value={option.value} checked={method === option.value} onChange={() => setMethod(option.value)} className="mt-1.5 size-4 accent-[var(--primary)]" />
              <span>
                <span className="flex items-center gap-1.5 font-medium text-heading">
                  <option.icon aria-hidden="true" className="size-4 text-gold" />
                  {option.label}
                </span>
                <span className="block text-sm text-muted">{option.help}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="mt-5">
        <label htmlFor={`${id}-k`} className="font-medium text-heading">
          Profiles per list
        </label>
        <select id={`${id}-k`} value={k} onChange={(e) => setK(Number(e.target.value))} className="ml-3 min-h-11 rounded-lg border border-control bg-bg px-3">
          {[5, 10].filter((n) => n >= meta.limits.min_neighbours && n <= meta.limits.max_neighbours).map((n) => (
            <option key={n} value={n}>
              Top {n}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <Button type="submit" variant="gold" className="min-h-12 w-full px-6 text-base active:translate-y-px sm:w-auto" disabled={pending} aria-busy={pending}>
          {pending ? <Loader2 aria-hidden="true" className="size-5 motion-safe:animate-spin" /> : <Search aria-hidden="true" className="size-5" />}
          {pending ? "Searching" : "Find similar profiles"}
        </Button>
        <Button variant="secondary" onClick={reset} disabled={pending}>
          Clear
        </Button>
      </div>
    </form>
  );
}
