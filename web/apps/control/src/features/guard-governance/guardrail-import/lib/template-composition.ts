import type {
  GuardrailControl,
  GuardrailTemplate,
  OutputDelivery,
  SafetyLevel,
} from "./contracts";

export type ComposedTemplateIntent = {
  name: string;
  purpose: string;
  allowedTopics: string[];
  restrictedTopics: string[];
  controls: GuardrailControl[];
  safetyLevel: SafetyLevel;
  outputDelivery: OutputDelivery;
};

const safetyRank: Record<SafetyLevel, number> = {
  balanced: 0,
  strict: 1,
};

const deliveryRank: Record<OutputDelivery, number> = {
  interruptible: 0,
  window_buffered: 1,
  full_buffered: 2,
};

export function parameterKey(templateId: string, parameterName: string) {
  return `${templateId}::${parameterName}`;
}

export function composeTemplates(
  templates: GuardrailTemplate[],
): ComposedTemplateIntent {
  const ordered = [...templates].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
  if (!ordered.length) throw new Error("Select at least one Guardrail template");

  const names = ordered.map((template) => template.name);
  return {
    name:
      names.length === 1
        ? names[0]
        : `${names.slice(0, 2).join(" + ")}${names.length > 2 ? ` + ${names.length - 2} more` : ""}`,
    purpose: buildPurpose(ordered),
    allowedTopics: uniqueText(ordered.flatMap((item) => item.allowed_topics)),
    restrictedTopics: uniqueText(
      ordered.flatMap((item) => item.restricted_topics),
    ),
    controls: uniqueControls(
      ordered.flatMap((item) => item.default_controls),
    ),
    safetyLevel: highestRank(
      ordered.map((item) => item.safety_level),
      safetyRank,
    ),
    outputDelivery: highestRank(
      ordered.map((item) => item.output_delivery),
      deliveryRank,
    ),
  };
}

function buildPurpose(templates: GuardrailTemplate[]) {
  const responsibilities = templates
    .map((template) => `${template.name}: ${template.purpose}`)
    .join(" ");
  return `Protect the people and systems using this Guardrail while they perform approved business operations with authorized data. Allow only the documented business domains and expected model actions; prevent sensitive-data disclosure, unsafe or prohibited guidance, instruction attacks, and outcomes outside the reviewed purpose. Apply the selected protections as follows: ${responsibilities} Record enforcement decisions for review and escalate ambiguous or high-risk activity instead of silently allowing it.`;
}

function uniqueText(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.trim().toLocaleLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function uniqueControls(values: GuardrailControl[]) {
  const seen = new Set<string>();
  return values.filter((control) => {
    const policy = control.reasoning_policy;
    const key = JSON.stringify([
      control.risk.toLocaleLowerCase(),
      control.action.toLocaleLowerCase(),
      policy?.policy_id ?? null,
      policy?.policy_version ?? null,
      policy?.confidence_threshold ?? null,
    ]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function highestRank<T extends string>(values: T[], ranks: Record<T, number>) {
  return values.reduce((selected, value) =>
    ranks[value] > ranks[selected] ? value : selected,
  );
}
