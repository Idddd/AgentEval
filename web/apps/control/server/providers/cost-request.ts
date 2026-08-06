import { z } from "zod";
import type { CostAnalyticsQuery, CostBreakdownQuery } from "./cost-service";

const groupBySchema = z.enum([
  "instance",
  "model_endpoint",
  "provider_account",
  "virtual_key",
]);
const filterKeySchema = z.enum([
  "instance",
  "model_endpoint",
  "provider",
  "provider_account",
  "virtual_key",
  "environment",
  "project",
]);
const filtersSchema = z.partialRecord(
  filterKeySchema,
  z.array(z.string().min(1)).max(100),
);

const commonSchema = z.object({
  startTime: z.string().min(1),
  endTime: z.string().min(1),
  timezone: z.string().min(1).default("UTC"),
  projectId: z.string().min(1).optional(),
  environmentId: z.string().min(1).optional(),
  filters: z.string().default("{}").transform((value, context) => {
    try {
      return filtersSchema.parse(JSON.parse(value));
    } catch {
      context.addIssue({ code: "custom", message: "filters must be a valid JSON object of string arrays." });
      return z.NEVER;
    }
  }),
});

export const costGroupBySchema = groupBySchema;

function scopedCommon(url: URL): CostAnalyticsQuery {
  const input = commonSchema.parse({
    startTime: url.searchParams.get("start_time"),
    endTime: url.searchParams.get("end_time"),
    timezone: url.searchParams.get("timezone") ?? undefined,
    projectId: url.searchParams.get("project_id") ?? undefined,
    environmentId: url.searchParams.get("environment_id") ?? undefined,
    filters: url.searchParams.get("filters") ?? undefined,
  });
  const projectMatch = url.pathname.match(
    /^\/api\/v1\/projects\/([^/]+)(?:\/|$)/,
  );
  const projectId = projectMatch
    ? decodeURIComponent(projectMatch[1]!)
    : "default";
  const environmentId = "production";
  if (input.projectId && input.projectId !== projectId) {
    throw new Error("Project access denied.");
  }
  if (input.environmentId && input.environmentId !== environmentId) {
    throw new Error("Environment access denied.");
  }
  return {
    startTime: input.startTime,
    endTime: input.endTime,
    timezone: input.timezone,
    projectId,
    environmentId,
    filters: input.filters,
  };
}

export function parseCostQuery(request: Request): CostAnalyticsQuery {
  return scopedCommon(new URL(request.url));
}

export function parseGroupBy(request: Request) {
  const value = new URL(request.url).searchParams.get("group_by") ?? "instance";
  return groupBySchema.parse(value);
}

export function parseActivityGranularity(request: Request) {
  const value = new URL(request.url).searchParams.get("granularity") ?? "daily";
  return z.enum(["daily", "weekly", "cumulative"]).parse(value);
}

export function parseTrendGranularity(request: Request) {
  const value = new URL(request.url).searchParams.get("granularity") ?? "day";
  return z.enum(["day", "week", "month"]).parse(value);
}

export function parseLimit(request: Request, name: "limit" | "top_n", fallback: number, maximum: number) {
  const raw = new URL(request.url).searchParams.get(name);
  return z.coerce.number().int().min(1).max(maximum).default(fallback).parse(raw ?? undefined);
}

export function parseBreakdownQuery(request: Request): CostBreakdownQuery {
  const url = new URL(request.url);
  const common = scopedCommon(url);
  const controls = z.object({
    groupBy: groupBySchema.default("instance"),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(200).default(25),
    sort: z.enum([
      "name",
      "spend_usd",
      "prompt_tokens",
      "completion_tokens",
      "total_tokens",
      "requests",
      "average_cost_per_request",
      "share",
      "last_active",
    ]).default("spend_usd"),
    direction: z.enum(["asc", "desc"]).default("desc"),
    search: z.string().max(200).default(""),
  }).parse({
    groupBy: url.searchParams.get("group_by") ?? undefined,
    page: url.searchParams.get("page") ?? undefined,
    pageSize: url.searchParams.get("page_size") ?? undefined,
    sort: url.searchParams.get("sort") ?? undefined,
    direction: url.searchParams.get("direction") ?? undefined,
    search: url.searchParams.get("search") ?? undefined,
  });
  return { ...common, ...controls };
}
