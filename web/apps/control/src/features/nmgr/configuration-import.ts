import { z } from "zod";
import { configError, unifiedConfigSchema } from "../business-demo/evaluation";
import { controlUnits, deployedEntity, type Entity, type State } from "./model";

export const maxImportBytes = 1024 * 1024;
const requiredText = z.string().trim().min(1).max(100000);
const configurationSchema = z.object({
  kind: z.enum(["Guardrail", "Profile"]),
  id: z.string().regex(/^[a-z][a-z0-9-]{2,63}$/),
  name: requiredText.max(200),
  description: requiredText,
  unit: z.enum(controlUnits).default("ISS"),
  provider: z.enum(["NeMo", "F5"]).default("NeMo"),
  location: z.enum(["ALL", "SG", "CN", "IN", "ID", "HK", "TW"]).default("ALL"),
  mandatory: z.boolean().default(false),
  attributes: z.object({
    bu: requiredText.default("ALL"),
    agent: requiredText.default("ALL"),
    data: requiredText.default("ALL"),
  }).default({ bu: "ALL", agent: "ALL", data: "ALL" }),
  policies: z.array(requiredText).max(200).default([]),
  refs: z.array(requiredText).max(200).default([]),
  config: unifiedConfigSchema.optional(),
  threshold: z.number().min(0).max(100).default(10),
  thresholdMetric: z.enum(["Block Rate", "Pass Rate", "Error Rate"]).default("Block Rate"),
  thresholdWindow: z.number().int().positive().default(5),
});

function records(value: unknown): unknown {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return value;
  const envelope = value as Record<string, unknown>;
  if ("entities" in envelope) return envelope.entities;
  if ("guardrails" in envelope || "profiles" in envelope) {
    const guardrails = envelope.guardrails ?? [];
    const profiles = envelope.profiles ?? [];
    if (!Array.isArray(guardrails) || !Array.isArray(profiles))
      throw new Error("guardrails and profiles must be arrays.");
    const withKind = (items: unknown[], kind: Entity["kind"]) => items.map((item) =>
      item && typeof item === "object" && !Array.isArray(item)
        ? { ...item, kind }
        : item,
    );
    return [...withKind(guardrails, "Guardrail"), ...withKind(profiles, "Profile")];
  }
  return value;
}

export function parseConfigurationJson(text: string, state: State): Entity[] {
  if (new TextEncoder().encode(text).byteLength > maxImportBytes)
    throw new Error("Maximum JSON file size is 1 MB.");
  let value: unknown;
  try { value = JSON.parse(text); }
  catch { throw new Error("Invalid JSON. Check the file syntax."); }
  const parsed = z.array(configurationSchema).min(1).max(200).safeParse(records(value));
  if (!parsed.success)
    throw new Error(parsed.error.issues.slice(0, 3).map((issue) =>
      `${issue.path.length ? `Record ${Number(issue.path[0]) + 1}, ${issue.path.slice(1).join(".") || "configuration"}: ` : ""}${issue.message}`,
    ).join("\n"));

  const ids = new Set(state.entities.map((item) => item.id));
  for (const item of parsed.data) {
    if (ids.has(item.id)) throw new Error(`ID '${item.id}' already exists. Use a new ID; existing records are not overwritten.`);
    ids.add(item.id);
    if (item.config) {
      const error = configError(item.config);
      if (error) throw new Error(`${item.id}: ${error}`);
    }
  }
  const guards = new Set([
    ...state.entities.filter((item) => item.kind === "Guardrail").map((item) => item.id),
    ...parsed.data.filter((item) => item.kind === "Guardrail").map((item) => item.id),
  ]);
  for (const item of parsed.data.filter((item) => item.kind === "Profile")) {
    if (!item.refs.length) throw new Error(`${item.id}: Select at least one Guardrail reference.`);
    for (const ref of item.refs)
      if (!guards.has(ref)) throw new Error(`${item.id}: Unknown Guardrail reference '${ref}'.`);
    const mandatory = state.entities.map(deployedEntity).filter((guard) =>
      guard.kind === "Guardrail" && guard.deployed !== null && guard.mandatory &&
      (guard.location === "ALL" || item.location === "ALL" || guard.location === item.location),
    );
    if (mandatory.some((guard) => !item.refs.includes(guard.id)))
      throw new Error(`${item.id}: Include all mandatory Guardrails for this jurisdiction.`);
  }
  const updated = new Date().toISOString();
  // Import configuration only. Approval, test evidence and active versions in
  // exported workspaces cannot activate newly imported entities.
  return parsed.data.map(({ config, ...item }): Entity => ({
    ...item,
    ...(config ? { config } : {}),
    refs: item.kind === "Profile" ? [...new Set(item.refs)] : [],
    custodian: "User", approver: "User Admin",
    status: "DRAFT", version: 1, configurationRevision: 0,
    deployed: null, deployedRefs: [], runs: [], mode: "Normal", updated,
  }));
}

export function importConfigurationJson(state: State, text: string): State {
  const imported = parseConfigurationJson(text, state);
  return {
    entities: [...imported, ...state.entities],
    audit: [
      ...imported.map((item) => ({
        id: crypto.randomUUID(), time: item.updated, entity: item.id,
        action: "configuration imported as Draft", actor: "User",
      })),
      ...state.audit,
    ],
  };
}
