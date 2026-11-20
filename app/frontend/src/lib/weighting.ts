/**
 * Inverse frequency weighting for shared lifestyle answers.
 *
 * Two profiles that both answer "single" have not told us much: 9 in 10 profiles in the pool say it.
 * Two profiles that both answer "has a cat" have told us more, because few profiles do.
 * The weight of a shared answer is its information in bits, the same idea as the IDF term in TF-IDF:
 *
 *     bits = log2(1 / share)        share = fraction of pool profiles giving this answer (from the API)
 *
 * The weight only decides how an answer is presented. It is never added to a score, and it never changes
 * which profiles are returned or in which order. The ranking is computed by the API from the text alone.
 */

export type Tier = "distinctive" | "moderate" | "common";

/** Shared by at most a quarter of the pool: 2 bits or more. */
export const DISTINCTIVE_MAX_SHARE = 0.25;
/** Shared by more than half of the pool: under 1 bit. These are folded away by default. */
export const COMMON_MIN_SHARE = 0.5;

export type SharedAnswer = { field: string; value: string; share_of_pool: number };
export type WeightedAnswer = SharedAnswer & { bits: number; tier: Tier };

export function informationBits(share: number): number {
  const safe = Math.min(1, Math.max(share, 1e-6));
  return 0 - Math.log2(safe); // "0 -" avoids a negative zero
}

export function tierOf(share: number): Tier {
  if (share <= DISTINCTIVE_MAX_SHARE) return "distinctive";
  if (share > COMMON_MIN_SHARE) return "common";
  return "moderate";
}

/** Most informative first. Equal weights keep the order they arrived in. */
export function weighSharedAnswers(answers: SharedAnswer[]): WeightedAnswer[] {
  const weighted = answers.map((answer, index) => ({
    index,
    weighted: { ...answer, bits: informationBits(answer.share_of_pool), tier: tierOf(answer.share_of_pool) },
  }));
  weighted.sort((a, b) => b.weighted.bits - a.weighted.bits || a.index - b.index);
  return weighted.map((entry) => entry.weighted);
}

export function splitByEmphasis(answers: SharedAnswer[]) {
  const weighted = weighSharedAnswers(answers);
  return {
    informative: weighted.filter((a) => a.tier !== "common"),
    common: weighted.filter((a) => a.tier === "common"),
  };
}

export function formatShare(share: number): string {
  const percent = share * 100;
  return percent < 1 ? "under 1%" : `${Math.round(percent)}%`;
}
