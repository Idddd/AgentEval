import { describe, expect, it } from "vitest";
import { createF5Client, f5Configuration, scannerBody, scanEvidence, mergeProjectConfig } from "./f5-client";

const scannerId = "0195b395-4c48-7061-833c-e78e946969ba";
const version = "01982c91-c665-7082-a8b8-b400bac9ec4d";
describe("F5 documented contract", () => {
  it("keeps F5 optional but refuses incomplete or unsafe enabled configuration", () => {
    expect(f5Configuration({})).toBeUndefined();
    for (const url of ["https://f5.local/backend/v1?token=x", "https://u:p@f5.local/backend/v1", "https://f5.local", "http://f5.local/backend/v1"]) {
      expect(() => f5Configuration({ F5_API_URL: url, F5_API_TOKEN: "private" })).toThrow();
    }
    expect(() => f5Configuration({ F5_API_URL: "https://f5.local/backend/v1" })).toThrow();
  });
  it("sends only server credentials and never follows redirects or exposes upstream secrets", async () => {
    const config = f5Configuration({ F5_API_URL: "https://f5.local/backend/v1/", F5_API_TOKEN: "private" })!;
    const calls: any[] = [];
    const client = createF5Client(config, async (url, init) => {
      calls.push({ url, init });
      return Response.json({ token: "private", message: "private" }, { status: 401 });
    });
    await expect(client.request("/scanners")).rejects.toThrow("F5 request failed (401)");
    expect(calls[0].url).toBe("https://f5.local/backend/v1/scanners");
    expect(calls[0].init.headers.Authorization).toBe("Bearer private");
    expect(calls[0].init.redirect).toBe("manual");
    await expect(client.request("//evil.example")).rejects.toThrow();
    expect(calls).toHaveLength(1);
    expect(f5Configuration({ F5_API_URL: "https://other.local/backend/v1", F5_API_TOKEN: "private" })!.sourceId).not.toBe(config.sourceId);
  });
  it.each([
    ["keyword", "secret, password\ncredential", { type: "keyword", words: ["secret", "password", "credential"] }],
    ["regex", "secret.*", { type: "regex", pattern: "secret.*" }],
    ["custom", "Political figures", { type: "custom", input: "Political figures", scanContext: "directional" }],
  ] as const)("maps %s to the vendor schema with private unpublished versions", (scannerType, content, config) => {
    expect(scannerBody("MP test", { scannerType, content, direction: "both", versionName: "v1", versionDescription: "review" })).toEqual({
      name: "MP test", config, direction: "both", global: false, published: false,
      version: { name: "v1", description: "review", published: false, push: false },
    });
  });
  it("preserves unrelated Project fields while updating exact scanner versions", () => {
    const original = { id: "cfg", providers: [{ id: "provider" }], packages: [{ id: "package" }], scanners: [{ id: scannerId, version: "old", flagMessage: "Keep" }, { id: "other", enabled: false }] };
    expect(mergeProjectConfig(original, [{ id: scannerId, version, enabled: true, blocking: true, mode: "block", direction: "request" }])).toEqual({ ...original,
      scanners: [{ id: scannerId, version, enabled: true, blocking: true, mode: "block", direction: "request", flagMessage: "Keep" }, { id: "other", enabled: false }],
    });
  });
  it("requires a real result for the exact scanner version and direction", () => {
    const response = { id: "scan-1", result: { outcome: "flagged", scannerResults: [{ scannerId, scannerVersionMeta: { id: version }, scanDirection: "request", outcome: "failed" }] } };
    expect(scanEvidence(response, scannerId, version, "input", "block", "case-1")).toMatchObject({ passed: true, actualDecision: "block", scanId: "scan-1" });
    for (const change of [{ scannerId: "wrong" }, { scannerVersionMeta: { id: "wrong" } }, { outcome: "error" }, { scanDirection: "response" }]) {
      expect(() => scanEvidence({ ...response, result: { ...response.result, scannerResults: [{ ...response.result.scannerResults[0], ...change }] } }, scannerId, version, "input", "block", "case-1")).toThrow();
    }
    expect(() => scanEvidence({ result: { outcome: "cleared", scannerResults: [] } }, scannerId, version, "input", "allow", "case-1")).toThrow();
  });
});

it("logs successful and failed requests without credentials or content, with a shared trace ID", async () => {
  const { vi } = await import("vitest");
  const log = vi.spyOn(console, "info").mockImplementation(() => {});
  try {
    const config = f5Configuration({ F5_API_URL: "https://f5.local/backend/v1", F5_API_TOKEN: "private-credential" })!;
    const calls: RequestInit[] = [];
    const client = createF5Client(config, async (_, init) => { calls.push(init!); return Response.json({ id: "remote-id" }); });
    await client.request("/scans", "POST", { input: "sensitive scan text" });
    const failure = createF5Client(config, async () => Response.json({ message: "private-credential" }, { status: 403 }));
    await expect(failure.request("/scanners")).rejects.toThrow(/403/);
    const events = log.mock.calls.map(([value]) => JSON.parse(value));
    expect(events.filter(e => e.event === "f5_request_completed")).toHaveLength(2);
    const success = events.find(e => e.event === "f5_request_completed" && e.outcome === "success");
    expect(success).toMatchObject({ sourceId: config.sourceId, status: 200, durationMs: expect.any(Number), requestId: expect.any(String) });
    expect(new Headers(calls[0]!.headers).get("x-request-id")).toBe(success.requestId);
    expect(events.some(e => e.code === "f5_http_403")).toBe(true);
    expect(JSON.stringify(events)).not.toMatch(/private-credential|sensitive scan text/);
  } finally { log.mockRestore(); }
});
