import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, getProfile, postSimilar } from "./client";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

afterEach(() => vi.unstubAllGlobals());

describe("api client errors", () => {
  it.each([
    [422, "text_too_short", "invalid"],
    [413, "payload_too_large", "too_large"],
    [404, "not_found", "not_found"],
    [503, "feature_unavailable", "unavailable"],
    [500, "internal_error", "server"],
  ])("maps status %i to %s", async (status, code, kind) => {
    vi.stubGlobal("fetch", vi.fn(async () => json(status, { error: { code, message: "Server wording." } })));
    const error = await postSimilar({ text: "x", method: "both", k: 5 }).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.kind).toBe(kind);
    expect(error.message).toBe("Server wording.");
  });

  it("reports an unreachable service as offline", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("down"))));
    expect(await getProfile("syn_00000000").catch((e) => e)).toMatchObject({ kind: "offline" });
  });

  it("reports a timeout separately", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new DOMException("slow", "TimeoutError"))));
    expect(await getProfile("syn_00000000").catch((e) => e)).toMatchObject({ kind: "timeout" });
  });

  it("falls back to a generic message when the body is not JSON", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>", { status: 502 })));
    const error = await getProfile("syn_00000000").catch((e) => e);
    expect(error.kind).toBe("server");
    expect(error.message).toContain("502");
  });

  it("sends the request body as JSON to the versioned path", async () => {
    const fetchMock = vi.fn(async () => json(200, {}));
    vi.stubGlobal("fetch", fetchMock);
    await postSimilar({ text: "hello there friend", method: "tfidf", k: 5 });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/v1/discover/similar");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ text: "hello there friend", method: "tfidf", k: 5 });
  });
});
