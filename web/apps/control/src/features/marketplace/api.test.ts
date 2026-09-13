import { describe, expect, it, vi } from "vitest";
import { createMarketplaceApi, MOCK_STORAGE_KEY } from "./api";
import { createFixtures } from "./fixtures";
import { marketplaceDestination, type CreateResourceInput } from "./contracts";

const input: CreateResourceInput = {
  name: "Support guardrail",
  description: "Protect customer conversations.",
  businessArea: "Customer service",
  protections: ["personal-data"],
  checkpoints: ["input", "output"],
  allowedTopics: ["Product help"],
  restrictedTopics: [],
};
const listResponse = () => {
  const items = createFixtures().filter((item) => item.kind === "guardrails");
  return new Response(JSON.stringify({ items, count: items.length }));
};

describe("Marketplace API boundary", () => {
  it("keeps concurrent catalog reads in the same preview after one request fails", async () => {
    let finishTemplates!: (value: Response) => void;
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            finishTemplates = resolve;
          }),
      );
    const api = createMarketplaceApi({
      baseUrl: "/api/v1/marketplace",
      fetcher,
    });
    const guards = api.list("guardrails");
    const templates = api.list("templates");
    expect((await guards).source).toBe("mock");
    const items = createFixtures().filter((item) => item.kind === "templates");
    finishTemplates(
      new Response(JSON.stringify({ items, count: items.length })),
    );
    expect((await templates).source).toBe("mock");
    expect((await api.create("guardrails", input)).source).toBe("mock");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("starts without network requests and persists a template and a guardrail across clients", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
    };
    const api = createMarketplaceApi({ fetcher, storage });
    const template = await api.create("templates", input);
    const guardrail = await api.create("guardrails", {
      ...input,
      templateId: template.data.id,
    });
    expect(template.source).toBe("mock");
    const reloaded = createMarketplaceApi({ storage, fetcher });
    expect(
      (await reloaded.get("guardrails", guardrail.data.id)).data.templateId,
    ).toBe(template.data.id);
    expect((await reloaded.list("templates")).data.items).toContainEqual(
      template.data,
    );
    expect(fetcher).not.toHaveBeenCalled();
    expect(values.has(MOCK_STORAGE_KEY)).toBe(true);
  });

  it.each([503, 404, 429])(
    "falls back on a missing/unavailable catalog (%s) and creates locally afterward",
    async (status) => {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response("", { status }));
      const api = createMarketplaceApi({
        baseUrl: "/api/v1/marketplace",
        fetcher,
      });
      expect((await api.list("guardrails")).source).toBe("mock");
      expect((await api.create("guardrails", input)).source).toBe("mock");
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );

  it("falls back on a network error, malformed payload or a request timeout", async () => {
    for (const fetcher of [
      vi.fn<typeof fetch>().mockRejectedValue(new TypeError("Failed to fetch")),
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response("<html>SPA fallback</html>")),
      vi.fn<typeof fetch>().mockImplementation(
        (_url, init) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () =>
              reject(new Error("aborted")),
            );
          }),
      ),
    ]) {
      const api = createMarketplaceApi({
        baseUrl: "/api/v1/marketplace",
        fetcher,
        timeoutMs: 5,
      });
      expect((await api.list("templates")).source).toBe("mock");
    }
  });

  it.each([401, 403, 422])(
    "keeps real authorization/validation errors visible (%s)",
    async (status) => {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
        new Response(JSON.stringify({ message: "Access denied" }), {
          status,
        }),
      );
      await expect(
        createMarketplaceApi({ baseUrl: "/api/v1/marketplace", fetcher }).list(
          "guardrails",
        ),
      ).rejects.toThrow("Access denied");
    },
  );

  it("uses GET and POST on the documented resources with business fields only", async () => {
    const created = {
      ...createFixtures().find((item) => item.kind === "guardrails")!,
      ...input,
      id: "live-created",
    };
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(listResponse())
      .mockResolvedValueOnce(
        new Response(JSON.stringify(created), { status: 201 }),
      );
    const api = createMarketplaceApi({
      baseUrl: "https://marketplace.example/api/v1/marketplace/",
      fetcher,
    });
    const result = await api.create("guardrails", input);
    expect(result).toEqual({ data: created, source: "api" });
    expect(fetcher.mock.calls[0]![0]).toBe(
      "https://marketplace.example/api/v1/marketplace/guardrails",
    );
    expect(fetcher.mock.calls[1]![1]?.method).toBe("POST");
    expect(JSON.parse(fetcher.mock.calls[1]![1]?.body as string)).toEqual(
      input,
    );
  });

  it("does not report mock success when a live POST result is uncertain", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(listResponse())
      .mockRejectedValueOnce(new TypeError("Connection reset"));
    const api = createMarketplaceApi({
      baseUrl: "/api/v1/marketplace",
      fetcher,
    });
    await api.list("guardrails");
    await expect(api.create("guardrails", input)).rejects.toThrow(
      "couldn’t confirm",
    );
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("does not replace a missing live detail with an unrelated sample", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify({ message: "Not found" }), { status: 404 }),
      );
    await expect(
      createMarketplaceApi({ baseUrl: "/api/v1/marketplace", fetcher }).get(
        "guardrails",
        "missing",
      ),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("rejects empty intent before any request and recovers from corrupt local storage", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const api = createMarketplaceApi({
      fetcher,
      storage: {
        getItem: () => "broken json",
        setItem: () => {
          throw new Error("Storage full");
        },
      },
    });
    expect((await api.list("guardrails")).data.count).toBe(4);
    await expect(
      api.create("guardrails", { ...input, name: "  " }),
    ).rejects.toThrow();
    expect((await api.create("guardrails", input)).data.name).toBe(input.name);
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("Marketplace-only navigation", () => {
  it.each([
    "/",
    "/login",
    "/individual/create",
    "/individual/evaluation/catalog",
    "/individual/instances",
    "/individual/governance/guardrails",
    "/individual/governance/guardrails/example",
  ])("redirects %s to Guardrails", (path) => {
    expect(marketplaceDestination(path)).toBe("/guardrails");
  });
  it("maps legacy policy and template links to Templates", () => {
    expect(
      marketplaceDestination("/individual/governance/policy-library"),
    ).toBe("/templates");
    expect(marketplaceDestination("/templates/")).toBe("/templates");
    expect(marketplaceDestination("/guardrails")).toBeNull();
    expect(marketplaceDestination("/templates")).toBeNull();
  });
});
