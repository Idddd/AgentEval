import { z } from "zod";

export const businessAreas = [
  "General",
  "Customer service",
  "People & HR",
  "Finance",
  "Sales & marketing",
] as const;
export const protectionIds = [
  "personal-data",
  "confidential-data",
  "harmful-content",
  "prompt-injection",
  "topic-boundaries",
  "accurate-responses",
] as const;
export const protectionCatalog = [
  {
    id: "personal-data",
    name: "Personal information",
    description: "Keep personal and identifying information private.",
    icon: "privacy",
  },
  {
    id: "confidential-data",
    name: "Confidential information",
    description: "Protect company secrets, credentials and internal data.",
    icon: "lock",
  },
  {
    id: "harmful-content",
    name: "Harmful content",
    description: "Set boundaries for unsafe or inappropriate content.",
    icon: "shield",
  },
  {
    id: "prompt-injection",
    name: "Instruction attacks",
    description: "Protect against requests to bypass your AI’s instructions.",
    icon: "shield",
  },
  {
    id: "topic-boundaries",
    name: "Topic boundaries",
    description: "Keep conversations within your business purpose.",
    icon: "topic",
  },
  {
    id: "accurate-responses",
    name: "Grounded answers",
    description: "Ask for answers supported by approved information.",
    icon: "check",
  },
] as const;

export const createResourceSchema = z.object({
  name: z.string().trim().min(1, "Enter a name.").max(100),
  description: z
    .string()
    .trim()
    .min(1, "Describe the business purpose.")
    .max(2000),
  businessArea: z.enum(businessAreas),
  protections: z
    .array(z.enum(protectionIds))
    .min(1, "Choose at least one protection."),
  checkpoints: z
    .array(z.enum(["input", "output"]))
    .min(1, "Choose at least one checkpoint."),
  allowedTopics: z.array(z.string().trim().min(1).max(200)).max(20),
  restrictedTopics: z.array(z.string().trim().min(1).max(200)).max(20),
  templateId: z.string().min(1).optional(),
});
export const resourceSchema = createResourceSchema.extend({
  id: z.string().min(1),
  kind: z.enum(["guardrails", "templates"]),
  status: z.enum(["draft", "available"]),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
  createdBy: z.string().min(1),
});
export const collectionSchema = z.object({
  items: z.array(resourceSchema),
  count: z.number().int().nonnegative(),
});
export type ResourceKind = "guardrails" | "templates";
export type BusinessArea = (typeof businessAreas)[number];
export type ProtectionId = (typeof protectionIds)[number];
export type CreateResourceInput = z.infer<typeof createResourceSchema>;
export type MarketplaceResource = z.infer<typeof resourceSchema>;
export type ResourceCollection = z.infer<typeof collectionSchema>;
export type DataSource = "mock" | "api";
export type ApiResult<T> = { data: T; source: DataSource };

/** Business-facing API contract. Policy selection/compilation belongs to the backend. */
export interface MarketplaceApi {
  list(kind: ResourceKind): Promise<ApiResult<ResourceCollection>>;
  get(kind: ResourceKind, id: string): Promise<ApiResult<MarketplaceResource>>;
  create(
    kind: ResourceKind,
    input: CreateResourceInput,
  ): Promise<ApiResult<MarketplaceResource>>;
}

export function marketplaceDestination(
  pathname: string,
): "/guardrails" | "/templates" | null {
  if (pathname === "/guardrails" || pathname === "/templates") return null;
  return /(?:template|policy-library)/.test(pathname)
    ? "/templates"
    : "/guardrails";
}
