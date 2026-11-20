import type { Meta, Neighbour, ProfileDetail, SimilarResponse } from "../api/client";
import type { Override } from "./render";

/** Stand-in API responses for component tests. The real service is exercised by the browser tests. */
export const META: Meta = {
  mode: "public",
  version: "0.1.0",
  features: { discovery: true, lab_summary: false, classifier_demo: false, segment_assignment: false },
  pool: { size: 800, version: "test", synthetic: true },
  answer_options: { status: ["single", "married"], pets: ["has a cat", "has a dog"], diet_type: ["vegan", "anything"] },
  answer_shares: { status: { single: 0.915, married: 0.085 }, pets: { "has a cat": 0.08, "has a dog": 0.2 }, diet_type: { vegan: 0.05, anything: 0.95 } },
  local_only_features: [],
  limits: { max_text_chars: 2000, min_words: 3, min_neighbours: 1, max_neighbours: 10 },
  notice: "Fictional profiles only. Nothing you type is stored.",
};

export const profile = (id: string, handle: string, extra: Partial<ProfileDetail> = {}): ProfileDetail => ({
  profile_id: id,
  display_handle: handle,
  text: `Text of ${handle}. I like tea and old maps.`,
  themes: ["Books and creative"],
  lifestyle: { status: "single", pets: "has a cat" },
  is_synthetic: true,
  ...extra,
});

export const neighbour = (rank: number, id: string, handle: string, score: number, extra: Partial<Neighbour> = {}): Neighbour => ({
  rank,
  profile_id: id,
  display_handle: handle,
  score,
  lifestyle: { status: "single", pets: "has a cat" },
  shared_answers: [
    { field: "status", value: "single", share_of_pool: 0.915 },
    { field: "pets", value: "has a cat", share_of_pool: 0.08 },
  ],
  shared_terms: ["tea", "old maps"],
  themes: ["Books and creative", "Food"],
  shared_themes: ["Books and creative"],
  ...extra,
});

export const RESPONSE: SimilarResponse = {
  pool: { size: 800, version: "test", synthetic: true },
  input: { characters_received: 60, words_used: 11, personal_details_removed: {}, themes_detected: ["Books and creative"] },
  results: [
    {
      method: "embeddings",
      score_name: "Cosine similarity of sentence embeddings",
      note: null,
      neighbours: [neighbour(1, "syn_aaaaaaa1", "Warm Archer", 0.644), neighbour(2, "syn_aaaaaaa2", "Calm Scribe", 0.611, { shared_terms: [] })],
    },
    {
      method: "tfidf",
      score_name: "Cosine similarity of TF-IDF vectors",
      note: null,
      neighbours: [neighbour(1, "syn_aaaaaaa2", "Calm Scribe", 0.136), neighbour(2, "syn_aaaaaaa3", "Jolly Botanist", 0.121)],
    },
  ],
  comparison: { overlap_count: 1, in_both: ["syn_aaaaaaa2"], only_embeddings: ["syn_aaaaaaa1"], only_tfidf: ["syn_aaaaaaa3"], note: "The two scores are on different scales. Compare ranks within one method, not numbers across methods." },
  notice: "These are fictional profiles. Similar writing is not compatibility.",
};

export const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
export const apiError = (status: number, code: string, message: string) => json(status, { error: { code, message } });

/** Routes for the Discovery endpoints. Pass `search` to control the answer to a search. */
export function discoveryApi(search: (body: Record<string, unknown>) => Response | Promise<Response>, extra?: Override): Override {
  return (url, init) => {
    const custom = extra?.(url, init);
    if (custom) return custom;
    if (url.endsWith("/meta")) return json(200, META);
    if (url.endsWith("/examples")) return json(200, { examples: [profile("ex_00000001", "Starter One"), profile("ex_00000002", "Starter Two")] });
    if (url.endsWith("/discover/similar")) return search(JSON.parse(init?.body as string));
    const match = url.match(/\/discover\/profiles\/(.+)$/);
    if (match) {
      const names: Record<string, string> = { syn_aaaaaaa1: "Warm Archer", syn_aaaaaaa2: "Calm Scribe", syn_aaaaaaa3: "Jolly Botanist" };
      return names[match[1]] ? json(200, profile(match[1], names[match[1]])) : apiError(404, "not_found", "There is no profile with this identifier.");
    }
    return undefined;
  };
}

// ------------------------------------------------------------------ the classification demonstration
export const CLASSIFY_LEVELS = ["not at all", "rarely", "socially", "often+"] as const;
const RATES: Record<string, number> = { "not at all": 5.7, rarely: 10.5, socially: 73.3, "often+": 10.5 };

export const classifyExample = (n: number, handle: string, sex = "f") => ({
  example_id: `ex_0000000${n}`,
  display_handle: handle,
  text: `Fictional text of ${handle}.`,
  lifestyle: { smokes: "no", drugs: null, diet_type: "anything", education_level: "college", job: "other", offspring: null, pets: "likes cats", status: "single", body_type: "average" },
  persona: { age: 20 + n, height: 60 + n, languages_count: 2, education_status: "graduated", income_answered: 0, sex, location: "san francisco, california" },
});
export const CLASSIFY_EXAMPLES = ["Lively Printer", "Dapper Botanist", "Brisk Tailor", "Modest Mariner", "Calm Mariner", "Modest Skipper"].map((h, i) => classifyExample(i + 1, h, i % 2 ? "m" : "f"));

export const prediction = (exampleId: string, probabilities = [0.12, 0.5, 0.2, 0.18]) => ({
  example_id: exampleId,
  display_handle: CLASSIFY_EXAMPLES.find((e) => e.example_id === exampleId)?.display_handle ?? "x",
  classes: CLASSIFY_LEVELS.map((level, i) => ({ level, probability: probabilities[i], base_rate: RATES[level], is_predicted: probabilities[i] === Math.max(...probabilities) })),
  predicted: CLASSIFY_LEVELS[probabilities.indexOf(Math.max(...probabilities))],
  top_probability: Math.max(...probabilities),
  margin: 0.3,
  notice: "Educational and experimental.",
});

/** Local mode with the classifier loaded. `predict` answers a prediction request with the example id it received. */
export function classifyApi(predict: (body: { example_id?: string }) => Response | Promise<Response> = (b) => json(200, prediction(b.example_id!))): Override {
  return (url, init) => {
    if (url.endsWith("/meta")) return json(200, { ...META, mode: "local", features: { ...META.features, classifier_demo: true }, local_only_features: ["classifier_demo"] });
    if (url.endsWith("/classify/examples")) return json(200, { examples: CLASSIFY_EXAMPLES, notice: "Educational and experimental." });
    if (url.endsWith("/classify/predict")) return predict(JSON.parse(init?.body as string));
    return undefined;
  };
}
