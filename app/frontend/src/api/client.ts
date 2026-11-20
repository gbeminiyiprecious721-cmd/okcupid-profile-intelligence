import type { components } from "./schema";

export type Health = components["schemas"]["HealthResponse"];
export type Meta = components["schemas"]["MetaResponse"];
export type SimilarRequest = components["schemas"]["SimilarRequest"];
export type SimilarResponse = components["schemas"]["SimilarResponse"];
export type MethodResult = components["schemas"]["MethodResult"];
export type Neighbour = components["schemas"]["Neighbour"];
export type ProfileDetail = components["schemas"]["ProfileDetail"];
export type Answers = components["schemas"]["Answers"];
export type Method = SimilarRequest["method"];
export type LabSummary = components["schemas"]["LabSummary"];
export type ClassifyExample = components["schemas"]["ClassifyExample"];
export type PredictResponse = components["schemas"]["PredictResponse"];

/** What went wrong, in terms the interface can act on. */
export type ErrorKind = "offline" | "timeout" | "invalid" | "too_large" | "unavailable" | "local_only" | "rate_limited" | "not_found" | "server" | "unknown";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly kind: ErrorKind = "unknown",
    readonly status?: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

const TIMEOUT_MS = 15_000;

function kindFor(status: number, code?: string): ErrorKind {
  if (status === 403 || code === "local_only") return "local_only";
  if (status === 429 || code === "rate_limited") return "rate_limited";
  if (status === 404) return "not_found";
  if (status === 413) return "too_large";
  if (status === 503 || code === "feature_unavailable") return "unavailable";
  if (status === 400 || status === 422) return "invalid";
  if (status >= 500) return "server";
  return "unknown";
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/v1${path}`, {
      ...init,
      headers: { Accept: "application/json", ...(init?.body ? { "Content-Type": "application/json" } : {}) },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new ApiError("The service took too long to answer.", "timeout");
    }
    throw new ApiError("The service did not answer.", "offline");
  }
  if (!response.ok) {
    let message = `The service answered with status ${response.status}.`;
    let code: string | undefined;
    try {
      const body = (await response.json()) as { error?: { code?: string; message?: string } };
      code = body.error?.code;
      // The server writes these messages and never repeats what was typed, so they are safe to show.
      if (body.error?.message) message = body.error.message;
    } catch {
      /* keep the generic message */
    }
    throw new ApiError(message, kindFor(response.status, code), response.status, code);
  }
  return (await response.json()) as T;
}

export const getHealth = () => request<Health>("/health");
export const getMeta = () => request<Meta>("/meta");
export const getLab = () => request<LabSummary>("/lab/summary");
export const getClassifyExamples = () => request<components["schemas"]["ClassifyExamplesResponse"]>("/classify/examples").then((r) => r.examples);
export const postPredict = (exampleId: string) => request<PredictResponse>("/classify/predict", { method: "POST", body: JSON.stringify({ example_id: exampleId }) });
export const getExamples = () => request<components["schemas"]["ExamplesResponse"]>("/examples").then((r) => r.examples);
export const getProfile = (id: string) => request<ProfileDetail>(`/discover/profiles/${encodeURIComponent(id)}`);
export const postSimilar = (body: SimilarRequest) => request<SimilarResponse>("/discover/similar", { method: "POST", body: JSON.stringify(body) });
