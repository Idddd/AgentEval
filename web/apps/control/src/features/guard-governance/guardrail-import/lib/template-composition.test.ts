import { describe, expect, it } from "vitest";
import type { GuardrailTemplate } from "./contracts";
import { composeTemplates, parameterKey } from "./template-composition";

const baseline: GuardrailTemplate = {
  id: "baseline",
  name: "Baseline Protection",
  description: "Protect approved finance workflows.",
  purpose: "Protect finance analysis and policy explanation.",
  allowed_topics: ["Approved finance analysis", "Policy explanation"],
  restricted_topics: ["Credential disclosure"],
  default_controls: [
    { risk: "pii", action: "redact" },
    { risk: "prompt_injection", action: "reject" },
  ],
  safety_level: "balanced",
  output_delivery: "interruptible",
};

const strict: GuardrailTemplate = {
  id: "strict",
  name: "Strict Protection",
  description: "Reject unsafe finance behavior.",
  purpose: "Prevent unsafe advice and instruction attacks.",
  allowed_topics: ["approved FINANCE analysis"],
  restricted_topics: ["Unsafe instructions", "credential disclosure"],
  default_controls: [
    { risk: "prompt_injection", action: "reject" },
    { risk: "content_safety", action: "reject" },
  ],
  safety_level: "strict",
  output_delivery: "full_buffered",
};

describe("template composition", () => {
  it("combines templates deterministically and removes duplicate policy data", () => {
    const result = composeTemplates([strict, baseline]);

    expect(result).toEqual(composeTemplates([baseline, strict]));
    expect(result.allowedTopics).toEqual([
      "Approved finance analysis",
      "Policy explanation",
    ]);
    expect(result.restrictedTopics).toEqual([
      "Credential disclosure",
      "Unsafe instructions",
    ]);
    expect(result.controls).toHaveLength(3);
    expect(result.safetyLevel).toBe("strict");
    expect(result.outputDelivery).toBe("full_buffered");
    expect(result.purpose).toContain("Baseline Protection");
    expect(result.purpose).toContain("Strict Protection");
  });

  it("namespaces parameter values by their source template", () => {
    expect(parameterKey("baseline-pii-protection", "brand_name")).toBe(
      "baseline-pii-protection::brand_name",
    );
  });
});
