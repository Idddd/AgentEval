import { cn } from "@/lib/utils";

export function ChartLoadingState({
  className,
}: {
  className?: string;
}) {
  return (
    <div
      aria-label="Loading chart"
      role="status"
      className="overflow-x-auto overscroll-x-contain"
    >
      <div className={cn("relative h-[260px] min-w-[680px] overflow-hidden", className)}>
        <div className="absolute inset-x-16 bottom-10 top-5 grid grid-rows-4">
          {Array.from({ length: 5 }, (_, index) => (
            <span key={index} className="border-b" />
          ))}
        </div>
        <div className="absolute bottom-10 left-16 right-5 h-1/3 animate-pulse rounded-sm bg-muted/70" />
        <span className="sr-only">Loading chart</span>
      </div>
    </div>
  );
}
