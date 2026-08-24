import { cn } from "@/lib/utils";

export function StatusDot({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: "danger" | "neutral" | "success" | "warning";
}) {
  return (
    <span className="inline-flex items-center gap-2 text-xs font-medium">
      <span
        className={cn(
          "size-2 rounded-full",
          tone === "success" && "bg-emerald-500",
          tone === "warning" && "bg-amber-500",
          tone === "danger" && "bg-destructive",
          tone === "neutral" && "bg-muted-foreground/50",
        )}
      />
      {label}
    </span>
  );
}
