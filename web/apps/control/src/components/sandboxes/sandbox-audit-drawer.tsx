import { useState, type ReactElement } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Agent, SandboxAuditEvent } from "@tasklattice/contracts";
import {
  Download,
  RefreshCw,
  ScrollText,
  ShieldCheck,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { api } from "@/lib/api";
import {
  createCsv,
  createDownloadFilename,
  downloadCsv,
  type CsvColumn,
} from "@/lib/csv";
import { cn } from "@/lib/utils";
import { formatPlatformDateTime } from "@/lib/platform-preferences";
import { useProjectQueryScope } from "@/hooks/use-project-query-scope";

const auditColumns = [
  { header: "Event ID", value: (event) => event.id },
  { header: "Timestamp", value: (event) => event.timestamp },
  { header: "Source", value: (event) => event.source },
  { header: "Category", value: (event) => event.category },
  { header: "Severity", value: (event) => event.severity },
  { header: "Decision", value: (event) => event.decision },
  { header: "Policy", value: (event) => event.policy },
  { header: "Summary", value: (event) => event.summary },
  { header: "Raw", value: (event) => event.raw },
] as const satisfies readonly CsvColumn<SandboxAuditEvent>[];

const blockedDecisions = new Set<SandboxAuditEvent["decision"]>([
  "BLOCKED",
  "DENIED",
  "REJECTED",
]);
function formatEventTime(timestamp: string): string {
  return formatPlatformDateTime(timestamp, { timeStyle: "medium" });
}

function AuditEvent({ event }: { event: SandboxAuditEvent }) {
  const blocked = blockedDecisions.has(event.decision);

  return (
    <article className="grid grid-cols-[auto_minmax(0,1fr)] gap-4 border-b px-6 py-5 last:border-b-0">
      <span
        className={cn(
          "mt-0.5 grid size-9 place-items-center rounded-md border bg-muted/35",
          blocked && "border-destructive/35 bg-destructive/5 text-destructive",
        )}
      >
        <ShieldCheck className="size-4" />
      </span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <strong className="text-sm font-medium">{event.category}</strong>
            <span
              className={cn(
                "rounded-sm border px-1.5 py-0.5 text-[10px] font-semibold tracking-wide",
                blocked
                  ? "border-destructive/35 bg-destructive/5 text-destructive"
                  : "bg-muted/50 text-muted-foreground",
              )}
            >
              {event.decision}
            </span>
            <span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              {event.severity}
            </span>
          </div>
          <time
            dateTime={event.timestamp}
            className="text-[11px] tabular-nums text-muted-foreground"
          >
            {formatEventTime(event.timestamp)}
          </time>
        </div>
        <p className="mt-3 break-words font-mono text-[11px] leading-5 text-muted-foreground">
          {event.summary}
        </p>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-muted-foreground">
          <span>Source: {event.source}</span>
          {event.policy ? <span>Policy: {event.policy}</span> : null}
        </div>
      </div>
    </article>
  );
}

function AuditEventsState({
  error,
  events,
  pending,
}: {
  error: Error | null;
  events: SandboxAuditEvent[] | undefined;
  pending: boolean;
}) {
  if (pending) {
    return (
      <div className="grid min-h-52 place-items-center px-6 text-center">
        <div>
          <RefreshCw className="mx-auto size-5 animate-spin text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">
            Reading OpenShell audit events…
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div role="alert" className="m-6 border-l-2 border-destructive bg-destructive/5 px-4 py-4 text-sm text-destructive">
        {error.message}
      </div>
    );
  }

  if (!events?.length) {
    return (
      <div className="grid min-h-52 place-items-center px-8 text-center">
        <div>
          <ScrollText className="mx-auto size-6 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium">No audit events yet</p>
          <p className="mt-1 max-w-sm text-xs leading-5 text-muted-foreground">
            OpenShell has not recorded an OCSF policy decision for this Sandbox
            in the last 24 hours.
          </p>
        </div>
      </div>
    );
  }

  return events.map((event) => <AuditEvent key={event.id} event={event} />);
}

export function SandboxAuditDrawer({
  sandbox,
  trigger,
}: {
  sandbox: Agent;
  trigger: ReactElement;
}) {
  const [open, setOpen] = useState(false);
  const scope = useProjectQueryScope();
  const ready = sandbox.status === "READY";
  const audit = useQuery({
    queryKey: scope.key("sandbox-audit", sandbox.id),
    queryFn: () => api.getAgentAudit(sandbox.id),
    enabled: open && ready,
    retry: 1,
    refetchInterval: open ? 5_000 : false,
  });
  const eventCount = audit.data?.length ?? 0;

  const exportAudit = () => {
    if (!audit.data?.length) return;
    const date = new Date().toISOString().slice(0, 10);
    const filename = createDownloadFilename(
      ["openshell-audit", sandbox.sandboxName, date],
      "csv",
    );
    downloadCsv(filename, createCsv(audit.data, auditColumns));
  };

  return (
    <Drawer open={open} onOpenChange={setOpen} direction="right" autoFocus>
      <DrawerTrigger asChild>{trigger}</DrawerTrigger>
      <DrawerContent
        aria-label={`Audit log for ${sandbox.sandboxName}`}
        className="w-[min(92vw,44rem)]"
      >
        <DrawerHeader className="relative border-b pr-16">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            <ScrollText className="size-3.5" />
            OpenShell · OCSF · Last 24 hours
          </div>
          <DrawerTitle className="mt-2 text-xl">Sandbox audit log</DrawerTitle>
          <DrawerDescription className="break-all">
            {sandbox.sandboxName} · Agent: {sandbox.name}
          </DrawerDescription>
          <DrawerClose asChild>
            <button
              type="button"
              className="absolute right-3 top-3 grid size-11 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2"
              aria-label="Close Sandbox audit log"
            >
              <X className="size-5" />
            </button>
          </DrawerClose>
        </DrawerHeader>

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex min-h-16 items-center justify-between gap-4 border-b px-6 py-2">
            <p className="text-xs text-muted-foreground" aria-live="polite">
              {audit.isPending && ready
                ? "Loading events…"
                : `${eventCount} ${eventCount === 1 ? "event" : "events"}`}
            </p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!ready || audit.isFetching}
                onClick={() => void audit.refetch()}
              >
                <RefreshCw className={cn(audit.isFetching && "animate-spin")} />
                Refresh
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={!audit.data?.length}
                onClick={exportAudit}
              >
                <Download />
                Export CSV
              </Button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {ready ? (
              <AuditEventsState
                error={audit.error}
                events={audit.data}
                pending={audit.isPending}
              />
            ) : (
              <div className="grid min-h-52 place-items-center px-8 text-center">
                <p className="max-w-sm text-sm leading-6 text-muted-foreground">
                  Audit events become available when this Sandbox reaches Ready.
                </p>
              </div>
            )}
          </div>
        </div>

        <DrawerFooter>
          <p className="text-xs leading-5 text-muted-foreground">
            OpenShell records network, process, filesystem, and configuration
            decisions. Terminal keystrokes, prompts, and file contents are not
            captured.
          </p>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
