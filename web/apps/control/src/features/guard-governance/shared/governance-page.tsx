import type { ReactNode } from "react";
import { PageHeader } from "@/components/layout/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function GovernancePage({
  actions,
  children,
  description,
  title,
}: {
  actions?: ReactNode;
  children: ReactNode;
  description: ReactNode;
  title: string;
}) {
  return (
    <section className="space-y-6 max-sm:[&_[data-slot=button]]:min-h-11 max-sm:[&_select]:min-h-11">
      <PageHeader title={title} description={description} actions={actions} />
      {children}
    </section>
  );
}

export function GovernanceMetric({
  detail,
  label,
  value,
}: {
  detail?: string;
  label: string;
  value: ReactNode;
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl tabular-nums">{value}</CardTitle>
      </CardHeader>
      {detail ? <CardContent className="text-xs text-muted-foreground">{detail}</CardContent> : null}
    </Card>
  );
}
