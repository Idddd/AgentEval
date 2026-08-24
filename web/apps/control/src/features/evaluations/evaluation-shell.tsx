import type { ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { PageHeader } from "@/components/layout/page-header";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCurrentProjectId } from "@/hooks/use-project";
import { EvaluationErrorBoundary } from "./evaluation-error-boundary";

export type EvaluationView =
  | "targets"
  | "datasets"
  | "evaluations"
  | "reports";

const evaluationSections: Array<{
  label: string;
  value: EvaluationView;
}> = [
  { label: "Targets", value: "targets" },
  { label: "Datasets", value: "datasets" },
  { label: "Evaluations", value: "evaluations" },
  { label: "Reports", value: "reports" },
];

export function EvaluationPageFrame({
  action,
  children,
  description,
  title,
}: {
  action?: ReactNode;
  children: ReactNode;
  description: ReactNode;
  title: string;
}) {
  const projectId = useCurrentProjectId();
  const search = useRouterState({
    select: (state) => new URLSearchParams(state.location.searchStr),
  });
  const active = (search.get("view") ?? "targets") as EvaluationView;

  return (
    <section className="space-y-6 max-sm:[&_[data-slot=button]]:min-h-11 max-sm:[&_select]:min-h-11">
      <PageHeader title={title} description={description} actions={action} />
      <Tabs value={active}>
        <TabsList variant="line" aria-label="Evaluation sections">
          {evaluationSections.map((section) => (
            <TabsTrigger key={section.value} value={section.value} asChild>
              <Link
                to="/$projectId/evaluations"
                params={{ projectId }}
                search={
                  section.value === "targets"
                    ? {}
                    : { view: section.value }
                }
              >
                {section.label}
              </Link>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <EvaluationErrorBoundary>{children}</EvaluationErrorBoundary>
    </section>
  );
}
