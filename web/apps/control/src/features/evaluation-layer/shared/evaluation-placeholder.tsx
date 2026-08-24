import type { LucideIcon } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";

export function EvaluationLayerPlaceholder({
  icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return <EmptyState icon={icon} title={title} description={description} />;
}
