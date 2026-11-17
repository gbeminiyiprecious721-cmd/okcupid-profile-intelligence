import { ArrowRight, BarChart3, CalendarRange, CircleAlert, CircleCheck, Layers, Scale, Target, Users } from "lucide-react";
import { Link } from "react-router";
import { ApiError, type LabSummary } from "../api/client";
import { useLab } from "../api/hooks";
import { Button, buttonClass } from "../components/ui/Button";
import { FeatureCard, StatCard } from "../components/ui/Card";
import { ProfileNetwork } from "../components/ui/ProfileNetwork";
import { dec, int } from "../lib/format";

export default function Home() {
  return (
    <>
      <div className="grid items-center gap-8 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)] xl:gap-4">
        <header>
          <h1 tabIndex={-1} className="text-[2.5rem] font-semibold sm:text-6xl xl:text-[3.4rem]">
            What a <span className="text-gold-hero">dating profile</span> can and cannot tell us
          </h1>
          <p className="mt-5 max-w-[36rem] text-lg text-muted">
            A practical, end to end data science project that uses machine learning and natural language processing to explore patterns in dating profiles, with a focus on what we can learn and what we should not assume.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-2.5">
            <Link to="/discover" className={`${buttonClass.gold} min-h-12 px-4 text-[0.95rem] no-underline`}>
              Try Profile Discovery
              <ArrowRight aria-hidden="true" className="size-5" />
            </Link>
            <Link to="/lab" className={`${buttonClass.secondary} px-4 text-[0.95rem] no-underline`}>
              Explore the Research
            </Link>
            <Link to="/about" className={`${buttonClass.secondary} px-4 text-[0.95rem] no-underline`}>
              About the Project
            </Link>
          </div>
        </header>
        <ProfileNetwork className="mx-auto max-w-[36rem] xl:max-w-none" />
      </div>

      <section aria-labelledby="figures" className="mt-10">
        <h2 id="figures" className="sr-only">
          The research in four figures
        </h2>
        <Figures />
      </section>

      <section aria-labelledby="start" className="mt-12">
        <h2 id="start" className="sr-only">
          Where to start
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          <FeatureCard to="/discover" icon={Users} title="Profile Discovery">
            Write a fictional profile and see which profiles read most like it, with a plain reason for each. TF-IDF and sentence embeddings, side by side.
          </FeatureCard>
          <FeatureCard to="/lab" icon={BarChart3} title="Machine Learning Research">
            Explore the user segments, model performance and similarity evidence, and what the results really mean.
          </FeatureCard>
          <FeatureCard to="/lab/fairness" icon={Scale} title="Responsible AI">
            See the limits and fairness checks, and why these models should never be used to judge individuals.
          </FeatureCard>
        </div>
      </section>

      <Findings />

      <p className="mt-10 text-sm text-muted">
        Every profile you search here is invented, and nothing you type is stored. <Link to="/about">Read the limits</Link>.
      </p>
    </>
  );
}

/** The four headline figures, read from the same verified summary as the Data Science Lab pages. Nothing is typed in here. */
function Figures() {
  const lab = useLab();
  if (lab.isPending) {
    return (
      <div aria-busy="true" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <span className="sr-only">Loading the research figures.</span>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} aria-hidden="true" className="glass h-[5.5rem] animate-pulse motion-reduce:animate-none" />
        ))}
      </div>
    );
  }
  if (lab.isError) {
    const unavailable = lab.error instanceof ApiError && lab.error.kind === "unavailable";
    return (
      <div role="alert" className="glass flex flex-wrap items-center gap-3 p-4">
        <CircleAlert aria-hidden="true" className="size-5 text-accent" />
        <p>The research figures could not be loaded.</p>
        {!unavailable && (
          <Button variant="secondary" onClick={() => lab.refetch()}>
            Try again
          </Button>
        )}
      </div>
    );
  }
  const d = lab.data;
  const years = d.overview.dataset.period.match(/\b(?:19|20)\d{2}\b/g) ?? [];
  return (
    <ul aria-label="Research figures" className="grid list-none gap-3 p-0 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard icon={Users} label="Profiles analysed" value={int(d.overview.dataset.profiles)} />
      <StatCard icon={Layers} label="User segments" value={String(d.segments.items.length)} />
      <StatCard icon={Target} label="Macro F1 on the test set" value={dec(d.models.test.final.macro_f1)} hint={`Baseline ${dec(d.models.test.baseline.macro_f1)}`} />
      <StatCard icon={CalendarRange} label="Historical dataset" value={years.length > 1 ? `${years[0]}–${years.at(-1)}` : d.overview.dataset.period} hint="OkCupid teaching file" />
    </ul>
  );
}

function Findings() {
  const lab = useLab();
  if (!lab.data) return null;
  return <FindingsList lab={lab.data} />;
}

const NUMBER_WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

function FindingsList({ lab }: { lab: LabSummary }) {
  const t = lab.models.test;
  const older = lab.fairness.subgroups.find((s) => s.kind === "age_band" && s.group === "45 and over");
  const dataset = lab.overview.dataset;
  const found = [
    `The signal is modest. On users the model never saw, macro F1 is ${dec(t.final.macro_f1)}, against ${dec(t.baseline.macro_f1)} for always guessing the most common answer.`,
    `Profiles fall into ${NUMBER_WORDS[lab.segments.items.length] ?? lab.segments.items.length} groups, but the groups are weakly separated (silhouette about ${dec(lab.segments.silhouette.k6_about, 2)}), and adding them did not improve validation macro F1.`,
    older ? `Performance is uneven. Macro F1 is lower for users aged 45 and over (${dec(older.macro_f1)}), and for users who write little.` : "Performance is uneven across groups of users.",
  ];
  const limits = [
    "Similar writing is not compatibility. Nothing here shows that two people would match.",
    `The profiles are from ${dataset.period}, almost all in California, and the answers are self reported. They describe the past.`,
    "A pattern across thousands of profiles is not a fact about one person, and a prediction must never decide anything about someone.",
  ];
  return (
    <section aria-labelledby="findings" className="mt-14">
      <h2 id="findings" className="text-3xl font-semibold">
        What the research found, and what it cannot show
      </h2>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="glass p-5 sm:p-6">
          <h3 className="text-xl font-semibold">Findings</h3>
          <ul className="mt-3 space-y-3">
            {found.map((text) => (
              <li key={text} className="flex gap-3">
                <CircleCheck aria-hidden="true" className="mt-1 size-5 shrink-0 text-gold" />
                <span>{text}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="glass p-5 sm:p-6">
          <h3 className="text-xl font-semibold">Limits</h3>
          <ul className="mt-3 space-y-3">
            {limits.map((text) => (
              <li key={text} className="flex gap-3">
                <CircleAlert aria-hidden="true" className="mt-1 size-5 shrink-0 text-accent" />
                <span>{text}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
