import {
  collectionSchema,
  createResourceSchema,
  resourceSchema,
  type ApiResult,
  type CreateResourceInput,
  type DataSource,
  type MarketplaceApi,
  type MarketplaceResource,
  type ResourceCollection,
  type ResourceKind,
} from "./contracts";
import { createFixtures } from "./fixtures";

export const MOCK_STORAGE_KEY = "ai-marketplace.resources.v1";
export class MarketplaceApiError extends Error {
  constructor(
    message: string,
    public status = 0,
  ) {
    super(message);
    this.name = "MarketplaceApiError";
  }
}
type Options = {
  baseUrl?: string;
  fetcher?: typeof fetch;
  storage?: Pick<Storage, "getItem" | "setItem">;
  timeoutMs?: number;
};

/** Default: local preview. An explicitly configured base URL enables the HTTP adapter. */
export function createMarketplaceApi(options: Options = {}): MarketplaceApi {
  const baseUrl = options.baseUrl?.trim().replace(/\/+$/, "");
  const fetcher = options.fetcher ?? fetch;
  let mode: DataSource | "unresolved" = baseUrl ? "unresolved" : "mock";
  let records: MarketplaceResource[] | undefined;
  const usingPreview = () => mode === "mock";

  function localRecords() {
    if (!records) {
      records = createFixtures();
      try {
        const saved = options.storage?.getItem(MOCK_STORAGE_KEY);
        if (saved) {
          const parsed = resourceSchema.array().safeParse(JSON.parse(saved));
          if (parsed.success) {
            const seedIds = new Set(records.map((item) => item.id));
            records = [
              ...records,
              ...parsed.data.filter((item) => !seedIds.has(item.id)),
            ];
          }
        }
      } catch {
        /* Unavailable/corrupt preview storage does not prevent browsing. */
      }
    }
    return records;
  }

  async function request(path: string, init?: RequestInit): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      options.timeoutMs ?? 3000,
    );
    try {
      const response = await fetcher(`${baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
        credentials: "same-origin",
        headers: { Accept: "application/json", ...init?.headers },
      });
      if (!response.ok) {
        let message = `Request failed (${response.status}).`;
        try {
          const body = await response.json();
          if (typeof body.message === "string") message = body.message;
        } catch {
          /* Use status text. */
        }
        throw new MarketplaceApiError(message, response.status);
      }
      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  }

  async function read<T>(
    path: string,
    parse: (value: unknown) => T,
    local: () => T,
    detail = false,
  ): Promise<ApiResult<T>> {
    if (mode === "mock") return { data: local(), source: "mock" };
    try {
      const data = parse(await request(path));
      // Another catalog request may have failed while this one was in flight.
      // Keep a single coherent preview workspace until the page is reloaded.
      if (usingPreview()) return { data: local(), source: "mock" };
      mode = "api";
      return { data, source: "api" };
    } catch (error) {
      // Authentication, authorization and missing live records must remain real errors.
      if (
        error instanceof MarketplaceApiError &&
        (error.status === 401 ||
          error.status === 403 ||
          (detail && error.status === 404) ||
          (error.status >= 400 &&
            error.status < 500 &&
            error.status !== 404 &&
            error.status !== 408 &&
            error.status !== 429))
      )
        throw error;
      mode = "mock";
      return { data: local(), source: "mock" };
    }
  }

  return {
    list(kind): Promise<ApiResult<ResourceCollection>> {
      return read(
        `/${kind}`,
        (value) => {
          const parsed = collectionSchema.parse(value);
          if (parsed.items.some((item) => item.kind !== kind))
            throw new Error("Unexpected collection type.");
          return parsed;
        },
        () => {
          const items = localRecords().filter((item) => item.kind === kind);
          return { items, count: items.length };
        },
      );
    },
    get(kind, id) {
      return read(
        `/${kind}/${encodeURIComponent(id)}`,
        (value) => {
          const parsed = resourceSchema.parse(value);
          if (parsed.id !== id || parsed.kind !== kind)
            throw new Error("Unexpected resource.");
          return parsed;
        },
        () => {
          const item = localRecords().find(
            (item) => item.kind === kind && item.id === id,
          );
          if (!item)
            throw new MarketplaceApiError("This item could not be found.", 404);
          return item;
        },
        true,
      );
    },
    async create(kind: ResourceKind, input: CreateResourceInput) {
      const body = createResourceSchema.parse(input);
      // Probe with a read before writing when opening the creation dialog directly.
      if (mode === "unresolved") await this.list(kind);
      if (mode === "mock") {
        const now = new Date().toISOString();
        const item: MarketplaceResource = {
          ...body,
          id: `${kind === "templates" ? "template" : "guardrail"}-${crypto.randomUUID()}`,
          kind,
          status: kind === "templates" ? "available" : "draft",
          createdAt: now,
          updatedAt: now,
          createdBy: "You (local preview)",
        };
        localRecords().push(item);
        const seedIds = new Set(createFixtures().map((seed) => seed.id));
        try {
          options.storage?.setItem(
            MOCK_STORAGE_KEY,
            JSON.stringify(
              localRecords().filter((record) => !seedIds.has(record.id)),
            ),
          );
        } catch {
          /* Still available for this session. */
        }
        return { data: item, source: "mock" };
      }
      try {
        const result = resourceSchema.parse(
          await request(`/${kind}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }),
        );
        if (result.kind !== kind) throw new Error("Unexpected resource type.");
        return { data: result, source: "api" };
      } catch (error) {
        if (
          error instanceof MarketplaceApiError &&
          error.status >= 400 &&
          error.status < 500
        )
          throw error;
        throw new MarketplaceApiError(
          "We couldn’t confirm that this item was created. Your entries are kept here. Check the catalog before trying again.",
        );
      }
    },
  };
}
