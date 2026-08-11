import { Braces, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type {
  TrafficScopeExpression,
  TrafficScopeFieldDefinition,
  TrafficScopeRule,
} from "../model";

const operatorLabels: Record<string, string> = {
  equals: "Equals",
  not_equals: "Does not equal",
  contains: "Contains",
  starts_with: "Starts with",
  glob: "Matches glob",
};

const fieldLabels: Record<string, string> = {
  environment: "Environment",
  protocol: "Protocol",
  auth_principal: "Authenticated principal",
  auth_jwt_claim: "Verified JWT claim",
  http_method: "HTTP method",
  http_host: "HTTP host",
  http_path: "HTTP path",
  http_header: "HTTP header",
  model: "Model",
  litellm_team_id: "LiteLLM team ID",
  litellm_user_id: "LiteLLM user ID",
  a2a_operation: "A2A operation",
  a2a_context_id: "A2A context ID",
};

function isGroup(item: TrafficScopeRule | TrafficScopeExpression): item is TrafficScopeExpression {
  return "rules" in item;
}

function firstRule(definitions: TrafficScopeFieldDefinition[]): TrafficScopeRule {
  const definition = definitions[0];
  return {
    field: definition?.id ?? "environment",
    operator: definition?.operators[0] ?? "equals",
    value: "",
  };
}

export function TrafficScopeBuilder({
  definitions,
  onChange,
  value,
}: {
  definitions: TrafficScopeFieldDefinition[];
  onChange: (value: TrafficScopeExpression) => void;
  value: TrafficScopeExpression;
}) {
  return (
    <ScopeGroup
      definitions={definitions}
      expression={value}
      labelPrefix=""
      onChange={onChange}
      root
    />
  );
}

function ScopeGroup({
  definitions,
  expression,
  labelPrefix,
  onChange,
  root = false,
}: {
  definitions: TrafficScopeFieldDefinition[];
  expression: TrafficScopeExpression;
  labelPrefix: string;
  onChange: (value: TrafficScopeExpression) => void;
  root?: boolean;
}) {
  const updateItem = (index: number, item: TrafficScopeRule | TrafficScopeExpression) => {
    onChange({
      ...expression,
      rules: expression.rules.map((current, currentIndex) =>
        currentIndex === index ? item : current,
      ),
    });
  };
  const groupLabel = labelPrefix.trim();
  const matchAll = groupLabel ? `${groupLabel} match all rules` : "Match all rules";
  const matchAny = groupLabel ? `${groupLabel} match any rule` : "Match any rule";

  return (
    <div className={root ? "space-y-3 rounded-lg border bg-muted/15 p-4" : "space-y-3 rounded-md border border-primary/20 bg-primary/[0.03] p-3"}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded-md border bg-background p-1">
          <Button aria-label={matchAll} aria-pressed={expression.combinator === "and"} size="sm" type="button" variant={expression.combinator === "and" ? "secondary" : "ghost"} onClick={() => onChange({ ...expression, combinator: "and" })}>
            Match all rules
          </Button>
          <Button aria-label={matchAny} aria-pressed={expression.combinator === "or"} size="sm" type="button" variant={expression.combinator === "or" ? "secondary" : "ghost"} onClick={() => onChange({ ...expression, combinator: "or" })}>
            Match any rule
          </Button>
        </div>
        <div className="flex gap-2">
          <Button size="sm" type="button" variant="outline" onClick={() => onChange({ ...expression, rules: [...expression.rules, firstRule(definitions)] })}>
            <Plus />Add rule
          </Button>
          <Button aria-label={root ? "Add group" : `${groupLabel} add group`} size="sm" type="button" variant="outline" onClick={() => onChange({ ...expression, rules: [...expression.rules, { combinator: "and", rules: [firstRule(definitions)] }] })}>
            <Braces />Add group
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        {expression.rules.map((item, index) => {
          const itemPrefix = labelPrefix
            ? `${labelPrefix}group ${index + 1} `
            : `Group ${index + 1} `;
          if (isGroup(item)) {
            return (
              <div className="relative" key={`group-${index}`}>
                <ScopeGroup definitions={definitions} expression={item} labelPrefix={itemPrefix} onChange={(next) => updateItem(index, next)} />
                <Button aria-label={`Remove group ${index + 1}`} className="absolute right-3 top-3 size-8" size="icon" type="button" variant="ghost" onClick={() => onChange({ ...expression, rules: expression.rules.filter((_, currentIndex) => currentIndex !== index) })}>
                  <Trash2 />
                </Button>
              </div>
            );
          }
          const definition = definitions.find((candidate) => candidate.id === item.field) ?? definitions[0];
          const ruleLabel = labelPrefix ? `${labelPrefix}rule ${index + 1}` : `Rule ${index + 1}`;
          return (
            <div className="grid gap-2 rounded-md border bg-background p-3 md:grid-cols-[minmax(9rem,1fr)_minmax(9rem,1fr)_minmax(10rem,1fr)_minmax(12rem,1.4fr)_2.75rem]" key={`rule-${index}-${item.field}`}>
              <label className="grid gap-1 text-xs text-muted-foreground">
                Field
                <select aria-label={`${ruleLabel} field`} className="h-11 rounded-md border bg-background px-3 text-sm text-foreground" value={item.field} onChange={(event) => {
                  const nextDefinition = definitions.find((candidate) => candidate.id === event.target.value) ?? definitions[0];
                  if (!nextDefinition) return;
                  updateItem(index, { field: nextDefinition.id, operator: nextDefinition.operators[0] ?? "equals", value: "" });
                }}>
                  {definitions.map((candidate) => <option key={candidate.id} value={candidate.id}>{fieldLabels[candidate.id] ?? candidate.id.replaceAll("_", " ")}</option>)}
                </select>
              </label>
              {definition?.customKey ? (
                <label className="grid gap-1 text-xs text-muted-foreground">
                  Key
                  <Input aria-label={`${ruleLabel} key`} className="h-11" placeholder={definition.source === "header" ? "x-tenant-id" : "department"} value={item.key ?? ""} onChange={(event) => updateItem(index, { ...item, key: event.target.value })} />
                </label>
              ) : <div className="hidden md:block" />}
              <label className="grid gap-1 text-xs text-muted-foreground">
                Operator
                <select aria-label={`${ruleLabel} operator`} className="h-11 rounded-md border bg-background px-3 text-sm text-foreground" value={item.operator} onChange={(event) => updateItem(index, { ...item, operator: event.target.value as TrafficScopeRule["operator"] })}>
                  {(definition?.operators ?? ["equals"]).map((operator) => <option key={operator} value={operator}>{operatorLabels[operator] ?? operator}</option>)}
                </select>
              </label>
              <label className="grid gap-1 text-xs text-muted-foreground">
                Value
                <Input aria-label={`${ruleLabel} value`} className="h-11" list={definition?.values.length ? `${ruleLabel.replaceAll(" ", "-")}-values` : undefined} value={item.value} onChange={(event) => updateItem(index, { ...item, value: event.target.value })} />
                {definition?.values.length ? <datalist id={`${ruleLabel.replaceAll(" ", "-")}-values`}>{definition.values.map((value) => <option key={value} value={value} />)}</datalist> : null}
              </label>
              <Button aria-label={`Remove ${ruleLabel.toLowerCase()}`} className="mt-5 size-11" disabled={expression.rules.length === 1} size="icon" type="button" variant="ghost" onClick={() => onChange({ ...expression, rules: expression.rules.filter((_, currentIndex) => currentIndex !== index) })}>
                <Trash2 />
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function TrafficScopeSummary({ expression }: { expression: TrafficScopeExpression }) {
  if (!expression.rules.length) return <span className="text-xs font-medium text-primary">Unmatched traffic</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {expression.rules.map((item, index) => (
        <span className="contents" key={isGroup(item) ? `group-${index}` : `${item.field}-${item.key ?? ""}-${index}`}>
          {index ? <strong className="text-[10px] text-muted-foreground">{expression.combinator.toUpperCase()}</strong> : null}
          {isGroup(item) ? (
            <span className="inline-flex items-center rounded-md border bg-muted/20 p-1"><TrafficScopeSummary expression={item} /></span>
          ) : (
            <code className="max-w-full rounded-md border bg-muted/40 px-2 py-1 text-[11px]">
              {fieldLabels[item.field] ?? item.field.replaceAll("_", " ")}{item.key ? `:${item.key}` : ""} {operatorLabels[item.operator]?.toLowerCase() ?? item.operator} <strong>{item.value}</strong>
            </code>
          )}
        </span>
      ))}
    </span>
  );
}
