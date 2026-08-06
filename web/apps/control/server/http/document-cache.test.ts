import { describe, expect, it } from "vitest";
import { applyDocumentCacheHeaders } from "./document-cache";

describe("document cache headers", () => {
  it("prevents the application shell from surviving a rolling update", () => {
    const response = new Response("<!doctype html>", {
      headers: { "content-type": "text/html; charset=utf-8" },
    });

    applyDocumentCacheHeaders(response);

    expect(response.headers.get("cache-control")).toBe(
      "no-store, no-cache, must-revalidate, max-age=0",
    );
    expect(response.headers.get("pragma")).toBe("no-cache");
    expect(response.headers.get("expires")).toBe("0");
  });

  it("preserves immutable caching for fingerprinted assets", () => {
    const response = new Response("export {};", {
      headers: {
        "cache-control": "public, max-age=31536000, immutable",
        "content-type": "text/javascript",
      },
    });

    applyDocumentCacheHeaders(response);

    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=31536000, immutable",
    );
  });
});
