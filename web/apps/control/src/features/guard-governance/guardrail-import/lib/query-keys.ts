export const queryKeys = {
  guardrails: ["resources", "guardrails"] as const,
  guardrail: (id: string) => ["resources", "guardrails", id] as const,
  guardrailVersions: (id: string) =>
    ["resources", "guardrail-versions", id] as const,
  guardrailTemplates: ["resources", "guardrail-templates"] as const,
  controlDefinitions: ["resources", "control-definitions"] as const,
  testCases: (id: string) =>
    ["resources", "test-cases", { guardrailId: id }] as const,
  assignments: ["resources", "assignments"] as const,
  trafficScopeFields: ["resources", "traffic-scope-fields"] as const,
  intentAnalysisStatus: ["resources", "intent-analysis-status"] as const,
  metrics: ["resources", "metrics"] as const,
};
