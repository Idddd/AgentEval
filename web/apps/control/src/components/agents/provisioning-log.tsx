import { lazy, Suspense } from "react";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

const ansiPattern = /\u001b\[[0-?]*[ -/]*[@-~]/g;
const ReactLogViewer = lazy(() => import("@/components/agents/react-log-viewer"));

export function ProvisioningLog({
  lines,
  state = "live",
}: {
  lines: string[];
  state?: "complete" | "failed" | "live";
}) {
  const sanitizedLines = lines.map((line) => line.replace(ansiPattern, ""));
  const latestLine = sanitizedLines.at(-1);
  const logText = lines.join("\n");

  return (
    <section className="overflow-hidden border bg-zinc-950 text-zinc-300" aria-label="Initialization log">
      <div className="flex min-h-10 items-center justify-between gap-3 border-b border-zinc-800 px-4 text-[11px]">
        <span className="font-medium text-zinc-200">Initialization log</span>
        <span className={cn("inline-flex items-center gap-1.5", state === "failed" ? "text-red-400" : "text-zinc-500")}>
          {state === "live" ? <Spinner className="size-3" /> : null}
          {state === "live" ? "Live" : state === "failed" ? "Stopped" : "Complete"} · {lines.length} events
        </span>
      </div>
      <div className="h-56 sm:h-64 lg:h-72">
        {lines.length ? (
          <Suspense fallback={<div className="flex h-full items-center justify-center gap-2 text-zinc-500"><Spinner className="size-3.5" /> Loading log viewer…</div>}>
            <ReactLogViewer text={logText} live={state === "live"} />
          </Suspense>
        ) : (
          <div className="flex h-full items-center justify-center gap-2 text-zinc-500">
            {state === "live" ? <Spinner className="size-3.5" /> : null}
            Waiting for the first runtime event…
          </div>
        )}
        <p className="sr-only" aria-live="polite">{latestLine}</p>
      </div>
    </section>
  );
}
