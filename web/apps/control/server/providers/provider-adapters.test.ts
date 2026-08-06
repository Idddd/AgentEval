import { describe, expect, it } from "vitest";
import { providerKinds, type ProviderConnectionDraft } from "@tasklattice/contracts";
import { createProviderDraft } from "../../src/components/providers/provider-ui-registry";
import { providerAdapterRegistry } from "./provider-adapters";

describe("providerAdapterRegistry", () => {
  it("registers exactly one adapter for every built-in Provider", () => {
    expect(Object.keys(providerAdapterRegistry).sort()).toEqual([...providerKinds].sort());
    expect(new Set(Object.values(providerAdapterRegistry).map((adapter) => adapter.kind)).size).toBe(20);
  });

  it("builds native LiteLLM parameters for regional, cloud, and custom Providers", () => {
    const qwen = {
      provider: "qwen",
      name: "Qwen",
      config: { region: "international", endpoint: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1" },
      credentials: { apiKey: "dashscope-secret" },
    } satisfies ProviderConnectionDraft;
    expect(providerAdapterRegistry.qwen.toLiteLLMParams(qwen, {
      modelId: "qwen-plus",
      displayName: "Qwen Plus",
      modelType: "llm",
    })).toMatchObject({ model: "dashscope/qwen-plus", api_key: "dashscope-secret" });

    const bedrock = {
      provider: "aws-bedrock",
      name: "Bedrock",
      config: { region: "us-east-1", roleArn: "arn:aws:iam::123:role/llm" },
      credentials: { accessKeyId: "AKIA", secretAccessKey: "secret" },
    } satisfies ProviderConnectionDraft;
    expect(providerAdapterRegistry["aws-bedrock"].toLiteLLMParams(bedrock, {
      modelId: "anthropic.claude-3-5-sonnet-20241022-v2:0",
      displayName: "Claude",
      modelType: "llm",
    })).toMatchObject({ model: "bedrock/anthropic.claude-3-5-sonnet-20241022-v2:0", aws_region_name: "us-east-1" });

    const custom = {
      provider: "custom-anthropic-compatible",
      name: "Custom Anthropic",
      config: { endpoint: "https://anthropic.example.com" },
      credentials: { apiKey: "secret" },
    } satisfies ProviderConnectionDraft;
    expect(providerAdapterRegistry["custom-anthropic-compatible"].toLiteLLMParams(custom, {
      modelId: "claude-local",
      displayName: "Claude Local",
      modelType: "llm",
    })).toMatchObject({ model: "anthropic/claude-local", api_base: "https://anthropic.example.com" });
  });

  it("maps every built-in Provider to its LiteLLM model prefix", () => {
    const expectedModels = {
      openai: "openai/model-id",
      anthropic: "anthropic/model-id",
      gemini: "gemini/model-id",
      deepseek: "deepseek/model-id",
      qwen: "dashscope/model-id",
      moonshot: "moonshot/model-id",
      zai: "zai/model-id",
      minimax: "minimax/model-id",
      "baidu-qianfan": "openai/model-id",
      volcengine: "volcengine/model-id",
      "nvidia-nim": "nvidia_nim/model-id",
      "azure-openai": "azure/model-id",
      "aws-bedrock": "bedrock/model-id",
      "vertex-ai": "vertex_ai/model-id",
      openrouter: "openrouter/model-id",
      ollama: "ollama_chat/model-id",
      vllm: "hosted_vllm/model-id",
      huggingface: "huggingface/model-id",
      "custom-openai-compatible": "openai/model-id",
      "custom-anthropic-compatible": "anthropic/model-id",
    } as const;

    for (const kind of providerKinds) {
      const params = providerAdapterRegistry[kind].toLiteLLMParams(
        createProviderDraft(kind),
        { modelId: "model-id", displayName: "Model", modelType: "llm" },
      );
      expect(params.model).toBe(expectedModels[kind]);
    }
  });

  it("maps Provider-specific cloud and gateway credentials", () => {
    const model = { modelId: "model-id", displayName: "Model", modelType: "llm" } as const;

    expect(providerAdapterRegistry["azure-openai"].toLiteLLMParams({
      provider: "azure-openai",
      name: "Azure",
      config: { endpoint: "https://example.openai.azure.com", apiVersion: "2025-04-01-preview", deployment: "gpt-prod" },
      credentials: { apiKey: "azure-secret" },
    }, model)).toMatchObject({ model: "azure/gpt-prod", api_version: "2025-04-01-preview", api_key: "azure-secret" });

    expect(providerAdapterRegistry["vertex-ai"].toLiteLLMParams({
      provider: "vertex-ai",
      name: "Vertex",
      config: { project: "tali-project", location: "us-central1" },
      credentials: { serviceAccountJson: "{\"type\":\"service_account\"}" },
    }, model)).toMatchObject({ vertex_project: "tali-project", vertex_location: "us-central1", vertex_credentials: "{\"type\":\"service_account\"}" });

    expect(providerAdapterRegistry.openrouter.toLiteLLMParams({
      provider: "openrouter",
      name: "OpenRouter",
      config: { endpoint: "https://openrouter.ai/api/v1", siteUrl: "https://tasklattice.example", appName: "TaskLattice" },
      credentials: { apiKey: "router-secret" },
    }, model)).toMatchObject({ extra_headers: { "HTTP-Referer": "https://tasklattice.example", "X-Title": "TaskLattice" } });

    expect(providerAdapterRegistry["baidu-qianfan"].toLiteLLMParams({
      provider: "baidu-qianfan",
      name: "Qianfan",
      config: { endpoint: "https://qianfan.baidubce.com/v2", appId: "qianfan-app" },
      credentials: { apiKey: "qianfan-secret" },
    }, model)).toMatchObject({ api_base: "https://qianfan.baidubce.com/v2", extra_headers: { appid: "qianfan-app" } });

    expect(providerAdapterRegistry.volcengine.toLiteLLMParams({
      provider: "volcengine",
      name: "Volcengine",
      config: { endpoint: "https://ark.cn-beijing.volces.com/api/v3", endpointId: "ep-123" },
      credentials: { apiKey: "ark-secret" },
    }, model)).toMatchObject({ model: "volcengine/ep-123", api_key: "ark-secret" });

    expect(providerAdapterRegistry.huggingface.toLiteLLMParams({
      provider: "huggingface",
      name: "Hugging Face",
      config: { mode: "dedicated", endpoint: "https://dedicated.endpoints.huggingface.cloud" },
      credentials: { apiKey: "hf-secret" },
    }, model)).toMatchObject({ model: "huggingface/tgi", api_base: "https://dedicated.endpoints.huggingface.cloud", api_key: "hf-secret" });
  });
});
