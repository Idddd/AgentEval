import { z } from "zod";

export * from "./traces.js";

export const agentStatuses = [
  "PROVISIONING",
  "READY",
  "FAILED",
  "DESTROYING",
] as const;

export const provisioningStages = [
  "QUEUED",
  "PROVIDER",
  "SANDBOX",
  "POD",
  "RUNTIME",
  "ENDPOINT",
  "READY",
] as const;

export const providerKinds = [
  "openai",
  "anthropic",
  "gemini",
  "deepseek",
  "qwen",
  "moonshot",
  "zai",
  "minimax",
  "baidu-qianfan",
  "volcengine",
  "nvidia-nim",
  "azure-openai",
  "aws-bedrock",
  "vertex-ai",
  "openrouter",
  "ollama",
  "vllm",
  "huggingface",
  "custom-openai-compatible",
  "custom-anthropic-compatible",
] as const;

export const modelTypes = ["llm", "text-embedding", "speech-to-text"] as const;

export const modelCapabilities = [
  "reasoning",
  "vision",
  "ocr",
  "document-understanding",
  "tool-calling",
  "structured-output",
  "code",
  "multilingual",
] as const;
export const modelInputModalities = [
  "text",
  "image",
  "audio",
  "document",
] as const;
export const modelOutputModalities = [
  "text",
  "embedding",
] as const;

export const complianceDomains = [
  "GLOBAL",
  "CN_MAINLAND",
  "EU_EEA",
  "US",
  "UK",
  "APAC_EX_CN",
] as const;
export const complianceDomainCatalog = [
  {
    id: "GLOBAL",
    label: "Global",
    description: "No project-level residency restriction. Provider terms still apply.",
    endpointRegion: "global",
  },
  {
    id: "CN_MAINLAND",
    label: "Mainland China",
    description: "Keep registered endpoints and routing fallbacks in Mainland China.",
    endpointRegion: "cn-mainland",
  },
  {
    id: "EU_EEA",
    label: "EU / EEA",
    description: "Keep registered endpoints and routing fallbacks in the EU or EEA.",
    endpointRegion: "eu-eea",
  },
  {
    id: "US",
    label: "United States",
    description: "Keep registered endpoints and routing fallbacks in the United States.",
    endpointRegion: "us",
  },
  {
    id: "UK",
    label: "United Kingdom",
    description: "Keep registered endpoints and routing fallbacks in the United Kingdom.",
    endpointRegion: "uk",
  },
  {
    id: "APAC_EX_CN",
    label: "APAC (excluding Mainland China)",
    description: "Keep registered endpoints and routing fallbacks in APAC outside Mainland China.",
    endpointRegion: "apac-ex-cn",
  },
] as const satisfies ReadonlyArray<{
  id: (typeof complianceDomains)[number];
  label: string;
  description: string;
  endpointRegion: string;
}>;

/**
 * Provider boundaries describe the endpoint configurations that TaskLattice can
 * guide and validate. They are routing constraints, not legal certifications.
 * GLOBAL is intentionally available to every connector because it imposes no
 * project-level residency restriction.
 */
export const providerComplianceDomains = {
  openai: ["GLOBAL"],
  anthropic: ["GLOBAL"],
  gemini: ["GLOBAL"],
  deepseek: ["GLOBAL"],
  qwen: ["GLOBAL", "CN_MAINLAND", "APAC_EX_CN"],
  moonshot: ["GLOBAL", "CN_MAINLAND"],
  zai: ["GLOBAL"],
  minimax: ["GLOBAL"],
  "baidu-qianfan": ["GLOBAL", "CN_MAINLAND"],
  volcengine: ["GLOBAL", "CN_MAINLAND"],
  "nvidia-nim": ["GLOBAL"],
  "azure-openai": ["GLOBAL"],
  "aws-bedrock": [
    "GLOBAL",
    "EU_EEA",
    "US",
    "UK",
    "APAC_EX_CN",
  ],
  "vertex-ai": ["GLOBAL", "EU_EEA", "US", "UK", "APAC_EX_CN"],
  openrouter: ["GLOBAL"],
  ollama: [
    "GLOBAL",
    "CN_MAINLAND",
    "EU_EEA",
    "US",
    "UK",
    "APAC_EX_CN",
  ],
  vllm: [
    "GLOBAL",
    "CN_MAINLAND",
    "EU_EEA",
    "US",
    "UK",
    "APAC_EX_CN",
  ],
  huggingface: ["GLOBAL"],
  "custom-openai-compatible": [
    "GLOBAL",
    "CN_MAINLAND",
    "EU_EEA",
    "US",
    "UK",
    "APAC_EX_CN",
  ],
  "custom-anthropic-compatible": [
    "GLOBAL",
    "CN_MAINLAND",
    "EU_EEA",
    "US",
    "UK",
    "APAC_EX_CN",
  ],
} as const satisfies Record<
  (typeof providerKinds)[number],
  ReadonlyArray<(typeof complianceDomains)[number]>
>;

export function providerSupportsComplianceDomain(
  provider: (typeof providerKinds)[number],
  domain: (typeof complianceDomains)[number],
): boolean {
  return (
    providerComplianceDomains[provider] as ReadonlyArray<
      (typeof complianceDomains)[number]
    >
  ).includes(domain);
}
export const modelRoutingStatuses = [
  "DRAFT",
  "VALIDATING",
  "READY",
  "DEGRADED",
  "NON_COMPLIANT",
  "SUSPENDED",
  "UNSUPPORTED",
] as const;
export const modelRoutingCapabilityStates = ["ENABLED", "DISABLED", "UNKNOWN"] as const;
export const modelRoutingModes = ["SINGLE", "COMPLEXITY", "SEMANTIC"] as const;

export interface ProviderPresetModel {
  modelId: string;
  displayName: string;
  modelType: (typeof modelTypes)[number];
  capabilities?: Array<(typeof modelCapabilities)[number]> | undefined;
  inputModalities?: Array<(typeof modelInputModalities)[number]> | undefined;
  outputModalities?: Array<(typeof modelOutputModalities)[number]> | undefined;
  inputFeePerMillionTokens?: number | undefined;
  outputFeePerMillionTokens?: number | undefined;
  feePerAudioMinute?: number | undefined;
}

export const providerPresets = [
  {
    id: "openai",
    name: "OpenAI",
    category: "Popular",
    description: "OpenAI language, embedding, and transcription models.",
    endpoint: "https://api.openai.com/v1",
    icon: "/assets/providers/openai.webp",
    modelTypes: ["llm", "text-embedding", "speech-to-text"],
    defaultModels: [
      { modelId: "gpt-5.2", displayName: "GPT-5.2", modelType: "llm" },
      { modelId: "text-embedding-3-large", displayName: "Text Embedding 3 Large", modelType: "text-embedding" },
      { modelId: "gpt-4o-transcribe", displayName: "GPT-4o Transcribe", modelType: "speech-to-text" },
    ],
  },
  {
    id: "anthropic",
    name: "Anthropic",
    category: "Popular",
    description: "Claude models through Anthropic's native API.",
    endpoint: "https://api.anthropic.com",
    icon: "/assets/providers/anthropic.webp",
    modelTypes: ["llm"],
    defaultModels: [
      { modelId: "claude-sonnet-4-5-20250929", displayName: "Claude Sonnet 4.5", modelType: "llm" },
    ],
  },
  {
    id: "gemini",
    name: "Google Gemini",
    category: "Popular",
    description: "Gemini models through Google AI Studio.",
    endpoint: "https://generativelanguage.googleapis.com",
    icon: "/assets/providers/gemini.webp",
    modelTypes: ["llm", "text-embedding"],
    defaultModels: [
      { modelId: "gemini-2.5-pro", displayName: "Gemini 2.5 Pro", modelType: "llm" },
      { modelId: "gemini-embedding-001", displayName: "Gemini Embedding 001", modelType: "text-embedding" },
    ],
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    category: "Popular",
    description: "DeepSeek's OpenAI-compatible language model API.",
    endpoint: "https://api.deepseek.com/v1",
    icon: "/assets/providers/deepseek.webp",
    modelTypes: ["llm"],
    defaultModels: [
      {
        modelId: "deepseek-v4-flash",
        displayName: "DeepSeek V4 Flash",
        modelType: "llm",
        inputFeePerMillionTokens: 0.14,
        outputFeePerMillionTokens: 0.28,
      },
      {
        modelId: "deepseek-v4-pro",
        displayName: "DeepSeek V4 Pro",
        modelType: "llm",
        inputFeePerMillionTokens: 0.435,
        outputFeePerMillionTokens: 0.87,
      },
    ],
  },
  {
    id: "qwen",
    name: "Qwen / DashScope",
    category: "Chinese Providers",
    description: "Qwen models through DashScope's regional endpoints.",
    endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    icon: "/assets/providers/qwen.webp",
    modelTypes: ["llm", "text-embedding"],
    defaultModels: [
      { modelId: "qwen-plus", displayName: "Qwen Plus", modelType: "llm" },
      { modelId: "text-embedding-v4", displayName: "Text Embedding V4", modelType: "text-embedding" },
    ],
  },
  {
    id: "moonshot",
    name: "Moonshot / Kimi",
    category: "Chinese Providers",
    description: "Kimi models through Moonshot's China or global endpoint.",
    endpoint: "https://api.moonshot.cn/v1",
    icon: "/assets/providers/kimi.webp",
    modelTypes: ["llm"],
    defaultModels: [
      { modelId: "kimi-k2.5", displayName: "Kimi K2.5", modelType: "llm" },
      { modelId: "moonshot-v1-128k", displayName: "Moonshot V1 128K", modelType: "llm" },
    ],
  },
  {
    id: "zai",
    name: "Zhipu / Z.AI",
    category: "Chinese Providers",
    description: "GLM models through the Z.AI API.",
    endpoint: "https://api.z.ai/api/paas/v4",
    icon: "/assets/providers/zai.webp",
    modelTypes: ["llm"],
    defaultModels: [
      { modelId: "glm-4.5", displayName: "GLM 4.5", modelType: "llm" },
    ],
  },
  {
    id: "minimax",
    name: "MiniMax",
    category: "Chinese Providers",
    description: "MiniMax language models through its native endpoint.",
    endpoint: "https://api.minimax.io/v1",
    icon: "/assets/providers/minimax.webp",
    modelTypes: ["llm"],
    defaultModels: [
      { modelId: "MiniMax-M2.1", displayName: "MiniMax M2.1", modelType: "llm" },
    ],
  },
  {
    id: "baidu-qianfan",
    name: "Baidu Qianfan",
    category: "Chinese Providers",
    description: "ERNIE and partner models through Qianfan's OpenAI-compatible API.",
    endpoint: "https://qianfan.baidubce.com/v2",
    icon: "/assets/providers/baidu.webp",
    modelTypes: ["llm", "text-embedding"],
    defaultModels: [
      { modelId: "ernie-4.5-turbo-128k", displayName: "ERNIE 4.5 Turbo", modelType: "llm" },
    ],
  },
  {
    id: "volcengine",
    name: "ByteDance / Doubao",
    category: "Chinese Providers",
    description: "Doubao deployments hosted by Volcengine Ark.",
    endpoint: "https://ark.cn-beijing.volces.com/api/v3",
    icon: "/assets/providers/volcengine.webp",
    modelTypes: ["llm", "text-embedding"],
    defaultModels: [],
  },
  {
    id: "nvidia-nim",
    name: "NVIDIA NIM",
    category: "Infrastructure",
    description: "NVIDIA-hosted or self-hosted NIM inference endpoints.",
    endpoint: "https://integrate.api.nvidia.com/v1",
    icon: "/assets/providers/nvidia.webp",
    modelTypes: ["llm", "text-embedding"],
    defaultModels: [
      { modelId: "meta/llama-3.3-70b-instruct", displayName: "Llama 3.3 70B Instruct", modelType: "llm" },
    ],
  },
  {
    id: "azure-openai",
    name: "Azure OpenAI",
    category: "Infrastructure",
    description: "Azure OpenAI deployments with explicit API versioning.",
    endpoint: null,
    icon: "/assets/providers/azure.webp",
    modelTypes: ["llm", "text-embedding", "speech-to-text"],
    defaultModels: [],
  },
  {
    id: "aws-bedrock",
    name: "AWS Bedrock",
    category: "Infrastructure",
    description: "Foundation models through AWS Bedrock Runtime.",
    endpoint: null,
    icon: "/assets/providers/aws.webp",
    modelTypes: ["llm", "text-embedding"],
    defaultModels: [
      { modelId: "anthropic.claude-3-5-sonnet-20241022-v2:0", displayName: "Claude 3.5 Sonnet", modelType: "llm" },
    ],
  },
  {
    id: "vertex-ai",
    name: "Google Vertex AI",
    category: "Infrastructure",
    description: "Google Cloud-hosted foundation models through Vertex AI.",
    endpoint: null,
    icon: "/assets/providers/vertex.webp",
    modelTypes: ["llm", "text-embedding"],
    defaultModels: [
      { modelId: "gemini-2.5-pro", displayName: "Gemini 2.5 Pro", modelType: "llm" },
    ],
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    category: "Infrastructure",
    description: "A unified endpoint for models from multiple providers.",
    endpoint: "https://openrouter.ai/api/v1",
    icon: "/assets/providers/openrouter.webp",
    modelTypes: ["llm"],
    defaultModels: [
      { modelId: "openai/gpt-5", displayName: "GPT-5 via OpenRouter", modelType: "llm" },
    ],
  },
  {
    id: "ollama",
    name: "Ollama",
    category: "Self-Hosted / Custom",
    description: "Models served by an Ollama runtime on your network.",
    endpoint: "http://host.docker.internal:11434",
    icon: "/assets/providers/ollama.webp",
    modelTypes: ["llm", "text-embedding"],
    defaultModels: [
      { modelId: "llama3.2", displayName: "Llama 3.2", modelType: "llm" },
    ],
  },
  {
    id: "vllm",
    name: "vLLM",
    category: "Self-Hosted / Custom",
    description: "An OpenAI-compatible vLLM inference server.",
    endpoint: null,
    icon: "/assets/providers/vllm.webp",
    modelTypes: ["llm", "text-embedding"],
    defaultModels: [],
  },
  {
    id: "huggingface",
    name: "Hugging Face",
    category: "Self-Hosted / Custom",
    description: "Serverless providers or a dedicated Hugging Face endpoint.",
    endpoint: null,
    icon: "/assets/providers/huggingface.webp",
    modelTypes: ["llm", "text-embedding"],
    defaultModels: [
      { modelId: "meta-llama/Llama-3.3-70B-Instruct", displayName: "Llama 3.3 70B Instruct", modelType: "llm" },
    ],
  },
  {
    id: "custom-openai-compatible",
    name: "OpenAI-compatible (Custom)",
    category: "Self-Hosted / Custom",
    description: "Any OpenAI-compatible endpoint managed by your organization.",
    endpoint: null,
    icon: "/assets/providers/custom.svg",
    modelTypes: ["llm", "text-embedding", "speech-to-text"],
    defaultModels: [],
  },
  {
    id: "custom-anthropic-compatible",
    name: "Anthropic-compatible (Custom)",
    category: "Self-Hosted / Custom",
    description: "A custom endpoint implementing the Anthropic Messages API.",
    endpoint: null,
    icon: "/assets/providers/custom-anthropic.svg",
    modelTypes: ["llm"],
    defaultModels: [],
  },
] as const satisfies ReadonlyArray<{
  id: (typeof providerKinds)[number];
  name: string;
  category: "Popular" | "Chinese Providers" | "Infrastructure" | "Self-Hosted / Custom";
  description: string;
  endpoint: string | null;
  icon: string;
  modelTypes: ReadonlyArray<(typeof modelTypes)[number]>;
  defaultModels: readonly ProviderPresetModel[];
}>;

const connectionNameSchema = z.string().trim().min(3, "Connection name must contain at least 3 characters.").max(48);
const apiKeySchema = z.string().trim().min(1, "API key is required.").max(8_192);
const endpointSchema = z.string().trim().url("Enter a valid API endpoint URL.");
const optionalText = z.string().trim().max(512).optional();

const keyedDraft = <T extends (typeof providerKinds)[number]>(
  provider: T,
  endpoint: string,
) => z.object({
  provider: z.literal(provider),
  name: connectionNameSchema,
  config: z.object({ endpoint: endpointSchema.default(endpoint) }),
  credentials: z.object({ apiKey: apiKeySchema }),
});

export const providerConnectionDraftSchema = z.discriminatedUnion("provider", [
  keyedDraft("openai", "https://api.openai.com/v1").extend({
    config: z.object({ endpoint: endpointSchema.default("https://api.openai.com/v1"), organization: optionalText }),
  }),
  keyedDraft("anthropic", "https://api.anthropic.com"),
  keyedDraft("gemini", "https://generativelanguage.googleapis.com"),
  keyedDraft("deepseek", "https://api.deepseek.com/v1"),
  z.object({ provider: z.literal("qwen"), name: connectionNameSchema, config: z.object({ region: z.enum(["cn", "international"]), endpoint: endpointSchema }), credentials: z.object({ apiKey: apiKeySchema }) }),
  z.object({ provider: z.literal("moonshot"), name: connectionNameSchema, config: z.object({ region: z.enum(["cn", "global"]), endpoint: endpointSchema }), credentials: z.object({ apiKey: apiKeySchema }) }),
  keyedDraft("zai", "https://api.z.ai/api/paas/v4"),
  keyedDraft("minimax", "https://api.minimax.io/v1"),
  z.object({ provider: z.literal("baidu-qianfan"), name: connectionNameSchema, config: z.object({ endpoint: endpointSchema.default("https://qianfan.baidubce.com/v2"), appId: optionalText }), credentials: z.object({ apiKey: apiKeySchema }) }),
  z.object({ provider: z.literal("volcengine"), name: connectionNameSchema, config: z.object({ endpoint: endpointSchema.default("https://ark.cn-beijing.volces.com/api/v3"), endpointId: z.string().trim().min(1, "Endpoint ID is required.").max(256) }), credentials: z.object({ apiKey: apiKeySchema }) }),
  keyedDraft("nvidia-nim", "https://integrate.api.nvidia.com/v1"),
  z.object({ provider: z.literal("azure-openai"), name: connectionNameSchema, config: z.object({ endpoint: endpointSchema, apiVersion: z.string().trim().min(1, "API version is required.").max(64), deployment: z.string().trim().min(1, "Deployment name is required.").max(256) }), credentials: z.object({ apiKey: apiKeySchema }) }),
  z.object({ provider: z.literal("aws-bedrock"), name: connectionNameSchema, config: z.object({ region: z.string().trim().min(2, "AWS region is required.").max(64), roleArn: optionalText }), credentials: z.object({ accessKeyId: apiKeySchema, secretAccessKey: apiKeySchema, sessionToken: z.string().trim().max(8_192).optional() }) }),
  z.object({ provider: z.literal("vertex-ai"), name: connectionNameSchema, config: z.object({ project: z.string().trim().min(1, "Google Cloud project is required.").max(256), location: z.string().trim().min(1, "Google Cloud location is required.").max(128) }), credentials: z.object({ serviceAccountJson: z.string().trim().min(2, "Service-account JSON is required.").max(64_000) }) }),
  z.object({ provider: z.literal("openrouter"), name: connectionNameSchema, config: z.object({ endpoint: endpointSchema.default("https://openrouter.ai/api/v1"), siteUrl: z.string().trim().url().optional(), appName: optionalText }), credentials: z.object({ apiKey: apiKeySchema }) }),
  z.object({ provider: z.literal("ollama"), name: connectionNameSchema, config: z.object({ endpoint: endpointSchema }), credentials: z.object({}) }),
  z.object({ provider: z.literal("vllm"), name: connectionNameSchema, config: z.object({ endpoint: endpointSchema }), credentials: z.object({ apiKey: z.string().trim().max(8_192).optional() }) }),
  z.object({ provider: z.literal("huggingface"), name: connectionNameSchema, config: z.object({ mode: z.enum(["serverless", "dedicated"]), endpoint: endpointSchema.optional(), inferenceProvider: optionalText }), credentials: z.object({ apiKey: apiKeySchema }) }),
  z.object({ provider: z.literal("custom-openai-compatible"), name: connectionNameSchema, config: z.object({ endpoint: endpointSchema }), credentials: z.object({ apiKey: z.string().trim().max(8_192).optional() }) }),
  z.object({ provider: z.literal("custom-anthropic-compatible"), name: connectionNameSchema, config: z.object({ endpoint: endpointSchema }), credentials: z.object({ apiKey: apiKeySchema }) }),
]);

export const providerModelSelectionSchema = z.object({
  modelId: z.string().trim().min(1).max(256),
  displayName: z.string().trim().min(1).max(160),
  modelType: z.enum(modelTypes),
  capabilities: z.array(z.enum(modelCapabilities)).max(modelCapabilities.length).optional(),
  inputModalities: z.array(z.enum(modelInputModalities)).min(1).max(modelInputModalities.length).optional(),
  outputModalities: z.array(z.enum(modelOutputModalities)).min(1).max(modelOutputModalities.length).optional(),
  inputFeePerMillionTokens: z.number().min(0).max(1_000_000).optional(),
  outputFeePerMillionTokens: z.number().min(0).max(1_000_000).optional(),
  feePerAudioMinute: z.number().min(0).max(1_000_000).optional(),
});

export const discoverProviderModelsSchema = providerConnectionDraftSchema;
export const createProviderConnectionSchema = z.object({
  connection: providerConnectionDraftSchema,
  models: z.array(providerModelSelectionSchema).min(1).max(100),
  complianceDomain: z.enum(complianceDomains),
});

export const agentPlatformIds = ["openclaw", "hermes"] as const;

export const agentPlatforms = [
  {
    id: "openclaw",
    name: "OpenClaw",
    description: "Gateway-based Agent with a plugin ecosystem and browser UI.",
    terminalLabel: "OpenClaw TUI",
    endpointLabel: "OpenClaw Web UI",
    isDefault: true,
  },
  {
    id: "hermes",
    name: "Hermes",
    description: "Self-improving Agent with durable memory and a learning loop.",
    terminalLabel: "Hermes TUI",
    endpointLabel: "Hermes dashboard",
    isDefault: false,
  },
] as const satisfies ReadonlyArray<{
  description: string;
  endpointLabel: string;
  id: (typeof agentPlatformIds)[number];
  isDefault: boolean;
  name: string;
  terminalLabel: string;
}>;

export const defaultAgentPlatformId = agentPlatforms.find(
  (platform) => platform.isDefault,
)!.id;

export const agentMemoryCitations = ["auto", "on", "off"] as const;

export const agentMemoryConfigurationSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("native"),
    citations: z.enum(agentMemoryCitations).default("auto"),
  }).strict(),
  z.object({
    mode: z.literal("hybrid"),
    embeddingModelDeploymentId: z.string().uuid(),
    includeSessionTranscripts: z.boolean().default(false),
    citations: z.enum(agentMemoryCitations).default("auto"),
    maxResults: z.number().int().min(1).max(20).default(6),
    minScore: z.number().min(0).max(1).default(0.35),
  }).strict(),
]);

export const defaultNativeAgentMemoryConfiguration =
  agentMemoryConfigurationSchema.parse({ mode: "native" });

export const sandboxPolicyIdSchema = z
  .string()
  .trim()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers, and hyphens.");

export const sandboxPolicyInputSchema = z.object({
  name: z.string().trim().min(3).max(80),
  description: z.string().trim().min(10).max(320),
  networkAccess: z.string().trim().min(3).max(160),
  policyYaml: z.string().trim().min(10).max(64_000),
});

export const createSandboxPolicySchema = sandboxPolicyInputSchema;
export const updateSandboxPolicySchema = sandboxPolicyInputSchema;

export const providerResourceStatuses = ["VALIDATED", "DEGRADED", "FAILED"] as const;

export const skillCategories = [
  "Customer Support",
  "Data",
  "Developer Tools",
  "HR",
  "Knowledge",
  "Operations",
  "Research",
] as const;

export const skillTrustLevels = [
  "BUILT_IN",
  "TRUSTED_SOURCE",
  "UNSAFE",
] as const;

export const skillCompatibilityTargets = [
  "hermes",
  "openclaw",
  "claude-code",
  "openai",
] as const;

export const skillDefinitionSchema = z.object({
  id: z.string().trim().min(1).max(160),
  name: z.string().trim().min(3).max(120),
  description: z.string().trim().min(10).max(500),
  problemStatement: z.string().trim().min(10).max(1_000),
  useCases: z.array(z.string().trim().min(3).max(240)).min(1).max(8),
  usageGuide: z.string().trim().min(10).max(4_000),
  author: z.string().trim().min(1).max(120),
  category: z.enum(skillCategories),
  trustLevel: z.enum(skillTrustLevels),
  compatibleAgents: z.array(z.enum(skillCompatibilityTargets))
    .min(1)
    .max(skillCompatibilityTargets.length)
    .refine((targets) => new Set(targets).size === targets.length, {
      message: "Compatible Agent targets must be unique.",
    }),
  version: z.string().trim().min(1).max(40),
  endpoint: z.string().trim().url(),
  digest: z.string().trim().min(1).max(200),
  owner: z.string().trim().min(1).max(120),
  permissions: z.number().int().min(0).max(1_000),
  status: z.enum(["PUBLISHED", "DRAFT"]),
  updatedAt: z.string().datetime(),
});

export const createSkillDefinitionSchema = skillDefinitionSchema.omit({
  id: true,
  updatedAt: true,
});
export const updateSkillDefinitionSchema = createSkillDefinitionSchema;

export const mcpToolAnnotationsSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  readOnlyHint: z.boolean().optional(),
  destructiveHint: z.boolean().optional(),
  idempotentHint: z.boolean().optional(),
  openWorldHint: z.boolean().optional(),
}).strict();

export const mcpToolDefinitionSchema = z.object({
  name: z.string().trim().min(1).max(200),
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(4_000).optional(),
  inputSchema: z.record(z.string(), z.unknown()),
  outputSchema: z.record(z.string(), z.unknown()).optional(),
  annotations: mcpToolAnnotationsSchema.optional(),
  discoveredAt: z.string().datetime(),
});

export const mcpTransportSchema = z.enum(["http", "sse", "stdio", "openapi"]);
export const mcpAuthTypeSchema = z.enum([
  "none",
  "bearer_token",
  "api_key",
  "basic",
  "authorization",
  "oauth2",
  "aws_sigv4",
]);

export const mcpSecretReferenceSchema = z.string().trim().min(1).max(500).refine(
  (value) => /^(?:k8s|memory):\/\//.test(value),
  "Credentials must use a supported Secret reference.",
);

const optionalMcpSecretReferenceSchema = z.string().trim().max(500).refine(
  (value) => !value || /^(?:k8s|memory):\/\//.test(value),
  "Credentials must use a supported Secret reference.",
);

export const mcpStaticHeaderSchema = z.object({
  name: z.string().trim().min(1).max(120),
  valueReference: mcpSecretReferenceSchema,
}).strict();

export const mcpEnvironmentVariableSchema = z.object({
  name: z.string().trim().regex(/^[A-Z_][A-Z0-9_]*$/).max(120),
  valueReference: mcpSecretReferenceSchema,
}).strict();

export const mcpOauthConfigurationSchema = z.object({
  flow: z.enum(["client_credentials", "authorization_code"]),
  authorizationUrl: z.string().trim().url().optional(),
  tokenUrl: z.string().trim().url().optional(),
  registrationUrl: z.string().trim().url().optional(),
}).strict();

const mcpServerConnectionFields = {
  templateId: z.string().trim().min(1).max(120).optional(),
  name: z.string().trim().min(3).max(120),
  alias: z.string().trim().regex(/^[a-zA-Z0-9_]+$/, "Alias may contain letters, numbers, and underscores only.").max(120),
  description: z.string().trim().min(10).max(1_000),
  category: z.string().trim().min(2).max(80),
  logoUrl: z.string().trim().url().optional(),
  sourceUrl: z.string().trim().url().optional(),
  transport: mcpTransportSchema,
  endpoint: z.string().trim().url().optional(),
  specPath: z.string().trim().min(1).max(1_000).optional(),
  command: z.string().trim().min(1).max(240).optional(),
  args: z.array(z.string().max(1_000)).max(64).default([]),
  environment: z.array(mcpEnvironmentVariableSchema).max(64).default([]),
  authType: mcpAuthTypeSchema.default("none"),
  authReference: optionalMcpSecretReferenceSchema.default(""),
  oauth: mcpOauthConfigurationSchema.optional(),
  accessGroups: z.array(z.string().trim().min(1).max(120)).max(64).default([]),
  allowedTools: z.array(z.string().trim().min(1).max(200)).max(10_000).default([]),
  extraHeaders: z.array(z.string().trim().min(1).max(120)).max(64).default([]),
  staticHeaders: z.array(mcpStaticHeaderSchema).max(64).default([]),
  internalNetworkOnly: z.boolean().default(false),
};

function validateMcpServerConnection(
  value: Record<string, unknown>,
  context: z.RefinementCtx,
): void {
  if (["http", "sse"].includes(String(value.transport)) && !value.endpoint) {
    context.addIssue({ code: "custom", path: ["endpoint"], message: "Endpoint is required for HTTP and SSE transports." });
  }
  if (value.transport === "openapi" && !value.specPath) {
    context.addIssue({ code: "custom", path: ["specPath"], message: "OpenAPI spec path is required." });
  }
  if (value.transport === "stdio" && (!value.command || !Array.isArray(value.args) || value.args.length === 0)) {
    context.addIssue({ code: "custom", path: ["command"], message: "Command and arguments are required for stdio transport." });
  }
  if (value.authType !== "none" && value.authType !== "oauth2" && !value.authReference) {
    context.addIssue({ code: "custom", path: ["authReference"], message: "A Secret reference is required for this authentication type." });
  }
  if (value.authType === "oauth2" && !value.oauth) {
    context.addIssue({ code: "custom", path: ["oauth"], message: "OAuth configuration is required." });
  }
}

export const mcpServerConnectionSchema = z.object(mcpServerConnectionFields).strict().superRefine(validateMcpServerConnection);

export const mcpServerDefinitionSchema = z.object({
  ...mcpServerConnectionFields,
  id: z.string().trim().min(1).max(160),
  litellmServerId: z.string().trim().min(1).max(240),
  status: z.enum(["HEALTHY", "PERMISSION_REQUIRED", "UNCHECKED", "UNAVAILABLE"]),
  tools: z.array(mcpToolDefinitionSchema).max(10_000),
  lastDiscoveryAttemptAt: z.string().datetime().nullable(),
  lastDiscoveredAt: z.string().datetime().nullable(),
  lastDiscoveryError: z.string().max(4_000).nullable(),
}).strict().superRefine(validateMcpServerConnection);

export const createMcpServerDefinitionSchema = mcpServerConnectionSchema;
export const updateMcpServerDefinitionSchema = createMcpServerDefinitionSchema;

export const accessPolicyStatuses = ["DRAFT", "ACTIVE"] as const;
export const accessPolicyDecisions = ["INHERIT", "ALLOW", "DENY"] as const;

export const accessPolicyToolRuleSchema = z.object({
  toolName: z.string().trim().min(1).max(200),
  decision: z.enum(accessPolicyDecisions),
}).strict();

export const accessPolicyServerRuleSchema = z.object({
  mcpServerId: z.string().trim().min(1).max(160),
  defaultDecision: z.enum(["ALLOW", "DENY"]),
  tools: z.array(accessPolicyToolRuleSchema).max(10_000).default([]),
}).strict();

export const createAccessPolicySchema = z.object({
  name: z.string().trim().min(3).max(120),
  status: z.enum(accessPolicyStatuses).default("DRAFT"),
  serverRules: z.array(accessPolicyServerRuleSchema).max(1_000),
}).strict();

export const updateAccessPolicySchema = z.object({
  name: z.string().trim().min(3).max(120).optional(),
  status: z.enum(accessPolicyStatuses).optional(),
  serverRules: z.array(accessPolicyServerRuleSchema).max(1_000).optional(),
}).strict();

export const mcpServerTemplateSchema = z.object({
  id: z.string().trim().min(1).max(120),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().min(10).max(1_000),
  category: z.string().trim().min(2).max(80),
  logo: z.string().trim().min(1).max(120),
  sourceUrl: z.string().trim().url(),
  transport: mcpTransportSchema,
  endpointPlaceholder: z.string().trim().max(500).optional(),
  command: z.string().trim().max(240).optional(),
  args: z.array(z.string().max(1_000)).max(64).default([]),
  defaultAuthType: mcpAuthTypeSchema,
}).strict();

const knowledgeSourceDefinitionBaseSchema = z.object({
  id: z.string().trim().min(1).max(160),
  name: z.string().trim().min(3).max(120),
  description: z.string().trim().min(10).max(500),
  vectorStoreId: z.string().trim().min(1).max(240),
  provider: z.enum(["openai", "azure", "bedrock", "vertex_ai", "pg_vector", "elasticsearch"]),
  apiBase: z.string().trim().url().optional(),
  embeddingModel: z.string().trim().min(1).max(240).optional(),
  semanticField: z.string().trim().min(1).max(240).optional(),
  contentField: z.string().trim().min(1).max(240).optional(),
  credentialReference: optionalMcpSecretReferenceSchema.default(""),
  status: z.enum(["REGISTERED", "UNAVAILABLE"]),
  lastReconciliationError: z.string().max(4_000).nullable(),
  topK: z.number().int().min(1).max(50),
}).strict();

function validateKnowledgeSourceProvider(
  source: {
    provider: "openai" | "azure" | "bedrock" | "vertex_ai" | "pg_vector" | "elasticsearch";
    apiBase?: string | undefined;
    semanticField?: string | undefined;
    contentField?: string | undefined;
    credentialReference: string;
  },
  context: z.RefinementCtx,
): void {
  if (source.provider === "pg_vector") {
    if (!source.apiBase) {
      context.addIssue({
        code: "custom",
        path: ["apiBase"],
        message: "PGVector connector API base is required.",
      });
    }
    if (!source.credentialReference) {
      context.addIssue({
        code: "custom",
        path: ["credentialReference"],
        message: "PGVector connector credential is required.",
      });
    }
  }
  if (source.provider === "elasticsearch") {
    for (const [path, value, message] of [
      ["apiBase", source.apiBase, "Elasticsearch URL is required."],
      ["semanticField", source.semanticField, "Elasticsearch semantic_text field is required."],
      ["contentField", source.contentField, "Elasticsearch content field is required."],
      ["credentialReference", source.credentialReference, "Elasticsearch credential is required."],
    ] as const) {
      if (!value) context.addIssue({ code: "custom", path: [path], message });
    }
  }
}

export const knowledgeSourceDefinitionSchema = knowledgeSourceDefinitionBaseSchema
  .superRefine(validateKnowledgeSourceProvider);

export const createKnowledgeSourceDefinitionSchema = knowledgeSourceDefinitionBaseSchema.omit({
  id: true,
  status: true,
  lastReconciliationError: true,
}).superRefine(validateKnowledgeSourceProvider);
export const updateKnowledgeSourceDefinitionSchema = createKnowledgeSourceDefinitionSchema;

export const agentSpecializationDefinitionSchema = z.object({
  id: z.string().trim().min(1).max(64),
  name: z.string().trim().min(2).max(120),
  roleLabel: z.string().trim().min(2).max(120),
  description: z.string().trim().min(10).max(500),
  icon: z.enum(["briefcase", "headphones", "settings", "sparkles", "telescope", "users"]),
  systemPrompt: z.string().max(8_000),
  defaultSkillIds: z.array(z.string().trim().min(1).max(160)).max(64),
  defaultMcpServerIds: z.array(z.string().trim().min(1).max(160)).max(64),
  defaultKnowledgeSourceIds: z.array(z.string().trim().min(1).max(160)).max(64),
});

export const agentGardenBuiltInTypeIds = [
  "openclaw",
  "hermes",
  "claude-code",
] as const;

export const agentGardenRegisterableTypeIds = [
  "a2a",
  "langgraph",
  "langflow",
  "bedrock-agentcore",
  "azure-ai-foundry",
  "pydantic-ai",
  "vertex-ai-agent-engine",
  "watsonx-orchestrate",
  "custom",
] as const;

export const agentGardenIntegrationTypeIds = [
  ...agentGardenBuiltInTypeIds,
  ...agentGardenRegisterableTypeIds,
] as const;

export const agentGardenUsageModeIds = [
  "INTERACTIVE",
  "CALLABLE",
  "HYBRID",
] as const;

export const agentGardenUsageCapabilitiesSchema = z.object({
  interactive: z.boolean(),
  canDelegate: z.boolean(),
  acceptsDelegation: z.boolean(),
}).strict();

export const agentGardenSkillSchema = z.object({
  id: z.string().trim().min(1).max(200),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2_000).default(""),
  tags: z.array(z.string().trim().min(1).max(80)).max(32).default([]),
}).strict();

export const agentGardenEntrySchema = z.object({
  id: z.string().trim().min(1).max(160),
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().min(10).max(2_000),
  source: z.enum(["BUILT_IN", "PROJECT_REGISTERED"]),
  integrationType: z.enum(agentGardenIntegrationTypeIds),
  platformLabel: z.string().trim().min(1).max(120),
  category: z.string().trim().min(2).max(80),
  owner: z.string().trim().min(1).max(120),
  tags: z.array(z.string().trim().min(1).max(80)).max(32),
  status: z.enum(["READY", "COMING_SOON", "UNCHECKED", "UNAVAILABLE"]),
  usageMode: z.enum(agentGardenUsageModeIds),
  usageCapabilities: agentGardenUsageCapabilitiesSchema,
  endpoint: z.string().trim().url().nullable(),
  agentCardUrl: z.string().trim().url().nullable(),
  authType: z.enum(["none", "bearer_token", "api_key"]),
  authReference: optionalMcpSecretReferenceSchema,
  internalNetworkOnly: z.boolean(),
  configuration: z.record(z.string(), z.string()),
  skills: z.array(agentGardenSkillSchema).max(1_000),
  specializationId: z.string().trim().min(1).max(64).nullable(),
  createdAt: z.string().datetime().nullable(),
  updatedAt: z.string().datetime().nullable(),
  lastDiscoveredAt: z.string().datetime().nullable(),
  lastDiscoveryError: z.string().max(4_000).nullable(),
}).strict();

export const createAgentGardenEntrySchema = z.object({
  name: z.string().trim().min(3).max(160),
  description: z.string().trim().min(10).max(2_000),
  integrationType: z.enum(agentGardenRegisterableTypeIds),
  endpoint: z.string().trim().url(),
  agentCardUrl: z.string().trim().url().optional(),
  category: z.string().trim().min(2).max(80),
  owner: z.string().trim().min(1).max(120),
  tags: z.array(z.string().trim().min(1).max(80)).max(32).default([]),
  usageMode: z.enum(agentGardenUsageModeIds).default("CALLABLE"),
  authType: z.enum(["none", "bearer_token", "api_key"]).default("none"),
  authReference: optionalMcpSecretReferenceSchema.default(""),
  internalNetworkOnly: z.boolean().default(false),
  configuration: z.record(z.string(), z.string()).default({}),
}).strict().superRefine((value, context) => {
  if (value.authType !== "none" && !value.authReference) {
    context.addIssue({
      code: "custom",
      path: ["authReference"],
      message: "A Secret reference is required for this authentication type.",
    });
  }
});

export const agentConnectionApprovalModeIds = [
  "AUTO_READ_ONLY",
  "ALWAYS_ASK",
] as const;

export const createAgentConnectionSchema = z.object({
  coordinatorInstanceId: z.string().trim().min(1).max(160),
  connectedAgentId: z.string().trim().min(1).max(160),
  allowedSkillIds: z.array(z.string().trim().min(1).max(200)).max(1_000).default([]),
  approvalMode: z.enum(agentConnectionApprovalModeIds).default("AUTO_READ_ONLY"),
}).strict();

export const agentConnectionSchema = createAgentConnectionSchema.extend({
  id: z.string().uuid(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).strict();

export const agentGardenSnapshotSchema = z.object({
  agents: z.array(agentGardenEntrySchema),
  connections: z.array(agentConnectionSchema),
}).strict();

export const resourceKindSchema = z.enum([
  "skills",
  "mcp-servers",
  "knowledge-sources",
]);

export const createModelDeploymentSchema = z.object({
  providerAccountId: z.string().trim().min(1),
  modelId: z.string().trim().min(1).max(160),
  displayName: z.string().trim().min(1).max(160),
  modelType: z.enum(modelTypes),
  capabilities: z.array(z.enum(modelCapabilities)).max(modelCapabilities.length).optional(),
  inputModalities: z.array(z.enum(modelInputModalities)).min(1).max(modelInputModalities.length).optional(),
  outputModalities: z.array(z.enum(modelOutputModalities)).min(1).max(modelOutputModalities.length).optional(),
  inputFeePerMillionTokens: z.number().min(0).max(1_000_000).optional(),
  outputFeePerMillionTokens: z.number().min(0).max(1_000_000).optional(),
  feePerAudioMinute: z.number().min(0).max(1_000_000).optional(),
});

const agentAccessPolicyIdsSchema = z
  .array(z.string().uuid())
  .min(1)
  .max(64)
  .refine(
    (ids) => new Set(ids).size === ids.length,
    "Access Policy bindings must be unique.",
  );

export const createAgentSchema = z.object({
  name: z.string().trim().min(3).max(64),
  description: z.string().trim().max(300).default(""),
  runtime: z.literal("openshell"),
  agentPlatform: z.enum(agentPlatformIds).default(defaultAgentPlatformId),
  accessPolicyIds: agentAccessPolicyIdsSchema,
  policyId: sandboxPolicyIdSchema.optional(),
  modelRoutingId: z.string().trim().min(1).max(160),
  systemPrompt: z.string().trim().min(10).max(8000),
  specializationId: z.string().trim().min(1).max(64).optional(),
  skillIds: z.array(z.string().trim().min(1).max(160)).max(64).optional(),
  mcpServerIds: z.array(z.string().trim().min(1).max(160)).max(64).optional(),
  knowledgeSourceIds: z.array(z.string().trim().min(1).max(160)).max(64).optional(),
  memory: agentMemoryConfigurationSchema.optional(),
}).strict().superRefine((value, context) => {
  if (value.memory && value.agentPlatform !== "openclaw") {
    context.addIssue({
      code: "custom",
      path: ["memory"],
      message: "Memory is currently available only for OpenClaw Instances.",
    });
  }
});

export const updateInstanceAccessPoliciesSchema = z.object({
  accessPolicyIds: agentAccessPolicyIdsSchema,
}).strict();

const nullableQuotaInteger = z.number().int().min(0).max(1_000_000_000).nullable();

export const updateProjectQuotaSchema = z.object({
  hardBudgetUsd: z.number().min(0).max(10_000_000).nullable(),
  budgetDuration: z.enum(["1d", "7d", "30d"]).nullable(),
  tpmLimit: nullableQuotaInteger,
  maxInstances: nullableQuotaInteger,
  maxMcpIntegrations: nullableQuotaInteger,
  maxKnowledgeBaseIntegrations: nullableQuotaInteger,
}).strict().superRefine((value, context) => {
  if (value.hardBudgetUsd !== null && value.budgetDuration === null) {
    context.addIssue({
      code: "custom",
      path: ["budgetDuration"],
      message: "Select a reset period when a spend budget is configured.",
    });
  }
});

export const createInferenceGatewaySchema = z.object({
  name: z.string().trim().min(3).max(64),
  baseUrl: z.string().trim().url(),
  adminUiUrl: z.string().trim().url(),
  adminCredentialRef: z.string().trim().min(1).max(160),
});

const modelDeploymentIdSchema = z.string().uuid();
const fallbackModelDeploymentIdsSchema = z
  .array(modelDeploymentIdSchema)
  .max(8)
  .default([]);
const retryCountSchema = z.number().int().min(0).max(10).default(2);
const semanticRouteSchema = z.object({
  intent: z.string().trim().min(2).max(64).regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "Use lowercase letters, numbers, and hyphens.",
  ),
  description: z.string().trim().min(3).max(240),
  modelDeploymentId: modelDeploymentIdSchema,
  utterances: z.array(z.string().trim().min(2).max(500)).min(2).max(50),
  scoreThreshold: z.number().min(0).max(1).default(0.5),
}).strict();

export const modelRoutingPolicySchema = z.discriminatedUnion("mode", [
  z.object({
    version: z.literal(1).default(1),
    mode: z.literal("SINGLE"),
    modelDeploymentId: modelDeploymentIdSchema,
    fallbackModelDeploymentIds: fallbackModelDeploymentIdsSchema,
    retries: retryCountSchema,
  }).strict(),
  z.object({
    version: z.literal(1).default(1),
    mode: z.literal("COMPLEXITY"),
    simpleModelDeploymentId: modelDeploymentIdSchema,
    complexModelDeploymentId: modelDeploymentIdSchema,
    fallbackModelDeploymentIds: fallbackModelDeploymentIdsSchema,
    retries: retryCountSchema,
  }).strict(),
  z.object({
    version: z.literal(1).default(1),
    mode: z.literal("SEMANTIC"),
    defaultModelDeploymentId: modelDeploymentIdSchema,
    embeddingModelDeploymentId: modelDeploymentIdSchema,
    routes: z.array(semanticRouteSchema).min(1).max(16),
    fallbackModelDeploymentIds: fallbackModelDeploymentIdsSchema,
    retries: retryCountSchema,
  }).strict(),
]).superRefine((policy, context) => {
  if (
    policy.mode === "SINGLE"
    && policy.fallbackModelDeploymentIds.includes(policy.modelDeploymentId)
  ) {
    context.addIssue({
      code: "custom",
      path: ["fallbackModelDeploymentIds"],
      message: "Fallbacks must be different from the primary model.",
    });
  }
  if (policy.mode === "COMPLEXITY") {
    if (policy.simpleModelDeploymentId === policy.complexModelDeploymentId) {
      context.addIssue({
        code: "custom",
        path: ["complexModelDeploymentId"],
        message: "Simple and complex tiers must use different model deployments.",
      });
    }
    if (
      policy.fallbackModelDeploymentIds.includes(policy.simpleModelDeploymentId)
      || policy.fallbackModelDeploymentIds.includes(policy.complexModelDeploymentId)
    ) {
      context.addIssue({
        code: "custom",
        path: ["fallbackModelDeploymentIds"],
        message: "Fallbacks must be different from both routing tiers.",
      });
    }
  }
  if (policy.mode === "SEMANTIC") {
    const routeIntents = policy.routes.map((route) => route.intent);
    if (new Set(routeIntents).size !== routeIntents.length) {
      context.addIssue({
        code: "custom",
        path: ["routes"],
        message: "Semantic route intents must be unique.",
      });
    }
    const routeTargets = policy.routes.map((route) => route.modelDeploymentId);
    if (new Set(routeTargets).size !== routeTargets.length) {
      context.addIssue({
        code: "custom",
        path: ["routes"],
        message: "Each semantic route must target a different model deployment.",
      });
    }
    if (routeTargets.includes(policy.defaultModelDeploymentId)) {
      context.addIssue({
        code: "custom",
        path: ["routes"],
        message: "Semantic route targets must be different from the default model.",
      });
    }
    const routedModels = new Set([
      policy.defaultModelDeploymentId,
      ...routeTargets,
    ]);
    if (policy.fallbackModelDeploymentIds.some((id) => routedModels.has(id))) {
      context.addIssue({
        code: "custom",
        path: ["fallbackModelDeploymentIds"],
        message: "Fallbacks must be different from the default and routed models.",
      });
    }
  }
});

const modelRoutingKeyPolicySchema = z.object({
  perInstance: z.literal(true).default(true),
  rotationDays: z.number().int().min(1).max(365).default(90),
}).default({ perInstance: true, rotationDays: 90 });

const modelRoutingAuditPolicySchema = z.object({
  controlPlane: z.literal(true).default(true),
  requestLogs: z.boolean().default(true),
  capturePrompts: z.literal(false).default(false),
}).default({ controlPlane: true, requestLogs: true, capturePrompts: false });

const createModelRoutingBaseSchema = z.object({
  name: z.string().trim().min(2).max(64),
  description: z.string().trim().max(300).default(""),
  gatewayId: z.string().trim().min(1),
  routingPolicy: modelRoutingPolicySchema,
  complianceDomain: z.enum(complianceDomains),
  isDefault: z.boolean().default(false),
  keyPolicy: modelRoutingKeyPolicySchema,
  auditPolicy: modelRoutingAuditPolicySchema,
}).strict();

export const createModelRoutingSchema = createModelRoutingBaseSchema;

export const updateModelRoutingSchema = z.object({
  name: z.string().trim().min(2).max(64).optional(),
  description: z.string().trim().max(300).optional(),
  isDefault: z.boolean().optional(),
  keyPolicy: modelRoutingKeyPolicySchema.optional(),
  auditPolicy: modelRoutingAuditPolicySchema.optional(),
  routingPolicy: modelRoutingPolicySchema.optional(),
  suspended: z.boolean().optional(),
}).strict();

export type AgentStatus = (typeof agentStatuses)[number];
export type ProvisioningStage = (typeof provisioningStages)[number];
export type ProviderKind = (typeof providerKinds)[number];
export type ModelType = (typeof modelTypes)[number];
export type ModelCapability = (typeof modelCapabilities)[number];
export type ModelInputModality = (typeof modelInputModalities)[number];
export type ModelOutputModality = (typeof modelOutputModalities)[number];
export type AgentPlatformId = (typeof agentPlatformIds)[number];
export type AgentPlatform = (typeof agentPlatforms)[number];
export type AgentMemoryConfiguration = z.infer<
  typeof agentMemoryConfigurationSchema
>;
export type SandboxPolicyId = z.infer<typeof sandboxPolicyIdSchema>;
export type SandboxPolicyInput = z.infer<typeof sandboxPolicyInputSchema>;
export type CreateSandboxPolicyInput = z.infer<typeof createSandboxPolicySchema>;
export type UpdateSandboxPolicyInput = z.infer<typeof updateSandboxPolicySchema>;
export type ProviderResourceStatus = (typeof providerResourceStatuses)[number];
export type SkillDefinition = z.infer<typeof skillDefinitionSchema>;
export type SkillTrustLevel = (typeof skillTrustLevels)[number];
export type SkillCompatibilityTarget = (typeof skillCompatibilityTargets)[number];
export type CreateSkillDefinitionInput = z.infer<typeof createSkillDefinitionSchema>;
export type UpdateSkillDefinitionInput = z.infer<typeof updateSkillDefinitionSchema>;
export type McpServerDefinition = z.infer<typeof mcpServerDefinitionSchema>;
export type McpServerConnection = z.infer<typeof mcpServerConnectionSchema>;
export type McpToolDefinition = z.infer<typeof mcpToolDefinitionSchema>;
export type McpServerTemplate = z.infer<typeof mcpServerTemplateSchema>;
export type CreateMcpServerDefinitionInput = z.infer<typeof createMcpServerDefinitionSchema>;
export type UpdateMcpServerDefinitionInput = z.infer<typeof updateMcpServerDefinitionSchema>;
export type AccessPolicyStatus = (typeof accessPolicyStatuses)[number];
export type AccessPolicyDecision = (typeof accessPolicyDecisions)[number];
export type AccessPolicyToolRule = z.infer<typeof accessPolicyToolRuleSchema>;
export type AccessPolicyServerRule = z.infer<typeof accessPolicyServerRuleSchema>;
export type AgentGardenIntegrationType = (typeof agentGardenIntegrationTypeIds)[number];
export type AgentGardenRegisterableType = (typeof agentGardenRegisterableTypeIds)[number];
export type AgentGardenUsageMode = (typeof agentGardenUsageModeIds)[number];
export type AgentGardenUsageCapabilities = z.infer<typeof agentGardenUsageCapabilitiesSchema>;
export type AgentGardenSkill = z.infer<typeof agentGardenSkillSchema>;
export type AgentGardenEntry = z.infer<typeof agentGardenEntrySchema>;
export type CreateAgentGardenEntryInput = z.infer<typeof createAgentGardenEntrySchema>;

export interface AgentMarketplaceBrief {
  tagline: string;
  overview: string;
  useCases: string[];
  inputs: string[];
  outputs: string[];
  requirements: string[];
}
export type AgentConnectionApprovalMode = (typeof agentConnectionApprovalModeIds)[number];
export type AgentConnection = z.infer<typeof agentConnectionSchema>;
export type CreateAgentConnectionInput = z.infer<typeof createAgentConnectionSchema>;
export type AgentGardenSnapshot = z.infer<typeof agentGardenSnapshotSchema>;
export type CreateAccessPolicyInput = z.infer<typeof createAccessPolicySchema>;
export type UpdateAccessPolicyInput = z.infer<typeof updateAccessPolicySchema>;
export type KnowledgeSourceDefinition = z.infer<typeof knowledgeSourceDefinitionSchema>;
export type CreateKnowledgeSourceDefinitionInput = z.infer<typeof createKnowledgeSourceDefinitionSchema>;
export type UpdateKnowledgeSourceDefinitionInput = z.infer<typeof updateKnowledgeSourceDefinitionSchema>;
export type AgentSpecializationDefinition = z.infer<typeof agentSpecializationDefinitionSchema>;
export type ResourceKind = z.infer<typeof resourceKindSchema>;
export type ProviderConnectionDraft = z.infer<typeof providerConnectionDraftSchema>;
export type DiscoverProviderModelsInput = z.infer<typeof discoverProviderModelsSchema>;
export type ProviderModelSelection = z.infer<typeof providerModelSelectionSchema>;
export type CreateProviderConnectionInput = z.infer<typeof createProviderConnectionSchema>;
export type CreateModelDeploymentInput = z.infer<typeof createModelDeploymentSchema>;
export type CreateAgentInput = z.infer<typeof createAgentSchema>;
export type UpdateInstanceAccessPoliciesInput = z.infer<
  typeof updateInstanceAccessPoliciesSchema
>;
export type UpdateProjectQuotaInput = z.infer<typeof updateProjectQuotaSchema>;
export type ComplianceDomain = (typeof complianceDomains)[number];
export type ModelRoutingStatus = (typeof modelRoutingStatuses)[number];
export type ModelRoutingCapabilityState = (typeof modelRoutingCapabilityStates)[number];
export type ModelRoutingMode = (typeof modelRoutingModes)[number];
export type ModelRoutingPolicy = z.infer<typeof modelRoutingPolicySchema>;
export type CreateInferenceGatewayInput = z.infer<typeof createInferenceGatewaySchema>;
export type CreateModelRoutingInput = z.infer<typeof createModelRoutingSchema>;
export type UpdateModelRoutingInput = z.infer<typeof updateModelRoutingSchema>;

export interface InferenceGateway {
  id: string;
  name: string;
  baseUrl: string;
  adminUiUrl: string;
  credentialSource: "ENVIRONMENT" | "SECRET_REFERENCE";
  status: "UNKNOWN" | "READY" | "DEGRADED";
  validationMessage: string;
  validatedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ModelRoutingCondition {
  type: "BINDING" | "GATEWAY" | "COMPLIANCE" | "CAPABILITY";
  status: "PASS" | "FAIL" | "UNKNOWN";
  reason: string;
}

export interface ModelRoutingCapabilities {
  automaticRouting: ModelRoutingCapabilityState;
  routerType: "COMPLEXITY_ROUTER" | "SEMANTIC_ROUTER" | "OTHER" | "UNKNOWN";
  complexityTierCount?: number;
  semanticRouteCount?: number;
  sessionAffinity: ModelRoutingCapabilityState;
  adaptiveRouting: ModelRoutingCapabilityState;
  failover: ModelRoutingCapabilityState;
  generalFallback: ModelRoutingCapabilityState;
  contextWindowFallback: ModelRoutingCapabilityState;
  contentPolicyFallback: ModelRoutingCapabilityState;
  retries: ModelRoutingCapabilityState;
  requestAudit: ModelRoutingCapabilityState;
}

export interface ModelRouting {
  id: string;
  name: string;
  description: string;
  gatewayId: string;
  managementMode: "LITELLM_MANAGED";
  publicModelAlias: string;
  routingPolicy: ModelRoutingPolicy;
  complianceDomain: ComplianceDomain;
  status: ModelRoutingStatus;
  isDefault: boolean;
  keyPolicy: CreateModelRoutingInput["keyPolicy"];
  auditPolicy: CreateModelRoutingInput["auditPolicy"];
  capabilities: ModelRoutingCapabilities;
  conditions: ModelRoutingCondition[];
  configurationHash: string;
  observedGeneration: number;
  validationMessage: string;
  liteLLMTeamId?: string;
  liteLLMVersion?: string;
  consumers: number;
  lastSynchronizedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ModelRoutingBinding {
  id: string;
  modelRoutingId: string;
  agentId: string;
  liteLLMTeamId: string;
  liteLLMTokenId: string;
  keyAlias: string;
  keyFingerprint: string;
  status: "ACTIVE" | "REVOKED";
  createdAt: string;
  revokedAt?: string;
}

export type ModelRoutingConsumer = Omit<ModelRoutingBinding, "liteLLMTokenId">;

export interface ModelRoutingAuditEvent {
  eventId: string;
  timestamp: string;
  actor: string;
  type: string;
  modelRoutingId: string;
  agentId?: string;
  configurationHash: string;
  complianceDomain: ComplianceDomain;
  result: "SUCCESS" | "FAILED";
  reason: string;
}

export interface ResourceCatalog {
  skills: SkillDefinition[];
  mcpServers: McpServerDefinition[];
  mcpServerTemplates: McpServerTemplate[];
  knowledgeSources: KnowledgeSourceDefinition[];
  specializations: AgentSpecializationDefinition[];
}

export interface AccessPolicy extends CreateAccessPolicyInput {
  id: string;
  revision: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  lastReconciledAt?: string;
  lastReconciliationError?: string;
}

export interface AccessPolicyVersion {
  policyId: string;
  revision: number;
  actor: string;
  summary: string;
  snapshot: AccessPolicy;
  createdAt: string;
}

export interface SandboxPolicy extends SandboxPolicyInput {
  id: SandboxPolicyId;
  enforcement: "ENFORCE";
  source: "BUILT_IN" | "CUSTOM";
  immutable: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface SandboxPolicyCatalog {
  defaultPolicyId: SandboxPolicyId;
  templatePolicyYaml: string;
  policies: SandboxPolicy[];
}

export interface ProviderValidationCheck {
  id: "endpoint" | "catalog" | "credentials" | "inference";
  label: string;
  status: "PASS" | "FAIL" | "SKIP";
}

export interface ProviderAccount {
  id: string;
  name: string;
  providerKind: ProviderKind;
  presetId: ProviderKind;
  endpoint: string;
  config: Record<string, unknown>;
  complianceDomain: ComplianceDomain;
  endpointRegion: string;
  crossBorderTransfer: false;
  discoveredModels: string[];
  status: ProviderResourceStatus;
  checks: ProviderValidationCheck[];
  credentialState: "STORED";
  validationMessage: string;
  validationLatencyMs?: number;
  validatedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProviderDiscoveryResult {
  providerKind: ProviderKind;
  mode: "remote" | "suggested" | "manual";
  models: ProviderPresetModel[];
  checks: ProviderValidationCheck[];
  message: string;
  latencyMs?: number;
}

export interface ProviderModelFailure {
  model: ProviderModelSelection;
  message: string;
}

export interface ProviderConnectionCreationResult {
  account: ProviderAccount;
  models: ModelDeployment[];
  failures: ProviderModelFailure[];
}

export interface ModelDeployment extends CreateModelDeploymentInput {
  capabilities: ModelCapability[];
  inputModalities: ModelInputModality[];
  outputModalities: ModelOutputModality[];
  id: string;
  providerPresetId: ProviderKind;
  providerName: string;
  endpoint: string;
  complianceDomain: ComplianceDomain;
  endpointRegion: string;
  crossBorderTransfer: false;
  litellmModelName: string;
  status: ProviderResourceStatus;
  checks: ProviderValidationCheck[];
  validationMessage: string;
  validationLatencyMs?: number;
  validatedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type CostGroupBy =
  | "instance"
  | "model_endpoint"
  | "provider_account"
  | "virtual_key";

export type CostFilterKey =
  | "instance"
  | "model_endpoint"
  | "provider"
  | "provider_account"
  | "virtual_key"
  | "environment"
  | "project";

export type CostFilters = Partial<Record<CostFilterKey, string[]>>;

export interface CostQueryParams {
  startTime: string;
  endTime: string;
  groupBy: CostGroupBy;
  filters: CostFilters;
  timezone: string;
}

export interface CostBreakdownItem {
  id: string;
  label: string;
  detail: string;
  spend: number;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  share: number;
  lastActive?: string;
  provider?: string;
  providerAccount?: string;
  modelsUsed?: number;
  boundInstance?: string;
  boundInstanceId?: string;
  user?: string;
  team?: string;
}

export interface CostDailyPoint {
  date: string;
  spend: number;
  tokens: number;
  requests: number;
  active: number;
  activeObjectIds?: string[];
}

export interface CostTrendSeriesPoint {
  id: string;
  label: string;
  spend: number;
  tokens: number;
  requests: number;
}

export interface CostTrendPoint {
  date: string;
  series: CostTrendSeriesPoint[];
}

export interface CostComparison {
  current: number;
  previous: number;
  changePercent?: number;
}

export interface CostSummary {
  totalSpend: CostComparison;
  totalTokens: CostComparison;
  requests: CostComparison;
  highestCostInstance?: CostBreakdownItem;
  highestCostModel?: CostBreakdownItem;
}

export interface CostInsight {
  id:
    | "highest_spend_day"
    | "average_daily_spend"
    | "active_group"
    | "active_model_endpoints"
    | "most_expensive_provider"
    | "peak_tokens_day";
  label: string;
  subject?: string;
  value: number;
  valueKind: "currency" | "count" | "tokens";
}

export interface CostFilterOption {
  value: string;
  label: string;
}

export type ModelCostGranularity = "daily" | "weekly" | "cumulative";
export type ModelCostTrendGranularity = "day" | "week" | "month";
export type ModelCostSortDirection = "asc" | "desc";

export interface ModelCostObjectSpend {
  id: string;
  name: string;
  spendUsd: number;
  share: number;
}

export interface ModelCostSummaryResponse {
  currency: "USD";
  totalSpendUsd: number;
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  requests: number;
  unknownCostRequests: number;
  highestCostInstance?: ModelCostObjectSpend;
  highestCostModel?: ModelCostObjectSpend;
  comparison: {
    spendPercent?: number;
    tokensPercent?: number;
    requestsPercent?: number;
  };
}

export interface ModelCostActivityItem {
  date: string;
  spendUsd: number;
  tokens: number;
  requests: number;
  activeObjects: number;
  intensity: 0 | 1 | 2 | 3 | 4;
}

export interface ModelCostActivityResponse {
  currency: "USD";
  granularity: ModelCostGranularity;
  items: ModelCostActivityItem[];
  legend: {
    min: number;
    max: number;
    thresholds: [number, number, number, number, number];
  };
}

export interface ModelCostInsightsResponse {
  currency: "USD";
  highestSpendDay?: { date: string; spendUsd: number };
  averageDailySpendUsd: number;
  activeInstances: number;
  activeModelEndpoints: number;
  activeProviderAccounts: number;
  activeVirtualKeys: number;
  mostExpensiveProvider?: { provider: string; spendUsd: number };
  peakTokensDay?: { date: string; tokens: number };
  unknownCostRequests: number;
}

export interface ModelCostRankingItem extends ModelCostObjectSpend {
  tokens: number;
  requests: number;
  rank: number;
}

export interface ModelCostRankingResponse {
  currency: "USD";
  items: ModelCostRankingItem[];
  totalSpendUsd: number;
}

export interface ModelCostTrendSeriesItem {
  date: string;
  spendUsd: number;
  tokens: number;
  requests: number;
}

export interface ModelCostTrendSeries {
  id: string;
  name: string;
  items: ModelCostTrendSeriesItem[];
}

export interface ModelCostTrendResponse {
  currency: "USD";
  dates: string[];
  series: ModelCostTrendSeries[];
}

export interface ModelCostBreakdownItem {
  id: string;
  name: string;
  detail: string;
  spendUsd: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  requests: number;
  averageCostPerRequest: number;
  share: number;
  lastActive?: string;
  provider?: string;
  providerAccount?: string;
  modelsUsed?: number;
  boundInstance?: string;
  boundInstanceId?: string;
  user?: string;
  team?: string;
}

export interface ModelCostBreakdownResponse {
  currency: "USD";
  items: ModelCostBreakdownItem[];
  total: number;
  page: number;
  pageSize: number;
  filterOptions: Record<CostFilterKey, CostFilterOption[]>;
}

export interface ModelCostDataQualityResponse {
  unmappedRequests: number;
  unmappedInstances: number;
  unmappedModelEndpoints: number;
  unmappedProviderAccounts: number;
  tokenMismatchRequests: number;
  negativeSpendRequests: number;
  unknownCostRequests: number;
  duplicateRequests: number;
  lateArrivingRequests: number;
  lastSyncAt?: string;
  syncLagSeconds?: number;
  litellmSpend: number;
  taliSpend: number;
  spendDifference: number;
}

export type PlatformAuditActorType = "user" | "service_account" | "system";
export type PlatformAuditOutcome = "success" | "failed" | "denied";
export type PlatformAuditSortDirection = "asc" | "desc";

export interface PlatformAuditLogQuery {
  query?: string;
  from?: string;
  to?: string;
  actorId?: string;
  action?: string;
  objectType?: string;
  outcome?: PlatformAuditOutcome;
  cursor?: string;
  limit?: number;
  direction?: PlatformAuditSortDirection;
}

export interface PlatformAuditLogFacets {
  actors: Array<{
    id: string;
    name: string;
    email?: string;
  }>;
  actions: string[];
  objectTypes: string[];
}

export interface PlatformAuditLogEvent {
  id: string;
  projectId: string;
  occurredAt: string;
  actor: {
    type: PlatformAuditActorType;
    id: string;
    name: string;
    email?: string;
  };
  authorization: {
    scope: "project";
    role: string;
    decision: "allowed" | "denied";
  };
  action: string;
  verb: string;
  object: {
    type: string;
    id: string;
    name: string;
  };
  outcome: PlatformAuditOutcome;
  summary: string;
  request: {
    id: string;
    method: string;
    route: string;
    ipAddress: string;
    userAgent: string;
    parameters?: Record<string, unknown>;
    body?: unknown;
  };
  trace?: {
    traceId: string;
    spanId?: string;
  };
  metadata?: Record<string, unknown>;
}

export interface PlatformAuditLogListResponse {
  data: PlatformAuditLogEvent[];
  nextCursor?: string;
  totalCount: number;
  facets: PlatformAuditLogFacets;
}

export interface Agent extends Omit<CreateAgentInput, "policyId"> {
  schemaVersion: 2;
  id: string;
  policyId: SandboxPolicyId;
  providerAccountId: string;
  providerName: string;
  modelDeploymentId: string;
  model: string;
  modelType: "llm";
  inferenceMode: "PLATFORM_MANAGED";
  modelRoutingId: string;
  modelRoutingBindingId: string;
  modelRoutingStatus: ModelRoutingStatus;
  modelRoutingComplianceDomain: ComplianceDomain;
  modelRoutingCapabilities: ModelRoutingCapabilities;
  modelRoutingKeyFingerprint: string;
  modelRoutingLastSynchronizedAt?: string;
  costKeyAlias: string;
  liteLLMTokenId?: string;
  liteLLMTeamId?: string;
  serviceAccountId?: string;
  sandboxName: string;
  status: AgentStatus;
  createdAt: string;
  updatedAt: string;
  operationId?: string;
  runtimePhase?: string;
  provisioningStage?: ProvisioningStage;
  logs: string[];
  httpEndpoint?: HttpEndpoint;
  error?: string;
}

export interface ProjectQuotaUsage {
  spendUsd: number;
  totalTokens: number;
  instances: number;
  mcpIntegrations: number;
  knowledgeBaseIntegrations: number;
}

export interface ProjectQuota {
  projectId: string;
  hardBudgetUsd: number | null;
  budgetDuration: "1d" | "7d" | "30d" | null;
  tpmLimit: number | null;
  maxInstances: number | null;
  maxMcpIntegrations: number | null;
  maxKnowledgeBaseIntegrations: number | null;
  litellmTeamId: string | null;
  syncStatus: "pending" | "synced" | "failed";
  lastSyncedAt: string | null;
  lastSyncError: string | null;
  revision: number;
  usage: ProjectQuotaUsage;
}

export interface HttpEndpoint {
  kind: "openclaw-webui" | "hermes-dashboard";
  status: "READY" | "UNAVAILABLE";
  url?: string;
  reason?: string;
}

export interface RunnerSandbox {
  name: string;
  agentPlatform: AgentPlatformId;
  phase:
    | "PROVISIONING"
    | "READY"
    | "FAILED"
    | "NOT_FOUND"
    | "DESTROYING";
  operationId?: string;
  provisioningStage?: ProvisioningStage;
  logs: string[];
  httpEndpoint?: HttpEndpoint;
  error?: string;
}

export interface SandboxAuditEvent {
  id: string;
  timestamp: string;
  source: "gateway" | "sandbox" | "unknown";
  category: string;
  severity: "INFO" | "LOW" | "MED" | "HIGH" | "CRIT" | "UNKNOWN";
  decision:
    | "ALLOWED"
    | "DENIED"
    | "BLOCKED"
    | "APPROVED"
    | "REJECTED"
    | "OBSERVED";
  summary: string;
  policy?: string;
  raw: string;
}

export interface RunnerHealth {
  ok: boolean;
  mode: string;
}

export interface RuntimeStatus {
  mode: string;
  terminal: {
    available: boolean;
    kind: "nemoclaw-tui";
    transport: "nemoclaw" | "openshell" | "none";
    reason?: string;
  };
}

export function supportsNemoClawTui(mode: string): boolean {
  return mode === "nemoclaw" || mode === "openshell-kubernetes";
}

export interface TerminalSessionResponse {
  id: string;
  expiresAt: string;
  websocketUrl: string;
}

export interface TerminalTarget {
  id: string;
  containerName: string;
  displayName?: string;
  primary: boolean;
  available: boolean;
  reason?: string;
  shells: string[];
}

export const createTerminalSessionInputSchema = z.object({
  targetId: z.string().trim().min(1).max(128),
});

export type CreateTerminalSessionInput = z.infer<
  typeof createTerminalSessionInputSchema
>;

const terminalResizePrefix = "\u0000TALI_RESIZE:";

export interface TerminalResize {
  cols: number;
  rows: number;
}

export function encodeTerminalResize({ cols, rows }: TerminalResize): string {
  return `${terminalResizePrefix}${cols}:${rows}`;
}

export function parseTerminalResize(input: string): TerminalResize | undefined {
  if (!input.startsWith(terminalResizePrefix)) return undefined;
  const parts = input.slice(terminalResizePrefix.length).split(":");
  if (parts.length !== 2) return undefined;
  const [colsText, rowsText] = parts;
  if (colsText === undefined || rowsText === undefined) return undefined;
  const cols = Number(colsText);
  const rows = Number(rowsText);
  if (
    !Number.isInteger(cols) ||
    !Number.isInteger(rows) ||
    cols < 20 ||
    cols > 500 ||
    rows < 5 ||
    rows > 300
  )
    return undefined;
  return { cols, rows };
}
