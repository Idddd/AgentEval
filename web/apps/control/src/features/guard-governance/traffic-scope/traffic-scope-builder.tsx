import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type {
  TrafficScopeExpression,
  TrafficScopeField,
  TrafficScopeOperator,
} from "../model";

const fields: Array<{ value: TrafficScopeField; label: string }> = [
  { value: "environment", label: "Environment" },
  { value: "model", label: "Model" },
  { value: "provider", label: "Provider" },
  { value: "route", label: "Route" },
  { value: "tag", label: "Tag" },
];

const operators: Array<{ value: TrafficScopeOperator; label: string }> = [
  { value: "equals", label: "Equals" },
  { value: "not_equals", label: "Does not equal" },
  { value: "contains", label: "Contains" },
  { value: "starts_with", label: "Starts with" },
];

export function TrafficScopeBuilder({
  onChange,
  value,
}: {
  onChange: (value: TrafficScopeExpression) => void;
  value: TrafficScopeExpression;
}) {
  const updateRule = (
    index: number,
    patch: Partial<TrafficScopeExpression["rules"][number]>,
  ) => {
    onChange({
      ...value,
      rules: value.rules.map((rule, ruleIndex) =>
        ruleIndex === index ? { ...rule, ...patch } : rule,
      ),
    });
  };

  return (
    <div className="space-y-3 rounded-lg border bg-muted/15 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded-md border bg-background p-1">
          <Button
            aria-pressed={value.combinator === "and"}
            size="sm"
            type="button"
            variant={value.combinator === "and" ? "secondary" : "ghost"}
            onClick={() => onChange({ ...value, combinator: "and" })}
          >
            Match all rules
          </Button>
          <Button
            aria-pressed={value.combinator === "or"}
            size="sm"
            type="button"
            variant={value.combinator === "or" ? "secondary" : "ghost"}
            onClick={() => onChange({ ...value, combinator: "or" })}
          >
            Match any rule
          </Button>
        </div>
        <Button
          size="sm"
          type="button"
          variant="outline"
          onClick={() =>
            onChange({
              ...value,
              rules: [
                ...value.rules,
                { field: "environment", operator: "equals", value: "" },
              ],
            })
          }
        >
          <Plus />
          Add rule
        </Button>
      </div>

      <div className="space-y-2">
        {value.rules.map((rule, index) => (
          <div
            className="grid gap-2 rounded-md border bg-background p-3 md:grid-cols-[minmax(9rem,0.8fr)_minmax(10rem,0.9fr)_minmax(12rem,1.5fr)_2.75rem]"
            key={`${index}-${rule.field}-${rule.operator}`}
          >
            <label className="grid gap-1 text-xs text-muted-foreground">
              Field
              <select
                aria-label={`Rule ${index + 1} field`}
                className="h-11 rounded-md border bg-background px-3 text-sm text-foreground"
                value={rule.field}
                onChange={(event) =>
                  updateRule(index, {
                    field: event.target.value as TrafficScopeField,
                  })
                }
              >
                {fields.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-xs text-muted-foreground">
              Operator
              <select
                aria-label={`Rule ${index + 1} operator`}
                className="h-11 rounded-md border bg-background px-3 text-sm text-foreground"
                value={rule.operator}
                onChange={(event) =>
                  updateRule(index, {
                    operator: event.target.value as TrafficScopeOperator,
                  })
                }
              >
                {operators.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-xs text-muted-foreground">
              Value
              <Input
                aria-label={`Rule ${index + 1} value`}
                className="h-11"
                value={rule.value}
                onChange={(event) =>
                  updateRule(index, { value: event.target.value })
                }
              />
            </label>
            <Button
              aria-label={`Remove rule ${index + 1}`}
              className="mt-5 size-11"
              disabled={value.rules.length === 1}
              size="icon"
              type="button"
              variant="ghost"
              onClick={() =>
                onChange({
                  ...value,
                  rules: value.rules.filter((_, ruleIndex) => ruleIndex !== index),
                })
              }
            >
              <Trash2 />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
