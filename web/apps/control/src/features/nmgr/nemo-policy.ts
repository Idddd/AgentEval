// Shared preflight only. NeMo remains authoritative for detector and rule schemas.
// Explicit editable example, never inserted or synchronized automatically.
export const NEMO_POLICY_SAMPLE = JSON.stringify({
  schema_version: 1,
  kind: "Policy",
  metadata: {
    id: "sample-keyword-policy", name: "Sample keyword policy", description: "Block the test-secret marker in input.", version: "0",
    tags: [{ namespace: "protection", value: "content_filters", label: "Content filters", source: "declared" }],
    safety_level: "balanced", output_delivery: "full_buffered",
  },
  parameters: [],
  rules: [{
    id: "block-test-secret", name: "Block test marker", description: "Example only: replace the marker with your detection terms.", stages: ["input"],
    detector: { ref: "text/keyword", version: "1.0.0", parameters: { detector_options: { terms: ["test-secret"] } } },
    on_match: { action: "block" }, risk_level: "medium", metadata: { taxonomy_ids: ["TALI-BUSINESS-POLICY"] },
  }],
  tests: [
    { id: "blocks-marker", name: "Block the test marker", description: "", phase: "input", content: "Contains test-secret", expected_decision: "block", covered_rule_ids: ["block-test-secret"], kind: "rule_acceptance", scope: "rule", required: true, group: "Sample acceptance", parameter_names: [] },
    { id: "allows-normal-input", name: "Allow ordinary input", description: "", phase: "input", content: "Hello, how can you help?", expected_decision: "allow", covered_rule_ids: [], kind: "scenario", scope: "policy", required: true, group: "Sample acceptance", parameter_names: [] },
  ],
  execution: { mode: "sequential", input: "previous_output", stop_on: "block" },
}, null, 2);

export function parseNemoPolicy(content: string, requireTests = false) {
  let definition: any;
  try { definition = JSON.parse(content); }
  catch { throw new Error("Enter valid NeMo Policy JSON. Natural-language instructions cannot be synchronized as a NeMo Policy. Use Keywords or Regex for simple rules, or provide an executable Policy definition."); }
  if (definition?.kind !== "Policy" || definition.schema_version !== 1 || !Array.isArray(definition.rules) || !definition.rules.length || !Array.isArray(definition.tests)) {
    throw new Error('NeMo Policy JSON requires kind "Policy", schema_version 1, a non-empty rules array and a tests array. NeMo validates the complete definition during synchronization.');
  }
  if (requireTests && !definition.tests.length) throw new Error("Add acceptance tests to the NeMo Policy JSON before running evaluation.");
  return definition;
}

export function nemoPolicyError(content: string): string | null {
  try { parseNemoPolicy(content); return null; }
  catch (error) { return (error as Error).message; }
}
