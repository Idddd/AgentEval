import type { MarketplaceResource, CreateResourceInput } from "./contracts";

const starters: Array<CreateResourceInput & { id: string; createdBy: string }> =
  [
    {
      id: "responsible-ai",
      name: "Responsible AI essentials",
      description:
        "A thoughtful starting point for everyday AI. Protect personal information and keep conversations safe, helpful and on track.",
      businessArea: "General",
      protections: ["personal-data", "harmful-content", "prompt-injection"],
      checkpoints: ["input", "output"],
      allowedTopics: ["Approved business activities"],
      restrictedTopics: [
        "Unsafe instructions",
        "Requests for private information",
      ],
      createdBy: "AI Marketplace",
    },
    {
      id: "customer-care",
      name: "Customer care",
      description:
        "Support customers with confidence. Keep customer details private and focus answers on your products, services and approved guidance.",
      businessArea: "Customer service",
      protections: ["personal-data", "topic-boundaries", "accurate-responses"],
      checkpoints: ["input", "output"],
      allowedTopics: [
        "Product questions",
        "Order support",
        "Approved service policies",
      ],
      restrictedTopics: [
        "Other customers’ personal data",
        "Unapproved commitments",
      ],
      createdBy: "AI Marketplace",
    },
    {
      id: "employee-support",
      name: "Employee support",
      description:
        "Help employees find the information they need while keeping personnel records and sensitive workplace matters confidential.",
      businessArea: "People & HR",
      protections: ["personal-data", "confidential-data", "topic-boundaries"],
      checkpoints: ["input", "output"],
      allowedTopics: [
        "Onboarding",
        "Employee benefits",
        "Published workplace policies",
      ],
      restrictedTopics: [
        "Individual personnel records",
        "Private compensation details",
      ],
      createdBy: "AI Marketplace",
    },
    {
      id: "financial-guidance",
      name: "Financial information",
      description:
        "Explain financial information within clear boundaries. Protect account details and keep guidance grounded in approved sources.",
      businessArea: "Finance",
      protections: ["personal-data", "confidential-data", "accurate-responses"],
      checkpoints: ["input", "output"],
      allowedTopics: [
        "Published financial information",
        "General product explanations",
      ],
      restrictedTopics: [
        "Personalized investment recommendations",
        "Account credentials",
      ],
      createdBy: "AI Marketplace",
    },
    {
      id: "brand-voice",
      name: "Brand-safe conversations",
      description:
        "Keep your AI aligned with the way your business communicates. Set clear topic boundaries and avoid inappropriate content.",
      businessArea: "Sales & marketing",
      protections: [
        "harmful-content",
        "topic-boundaries",
        "accurate-responses",
      ],
      checkpoints: ["output"],
      allowedTopics: ["Approved product information", "Brand messaging"],
      restrictedTopics: [
        "Unsubstantiated product claims",
        "Discriminatory language",
      ],
      createdBy: "AI Marketplace",
    },
    {
      id: "internal-knowledge",
      name: "Internal knowledge",
      description:
        "Make internal knowledge useful without exposing what should stay private. Protect confidential information and resist instruction attacks.",
      businessArea: "General",
      protections: [
        "confidential-data",
        "prompt-injection",
        "accurate-responses",
      ],
      checkpoints: ["input", "output"],
      allowedTopics: ["Approved internal documentation"],
      restrictedTopics: [
        "Passwords and API keys",
        "Restricted business records",
      ],
      createdBy: "AI Marketplace",
    },
  ];

export function createFixtures(): MarketplaceResource[] {
  const templates: MarketplaceResource[] = starters.map((item, index) => ({
    ...item,
    id: `template-${item.id}`,
    kind: "templates",
    status: "available",
    createdAt: "2026-09-01T09:00:00+08:00",
    updatedAt: `2026-09-${String(10 - index).padStart(2, "0")}T09:00:00+08:00`,
  }));
  const names = [
    "Everyday AI protection",
    "Customer support assistant",
    "Onboarding assistant",
    "Finance knowledge assistant",
  ];
  return [
    ...templates,
    ...starters
      .slice(0, 4)
      .map((item, index): MarketplaceResource => ({
        ...item,
        name: names[index]!,
        id: `guardrail-${item.id}`,
        templateId: `template-${item.id}`,
        kind: "guardrails",
        status: "draft",
        createdBy: "Business team",
        createdAt: "2026-09-01T10:00:00+08:00",
        updatedAt: `2026-09-${String(10 - index).padStart(2, "0")}T10:00:00+08:00`,
      })),
  ];
}
