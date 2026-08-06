import {
  providerPresets,
  providerSupportsComplianceDomain,
  type ComplianceDomain,
  type ProviderConnectionDraft,
  type ProviderKind,
} from "@tasklattice/contracts";
import { AnthropicProvider } from "./configurators/anthropic-provider";
import { AwsBedrockProvider } from "./configurators/aws-bedrock-provider";
import { AzureOpenAIProvider } from "./configurators/azure-openai-provider";
import { BaiduQianfanProvider } from "./configurators/baidu-qianfan-provider";
import { CustomAnthropicProvider } from "./configurators/custom-anthropic-provider";
import { CustomOpenAIProvider } from "./configurators/custom-openai-provider";
import { DeepSeekProvider } from "./configurators/deepseek-provider";
import { GeminiProvider } from "./configurators/gemini-provider";
import { HuggingFaceProvider } from "./configurators/huggingface-provider";
import { MiniMaxProvider } from "./configurators/minimax-provider";
import { MoonshotProvider } from "./configurators/moonshot-provider";
import { NvidiaNimProvider } from "./configurators/nvidia-nim-provider";
import { OllamaProvider } from "./configurators/ollama-provider";
import { OpenAIProvider } from "./configurators/openai-provider";
import { OpenRouterProvider } from "./configurators/openrouter-provider";
import { QwenProvider } from "./configurators/qwen-provider";
import type { ProviderConfigurator } from "./configurators/types";
import { VertexAIProvider } from "./configurators/vertex-ai-provider";
import { VllmProvider } from "./configurators/vllm-provider";
import { VolcengineProvider } from "./configurators/volcengine-provider";
import { ZaiProvider } from "./configurators/zai-provider";

export interface ProviderUiDefinition {
  Component: ProviderConfigurator;
  createDraft(domain?: ComplianceDomain): ProviderConnectionDraft;
}

const keyed = (provider: ProviderKind, endpoint: string): ProviderConnectionDraft => ({
  provider,
  name: `${providerPresets.find((item) => item.id === provider)?.name ?? provider} production`,
  config: { endpoint },
  credentials: { apiKey: "" },
} as ProviderConnectionDraft);

export const providerUiRegistry = {
  openai: { Component: OpenAIProvider, createDraft: () => ({ ...keyed("openai", "https://api.openai.com/v1"), provider: "openai", config: { endpoint: "https://api.openai.com/v1", organization: undefined }, credentials: { apiKey: "" } }) },
  anthropic: { Component: AnthropicProvider, createDraft: () => keyed("anthropic", "https://api.anthropic.com") },
  gemini: { Component: GeminiProvider, createDraft: () => keyed("gemini", "https://generativelanguage.googleapis.com") },
  deepseek: { Component: DeepSeekProvider, createDraft: () => keyed("deepseek", "https://api.deepseek.com/v1") },
  qwen: { Component: QwenProvider, createDraft: (domain = "GLOBAL") => domain === "CN_MAINLAND"
    ? ({ provider: "qwen", name: "Qwen China", config: { region: "cn", endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1" }, credentials: { apiKey: "" } })
    : ({ provider: "qwen", name: "Qwen international", config: { region: "international", endpoint: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1" }, credentials: { apiKey: "" } }) },
  moonshot: { Component: MoonshotProvider, createDraft: (domain = "GLOBAL") => domain === "CN_MAINLAND"
    ? ({ provider: "moonshot", name: "Moonshot China", config: { region: "cn", endpoint: "https://api.moonshot.cn/v1" }, credentials: { apiKey: "" } })
    : ({ provider: "moonshot", name: "Moonshot global", config: { region: "global", endpoint: "https://api.moonshot.ai/v1" }, credentials: { apiKey: "" } }) },
  zai: { Component: ZaiProvider, createDraft: () => keyed("zai", "https://api.z.ai/api/paas/v4") },
  minimax: { Component: MiniMaxProvider, createDraft: () => keyed("minimax", "https://api.minimax.io/v1") },
  "baidu-qianfan": { Component: BaiduQianfanProvider, createDraft: () => ({ provider: "baidu-qianfan", name: "Baidu Qianfan production", config: { endpoint: "https://qianfan.baidubce.com/v2", appId: undefined }, credentials: { apiKey: "" } }) },
  volcengine: { Component: VolcengineProvider, createDraft: () => ({ provider: "volcengine", name: "Volcengine production", config: { endpoint: "https://ark.cn-beijing.volces.com/api/v3", endpointId: "" }, credentials: { apiKey: "" } }) },
  "nvidia-nim": { Component: NvidiaNimProvider, createDraft: () => keyed("nvidia-nim", "https://integrate.api.nvidia.com/v1") },
  "azure-openai": { Component: AzureOpenAIProvider, createDraft: () => ({ provider: "azure-openai", name: "Azure OpenAI production", config: { endpoint: "", apiVersion: "2024-10-21", deployment: "" }, credentials: { apiKey: "" } }) },
  "aws-bedrock": { Component: AwsBedrockProvider, createDraft: (domain = "GLOBAL") => ({ provider: "aws-bedrock", name: "AWS Bedrock production", config: { region: defaultAwsRegion(domain), roleArn: undefined }, credentials: { accessKeyId: "", secretAccessKey: "", sessionToken: undefined } }) },
  "vertex-ai": { Component: VertexAIProvider, createDraft: (domain = "GLOBAL") => ({ provider: "vertex-ai", name: "Vertex AI production", config: { project: "", location: defaultVertexLocation(domain) }, credentials: { serviceAccountJson: "" } }) },
  openrouter: { Component: OpenRouterProvider, createDraft: () => ({ provider: "openrouter", name: "OpenRouter production", config: { endpoint: "https://openrouter.ai/api/v1", siteUrl: undefined, appName: "TaskLattice" }, credentials: { apiKey: "" } }) },
  ollama: { Component: OllamaProvider, createDraft: () => ({ provider: "ollama", name: "Local Ollama", config: { endpoint: "http://host.docker.internal:11434" }, credentials: {} }) },
  vllm: { Component: VllmProvider, createDraft: () => ({ provider: "vllm", name: "Self-hosted vLLM", config: { endpoint: "http://host.docker.internal:8000/v1" }, credentials: { apiKey: undefined } }) },
  huggingface: { Component: HuggingFaceProvider, createDraft: () => ({ provider: "huggingface", name: "Hugging Face production", config: { mode: "serverless", endpoint: undefined, inferenceProvider: undefined }, credentials: { apiKey: "" } }) },
  "custom-openai-compatible": { Component: CustomOpenAIProvider, createDraft: () => ({ provider: "custom-openai-compatible", name: "Custom OpenAI endpoint", config: { endpoint: "" }, credentials: { apiKey: undefined } }) },
  "custom-anthropic-compatible": { Component: CustomAnthropicProvider, createDraft: () => ({ provider: "custom-anthropic-compatible", name: "Custom Anthropic endpoint", config: { endpoint: "" }, credentials: { apiKey: "" } }) },
} satisfies Record<ProviderKind, ProviderUiDefinition>;

export function createProviderDraft(
  kind: ProviderKind,
  domain: ComplianceDomain = "GLOBAL",
): ProviderConnectionDraft {
  if (!providerSupportsComplianceDomain(kind, domain)) {
    throw new Error(`${kind} is not available in the ${domain} boundary.`);
  }
  return providerUiRegistry[kind].createDraft(domain);
}

function defaultAwsRegion(domain: ComplianceDomain): string {
  switch (domain) {
    case "GLOBAL":
    case "US":
      return "us-east-1";
    case "EU_EEA":
      return "eu-central-1";
    case "UK":
      return "eu-west-2";
    case "APAC_EX_CN":
      return "ap-southeast-1";
    case "CN_MAINLAND":
      throw new Error("AWS Bedrock is not available in the Mainland China boundary.");
  }
}

function defaultVertexLocation(domain: ComplianceDomain): string {
  switch (domain) {
    case "GLOBAL":
    case "US":
      return "us-central1";
    case "EU_EEA":
      return "europe-west4";
    case "UK":
      return "europe-west2";
    case "APAC_EX_CN":
      return "asia-southeast1";
    case "CN_MAINLAND":
      throw new Error("Vertex AI is not available in the Mainland China boundary.");
  }
}
