import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

import { EntitySheet } from "./components/entity-sheet";
import {
  EmptyState,
  ErrorNotice,
  InfoNotice,
} from "./components/product-shell";
import {
  createTrafficScopeQuery,
  isTrafficScopeValid,
  toTrafficScopeExpression,
  TrafficScopeBuilder,
  type TrafficScopeQuery,
} from "./components/traffic-scope";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./components/ui/select";
import { Skeleton } from "./components/ui/skeleton";
import type {
  Guardrail,
  GuardrailAssignment,
  TrafficScopeExpression,
  TrafficScopeRule,
} from "./lib/contracts";
import { useGuardrailApi } from "./lib/mock-api";
import { queryKeys } from "./lib/query-keys";

export function TrafficScopeBadges({
  assignment,
}: {
  assignment: GuardrailAssignment;
}) {
  const { t } = useTranslation();
  if (!assignment.traffic_scope.rules.length) {
    return (
      <span className="text-xs font-medium text-primary">
        {t("assignments.unmatchedTraffic")}
      </span>
    );
  }
  return <FilterExpressionSummary expression={assignment.traffic_scope} />;
}

function FilterExpressionSummary({
  expression,
}: {
  expression: TrafficScopeExpression;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      {expression.rules.map((item, index) => (
        <div
          key={
            isFilterGroup(item)
              ? `group-${index}`
              : `${item.field}:${item.key ?? ""}:${index}`
          }
          className="contents"
        >
          {index ? (
            <span className="text-[10px] font-semibold text-muted-foreground">
              {expression.combinator.toUpperCase()}
            </span>
          ) : null}
          {isFilterGroup(item) ? (
            <span className="inline-flex max-w-full items-center gap-1 rounded-md border bg-muted/20 p-1">
              <FilterExpressionSummary expression={item} />
            </span>
          ) : (
            <span className="max-w-full rounded-md border bg-muted/40 px-2 py-1 font-mono text-[11px] text-foreground">
              <span className="text-muted-foreground">
                {filterKeyLabel(t, item)} {operatorLabel(t, item.operator)}{" "}
              </span>
              <span className="break-all">{item.value}</span>
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

export function CreateAssignmentSheet({
  open,
  onOpenChange,
  guardrails,
  onCreated,
  initialGuardrailId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  guardrails: Guardrail[];
  onCreated: () => void;
  initialGuardrailId?: string;
}) {
  const { t } = useTranslation();
  const api = useGuardrailApi();
  const fieldQuery = useQuery({
    queryKey: queryKeys.trafficScopeFields,
    queryFn: api.getTrafficScopeFields,
    enabled: open,
  });
  const definitions = useMemo(
    () => fieldQuery.data?.items ?? [],
    [fieldQuery.data?.items],
  );
  const ready = useMemo(
    () =>
      guardrails.filter((item) => item.tested_current && !item.system_managed),
    [guardrails],
  );
  const [name, setName] = useState("");
  const [guardrailId, setGuardrailId] = useState("");
  const [filterQuery, setFilterQuery] = useState<TrafficScopeQuery>({
    combinator: "and",
    rules: [],
  });
  useEffect(() => {
    if (!open) return;
    setName("");
    setGuardrailId(
      ready.some((item) => item.id === initialGuardrailId)
        ? (initialGuardrailId ?? "")
        : (ready[0]?.id ?? ""),
    );
    setFilterQuery(createTrafficScopeQuery(definitions));
  }, [definitions, initialGuardrailId, open, ready]);

  const payloadFilter = toTrafficScopeExpression(filterQuery, definitions);
  const filterValid = isTrafficScopeValid(filterQuery, definitions);
  const selectedGuardrail = ready.find((item) => item.id === guardrailId);
  const mutation = useMutation({
    mutationFn: () =>
      api.createAssignment({
        name,
        guardrail_id: guardrailId,
        traffic_scope: payloadFilter,
        enabled: true,
      }),
    onSuccess: () => {
      toast.success(t("assignments.created"));
      onCreated();
    },
    onError: (error) => notifyError(error, t("assignments.operationFailed")),
  });

  return (
    <EntitySheet
      open={open}
      onOpenChange={onOpenChange}
      eyebrow={t("assignments.sheetEyebrow")}
      title={t("assignments.sheetTitle")}
      description={t("assignments.sheetDescription")}
      width="xl"
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            disabled={
              !name.trim() || !guardrailId || !filterValid || mutation.isPending
            }
            onClick={() => mutation.mutate()}
          >
            <ShieldCheck />
            {t(
              mutation.isPending
                ? "assignments.creating"
                : "assignments.create",
            )}
          </Button>
        </>
      }
    >
      {!ready.length ? (
        <EmptyState
          title={t("assignments.noTestedTitle")}
          description={t("assignments.noTestedDescription")}
        />
      ) : (
        <div className="grid gap-7">
          <FormSection
            number="1"
            title={t("assignments.trafficCharacteristics")}
            description={t("assignments.trafficCharacteristicsDescription")}
          >
            <Field
              label={t("assignments.assignmentName")}
              hint={t("assignments.assignmentNameHint")}
            >
              <Input
                autoFocus
                className="min-h-11 rounded-lg bg-card"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Finance production traffic"
              />
            </Field>
            {fieldQuery.isLoading ? (
              <Skeleton className="h-72 rounded-lg" />
            ) : null}
            {fieldQuery.error ? <ErrorNotice error={fieldQuery.error} /> : null}
            {definitions.length ? (
              <TrafficScopeBuilder
                definitions={definitions}
                query={filterQuery}
                onQueryChange={setFilterQuery}
              />
            ) : null}
            <InfoNotice title={t("assignments.scopeTrustTitle")}>
              {t("assignments.scopeTrustDescription")}
            </InfoNotice>
          </FormSection>

          <FormSection
            number="2"
            title={t("assignments.applyGuardrail")}
            description={t("assignments.applyGuardrailDescription")}
          >
            <Field label={t("assignments.guardrail")}>
              <Select
                disabled={Boolean(initialGuardrailId)}
                value={guardrailId}
                onValueChange={setGuardrailId}
              >
                <SelectTrigger className="min-h-11 rounded-lg bg-card">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-lg">
                  {ready.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            {selectedGuardrail ? (
              <div className="grid gap-3 rounded-lg border bg-muted/25 p-4 sm:grid-cols-3">
                <GuardrailFact
                  label={t("assignments.selectedGuardrail")}
                  value={selectedGuardrail.name}
                />
                <GuardrailFact
                  label={t("guardrails.controls")}
                  value={t("guardrails.controlCount", {
                    count: selectedGuardrail.controls.length,
                  })}
                />
                <GuardrailFact
                  label={t("guardrails.testEvidence")}
                  value={t("guardrails.testCount", {
                    count: selectedGuardrail.test_case_count,
                  })}
                />
              </div>
            ) : null}
          </FormSection>
        </div>
      )}
    </EntitySheet>
  );
}

function FormSection({
  number,
  title,
  description,
  children,
}: {
  number: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="grid gap-4">
      <div className="flex items-start gap-3">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
          {number}
        </span>
        <div>
          <h3 className="text-base font-semibold">{title}</h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {description}
          </p>
        </div>
      </div>
      <div className="grid gap-4 pl-0 sm:pl-10">{children}</div>
    </section>
  );
}

function GuardrailFact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium">{value}</p>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="grid gap-2 text-sm font-medium">
      {label}
      {children}
      {hint ? (
        <span className="text-xs font-normal leading-5 text-muted-foreground">
          {hint}
        </span>
      ) : null}
    </label>
  );
}

function isFilterGroup(
  item: TrafficScopeRule | TrafficScopeExpression,
): item is TrafficScopeExpression {
  return "rules" in item;
}

function filterKeyLabel(
  t: (key: string) => string,
  condition: TrafficScopeRule,
) {
  const translated = t(
    `assignments.trafficScopeFields.${condition.field.replaceAll(".", "_")}`,
  );
  return condition.key ? `${translated}:${condition.key}` : translated;
}

function operatorLabel(
  t: (key: string) => string,
  operator: TrafficScopeRule["operator"],
) {
  return t(`assignments.trafficScopeOperators.${operator}`);
}

function notifyError(error: unknown, fallback: string) {
  toast.error(error instanceof Error ? error.message : fallback);
}
