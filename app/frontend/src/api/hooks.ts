import { useMutation, useQuery } from "@tanstack/react-query";
import { getClassifyExamples, getExamples, getLab, getHealth, getMeta, getProfile, postPredict, postSimilar } from "./client";

export function useHealth() {
  return useQuery({ queryKey: ["health"], queryFn: getHealth, refetchInterval: 30_000, retry: 1 });
}

export function useMeta() {
  return useQuery({ queryKey: ["meta"], queryFn: getMeta, retry: 1, staleTime: 5 * 60_000 });
}

export function useExamples(enabled: boolean) {
  return useQuery({ queryKey: ["examples"], queryFn: getExamples, enabled, retry: 1, staleTime: Infinity });
}

export function useProfile(id: string | null) {
  return useQuery({ queryKey: ["profile", id], queryFn: () => getProfile(id as string), enabled: id !== null, retry: 1, staleTime: Infinity });
}

/** A search is a user action, so it is a mutation. It is never retried: a retry would look like a second search. */
export function useSimilarSearch() {
  return useMutation({ mutationFn: postSimilar, retry: false });
}

/** The approved aggregate findings. They never change while the service runs, so they are fetched once. */
export function useLab() {
  return useQuery({ queryKey: ["lab"], queryFn: getLab, retry: 1, staleTime: Infinity });
}

export function useClassifyExamples(enabled: boolean) {
  return useQuery({ queryKey: ["classify-examples"], queryFn: getClassifyExamples, enabled, retry: 1, staleTime: Infinity });
}

/** Running the classifier is a user action. Only an example name is sent, so there is no visitor input to keep. */
export function usePredict() {
  return useMutation({ mutationFn: postPredict, retry: false });
}
