import { AlertTriangle, Banknote, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export function CostEmptyState({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? "py-6 text-center" : "grid min-h-40 place-items-center text-center"}>
      <div>
        <Banknote className="mx-auto size-4 text-muted-foreground" />
        <p className="mt-2 text-sm font-medium">No spend in this period</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Usage appears after an Instance calls a model through its LiteLLM key.
        </p>
      </div>
    </div>
  );
}

export function CostErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col gap-4 border-l-2 border-destructive bg-destructive/5 p-4 sm:flex-row sm:items-center"
    >
      <AlertTriangle className="size-4 shrink-0 text-destructive" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-destructive">Cost data unavailable</p>
        <p className="mt-1 text-xs text-muted-foreground">{message}</p>
      </div>
      <Button variant="outline" size="sm" onClick={onRetry}>
        <RefreshCw />
        Retry
      </Button>
    </div>
  );
}

export function CostSkeleton() {
  return (
    <div aria-label="Loading model cost data" className="space-y-5">
      <div className="overflow-hidden rounded-lg border">
        <div className="flex min-w-[820px] divide-x">
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index} className="min-w-40 flex-1 p-4">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="mt-3 h-6 w-28" />
              <Skeleton className="mt-2 h-3 w-32" />
            </div>
          ))}
        </div>
      </div>
      <Skeleton className="h-10 w-[32rem] max-w-full" />
      <div className="rounded-lg border p-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-8 w-52" />
        </div>
        <div className="mt-7 grid grid-cols-[auto_1fr] gap-3">
          <div className="space-y-3">
            {Array.from({ length: 7 }, (_, index) => <Skeleton key={index} className="h-3 w-7" />)}
          </div>
          <div className="grid grid-cols-12 gap-1.5">
            {Array.from({ length: 84 }, (_, index) => <Skeleton key={index} className="aspect-square" />)}
          </div>
        </div>
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <Skeleton className="h-72" />
        <Skeleton className="h-72" />
      </div>
      <Skeleton className="h-80" />
      <Skeleton className="h-96" />
    </div>
  );
}
