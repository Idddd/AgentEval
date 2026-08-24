import { afterEach, describe, expect, it, vi } from "vitest";
import { createApiEvaluationStore } from "./api-store";
import { cloneEvaluationFixtures } from "./fixture-validation";
import type { EvaluationState } from "./model";

const state: EvaluationState = cloneEvaluationFixtures();

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("api-store", () => {
  it("hydrates from GET /state and keeps the fixture shape", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(state)));
    const store = createApiEvaluationStore({
      baseUrl: "http://test/api/v1/evaluations",
    });
    await vi.waitFor(() => expect(store.getState().targets).toHaveLength(2));
    expect(store.getState()).toEqual(state);
  });

  it("falls back to fixtures when the API is down", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("network down");
      }),
    );
    const store = createApiEvaluationStore({
      baseUrl: "http://test/api/v1/evaluations",
    });
    await vi.waitFor(() => expect(store.getState().targets.length).toBeGreaterThan(0));
    expect(store.getState().targets[0]!.id).toBe("target-permission-compliance");
  });

  it("mirrors createTarget to the API with the local id", async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (String(url).endsWith("/state")) return jsonResponse(state);
        calls.push({ url: String(url), body: JSON.parse(String(init?.body ?? "{}")) });
        const body = JSON.parse(String(init?.body ?? "{}"));
        return jsonResponse({
          id: body.id,
          name: body.name,
          description: body.description,
          currentRevisionId: body.revisionId,
          createdAt: "2026-08-06T00:00:00.000Z",
          updatedAt: "2026-08-06T00:00:00.000Z",
        });
      }),
    );
    const store = createApiEvaluationStore({
      baseUrl: "http://test/api/v1/evaluations",
    });
    await vi.waitFor(() => expect(store.getState().targets.length).toBeGreaterThan(0));
    const result = store.createTarget({
      name: "Brand New",
      description: "d",
      model: { id: "m", name: "M" },
      systemPrompt: "p",
    });
    expect(result.ok).toBe(true);
    const call = calls.find((item) => item.url.endsWith("/targets"));
    expect(call).toBeDefined();
    expect((call!.body as { id: string }).id).toBe(
      result.ok ? result.value.id : "",
    );
  });

  it("keeps the local result when the API returns 501", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).endsWith("/state")) return jsonResponse(state);
        return jsonResponse({ error: "not implemented", demo: true }, 501);
      }),
    );
    const store = createApiEvaluationStore({
      baseUrl: "http://test/api/v1/evaluations",
    });
    await vi.waitFor(() => expect(store.getState().targets.length).toBeGreaterThan(0));
    const before = store.getState().datasets.length;
    const result = store.createDataset({
      targetId: "target-permission-compliance",
      name: "D",
      description: "",
    });
    expect(result.ok).toBe(true);
    expect(store.getState().datasets.length).toBe(before + 1);
  });

  it("mirrors advanceRun and applies the server run", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).endsWith("/state")) return jsonResponse(state);
        if (String(url).endsWith("/advance")) {
          return jsonResponse({
            ...state.runs[0]!,
            status: "FAIL",
            stage: "reflect",
          });
        }
        return jsonResponse({ error: "not implemented", demo: true }, 501);
      }),
    );
    const store = createApiEvaluationStore({
      baseUrl: "http://test/api/v1/evaluations",
    });
    await vi.waitFor(() => expect(store.getState().runs.length).toBeGreaterThan(0));
    const result = store.advanceRun("run-permission-regression");
    expect(result.ok).toBe(true);
    await vi.waitFor(() => {
      const run = store
        .getState()
        .runs.find((item) => item.id === "run-permission-regression")!;
      expect(run.status).toBe("FAIL");
    });
  });
});
