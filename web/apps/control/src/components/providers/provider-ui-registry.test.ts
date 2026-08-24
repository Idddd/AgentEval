import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  complianceDomains,
  providerComplianceDomains,
  providerKinds,
  providerPresets,
} from "@tasklattice/contracts";
import { createProviderDraft, providerUiRegistry } from "./provider-ui-registry";

describe("providerUiRegistry", () => {
  it("has one independent configurator and local icon for every built-in Provider", () => {
    expect(Object.keys(providerUiRegistry).sort()).toEqual([...providerKinds].sort());
    expect(providerPresets).toHaveLength(20);
    expect(new Set(Object.values(providerUiRegistry).map((entry) => entry.Component)).size).toBe(20);
    expect(new Set(providerPresets.map((provider) => provider.icon)).size).toBe(20);
    for (const provider of providerPresets) {
      expect(providerUiRegistry[provider.id].Component.name).toMatch(/Provider$/);
      expect(provider.icon).toMatch(/^\/assets\/providers\/.+\.(svg|webp)$/);
      expect(existsSync(fileURLToPath(new URL(`../../../public${provider.icon}`, import.meta.url)))).toBe(true);
      expect(providerUiRegistry[provider.id].createDraft().provider).toBe(provider.id);
    }
  });

  it("defines at least one supported compliance boundary for every Provider", () => {
    for (const provider of providerKinds) {
      expect(providerComplianceDomains[provider].length).toBeGreaterThan(0);
      expect(providerComplianceDomains[provider].every((domain) =>
        complianceDomains.includes(domain)
      )).toBe(true);
    }
  });

  it("adapts regional Provider defaults from the compliance boundary", () => {
    expect(createProviderDraft("qwen", "CN_MAINLAND")).toMatchObject({
      config: {
        region: "cn",
        endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      },
    });
    expect(createProviderDraft("qwen", "APAC_EX_CN")).toMatchObject({
      config: {
        region: "international",
        endpoint: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
      },
    });
    expect(createProviderDraft("moonshot", "CN_MAINLAND")).toMatchObject({
      config: { region: "cn", endpoint: "https://api.moonshot.cn/v1" },
    });
    expect(createProviderDraft("aws-bedrock", "EU_EEA")).toMatchObject({
      config: { region: "eu-central-1" },
    });
    expect(createProviderDraft("vertex-ai", "UK")).toMatchObject({
      config: { location: "europe-west2" },
    });
    expect(() =>
      createProviderDraft("aws-bedrock", "CN_MAINLAND")
    ).toThrow("not available");
  });
});
