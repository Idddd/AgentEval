import { z } from "zod";
import { ProjectStore } from "../projects/project-store";
import {
  createSecretStore,
  type SecretStore,
} from "../secrets/secret-store";

const searchRequestSchema = z.object({
  query: z.union([z.string().trim().min(1), z.array(z.string().trim().min(1)).min(1)]),
  filters: z.record(z.string(), z.unknown()).optional(),
  max_num_results: z.number().int().min(1).max(50).optional(),
  ranking_options: z.record(z.string(), z.unknown()).optional(),
  rewrite_query: z.boolean().optional(),
}).strict();

interface ElasticsearchHit {
  _id?: string;
  _index?: string;
  _score?: number | null;
  _source?: Record<string, unknown>;
}

interface ElasticsearchSearchResponse {
  hits?: {
    hits?: ElasticsearchHit[];
  };
}

export interface VectorStoreSearchResponse {
  object: "vector_store.search_results.page";
  search_query: string;
  data: Array<{
    score: number;
    content: Array<{ type: "text"; text: string }>;
    file_id: string;
    filename: string;
    attributes: Record<string, unknown>;
  }>;
}

export class ElasticsearchVectorStoreBridge {
  constructor(
    readonly store: ProjectStore,
    readonly secrets: SecretStore = createSecretStore(),
    readonly fetcher: typeof fetch = fetch,
  ) {}

  async search(vectorStoreId: string, input: unknown): Promise<VectorStoreSearchResponse> {
    const request = searchRequestSchema.parse(input);
    const source = (await this.store.listKnowledgeSourceDefinitions())
      .find((candidate) => candidate.vectorStoreId === vectorStoreId);
    if (!source || source.provider !== "elasticsearch") {
      throw new Error("Elasticsearch Vector Store was not found.");
    }
    if (!source.apiBase || !source.semanticField || !source.contentField) {
      throw new Error("Elasticsearch Vector Store configuration is incomplete.");
    }
    const apiBase = source.apiBase;
    const semanticField = source.semanticField;
    const contentField = source.contentField;

    const query = Array.isArray(request.query)
      ? request.query.join("\n")
      : request.query;
    const credential = await this.secrets.get(source.credentialReference);
    const filter = request.filters
      ? translateOpenAIFilter(request.filters)
      : undefined;
    const semanticQuery = {
      match: {
        [semanticField]: {
          query,
        },
      },
    };
    const response = await this.fetcher(
      `${apiBase.replace(/\/+$/, "")}/${encodeURIComponent(source.vectorStoreId)}/_search`,
      {
        method: "POST",
        headers: {
          authorization: elasticsearchAuthorization(credential),
          "content-type": "application/json",
        },
        body: JSON.stringify({
          size: request.max_num_results ?? source.topK,
          _source: [contentField],
          query: filter
            ? { bool: { must: [semanticQuery], filter: [filter] } }
            : semanticQuery,
        }),
        signal: AbortSignal.timeout(20_000),
      },
    );
    if (!response.ok) {
      throw new Error(`Elasticsearch search failed with HTTP ${response.status}.`);
    }
    const result = await response.json() as ElasticsearchSearchResponse;
    const hits = result.hits?.hits ?? [];
    return {
      object: "vector_store.search_results.page",
      search_query: query,
      data: hits.flatMap((hit) => {
        const text = nestedString(hit._source, contentField);
        if (!text) return [];
        const id = hit._id ?? "";
        const index = hit._index ?? source.vectorStoreId;
        return [{
          score: hit._score ?? 0,
          content: [{ type: "text" as const, text }],
          file_id: id,
          filename: `${index}/${id}`,
          attributes: { elasticsearch_index: index, elasticsearch_id: id },
        }];
      }),
    };
  }
}

function elasticsearchAuthorization(credential: string): string {
  const trimmed = credential.trim();
  if (!trimmed.startsWith("{")) {
    return trimmed.startsWith("ApiKey ") ? trimmed : `ApiKey ${trimmed}`;
  }
  const parsed = z.object({
    api_key: z.string().trim().min(1).optional(),
    authorization: z.string().trim().min(1).optional(),
    username: z.string().optional(),
    password: z.string().optional(),
  }).parse(JSON.parse(trimmed));
  if (parsed.authorization) return parsed.authorization;
  if (parsed.api_key) {
    return parsed.api_key.startsWith("ApiKey ")
      ? parsed.api_key
      : `ApiKey ${parsed.api_key}`;
  }
  if (parsed.username !== undefined && parsed.password !== undefined) {
    return `Basic ${Buffer.from(`${parsed.username}:${parsed.password}`).toString("base64")}`;
  }
  throw new Error("Elasticsearch credential must provide api_key, authorization, or username/password.");
}

function nestedString(source: Record<string, unknown> | undefined, path: string): string | undefined {
  let value: unknown = source;
  for (const segment of path.split(".")) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
    value = (value as Record<string, unknown>)[segment];
  }
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
    return value.join("\n");
  }
  return undefined;
}

function translateOpenAIFilter(filter: Record<string, unknown>): Record<string, unknown> {
  const type = z.string().parse(filter.type);
  if (type === "and" || type === "or") {
    const children = z.array(z.record(z.string(), z.unknown())).min(1).parse(filter.filters);
    return {
      bool: {
        [type === "and" ? "filter" : "should"]: children.map(translateOpenAIFilter),
        ...(type === "or" ? { minimum_should_match: 1 } : {}),
      },
    };
  }
  const key = z.string().trim().min(1).parse(filter.key);
  const value = filter.value;
  switch (type) {
    case "eq": return { term: { [key]: value } };
    case "ne": return { bool: { must_not: [{ term: { [key]: value } }] } };
    case "in": return { terms: { [key]: z.array(z.unknown()).parse(value) } };
    case "nin": return { bool: { must_not: [{ terms: { [key]: z.array(z.unknown()).parse(value) } }] } };
    case "gt":
    case "gte":
    case "lt":
    case "lte":
      return { range: { [key]: { [type]: value } } };
    default:
      throw new Error(`Unsupported Vector Store filter type: ${type}.`);
  }
}
