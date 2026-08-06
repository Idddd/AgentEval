import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Check, Clock3, History, ListChecks } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { PreviewBadge } from "@/components/shared/preview-badge";
import { StatusDot } from "@/components/shared/status-dot";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  historyTicketPreviews,
  pendingTicketPreviews,
  type TicketPreview,
} from "@/lib/preview-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/$projectId/requests/")({ component: Tickets });

function ticketTone(status: TicketPreview["status"]) {
  if (status === "APPROVED") return "success" as const;
  if (status === "REJECTED") return "danger" as const;
  return "warning" as const;
}

function ticketLabel(status: TicketPreview["status"]) {
  if (status === "APPROVED") return "Approved";
  if (status === "REJECTED") return "Rejected";
  return "Pending review";
}

function Tickets() {
  const [tab, setTab] = useState<"pending" | "history">("pending");
  const tickets = tab === "pending" ? pendingTicketPreviews : historyTicketPreviews;
  const [selectedByTab, setSelectedByTab] = useState({
    history: historyTicketPreviews[0]!.id,
    pending: pendingTicketPreviews[0]!.id,
  });
  const selected =
    tickets.find((ticket) => ticket.id === selectedByTab[tab]) ?? tickets[0]!;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ticket List"
        badge={<PreviewBadge />}
        description="Follow requests you submitted, who needs to act, and whether an approved change was applied."
      />
      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as "pending" | "history")}
        className="gap-6"
      >
        <TabsList variant="line" aria-label="Ticket status">
          <TabsTrigger value="pending">
            <Clock3 /> Pending
          </TabsTrigger>
          <TabsTrigger value="history">
            <History /> History
          </TabsTrigger>
        </TabsList>
        <TabsContent
          value={tab}
          className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]"
        >
        <Card>
          <CardHeader className="border-b">
            <CardTitle>{tab === "pending" ? "Requests awaiting a decision" : "Decision history"}</CardTitle>
            <CardDescription>
              {tab === "pending"
                ? "Pending means a decision is still required; no requested change has been applied."
                : "Final decisions and, for approved requests, whether the change was applied."}
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            <div className="hidden grid-cols-[minmax(0,1.2fr)_1fr_0.8fr_auto] gap-3 border-b px-4 py-2 text-xs text-muted-foreground sm:grid">
              <span>Request</span>
              <span>Target</span>
              <span>{tab === "pending" ? "Current step" : "Closed"}</span>
              <span>Status</span>
            </div>
            {tickets.map((ticket) => (
              <button
                key={ticket.id}
                type="button"
                aria-pressed={selected.id === ticket.id}
                onClick={() =>
                  setSelectedByTab((current) => ({ ...current, [tab]: ticket.id }))
                }
                className={cn(
                  "grid min-h-16 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b px-4 py-3 text-left text-sm transition-colors last:border-b-0 hover:bg-muted/45 focus-visible:outline-2 focus-visible:outline-offset-[-2px] sm:grid-cols-[minmax(0,1.2fr)_1fr_0.8fr_auto]",
                  selected.id === ticket.id &&
                    "bg-muted/70 shadow-[inset_3px_0_0_var(--foreground)]",
                )}
              >
                <span>
                  <strong className="block font-mono text-xs">{ticket.id}</strong>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {ticket.kind}
                    <span className="sm:hidden"> · {ticket.target}</span>
                  </span>
                  <span className="mt-1 block text-[11px] text-muted-foreground sm:hidden">
                    {tab === "pending"
                      ? `Current step: ${ticket.currentStep}`
                      : `Closed: ${ticket.completedAt}`}
                  </span>
                </span>
                <span className="hidden truncate sm:block">{ticket.target}</span>
                <span className="hidden text-xs text-muted-foreground sm:block">
                  {tab === "pending" ? ticket.currentStep : ticket.completedAt}
                </span>
                <StatusDot label={ticketLabel(ticket.status)} tone={ticketTone(ticket.status)} />
              </button>
            ))}
          </CardContent>
        </Card>

        <Card className="xl:sticky xl:top-24">
          <CardHeader className="border-b">
            <div className="flex items-center justify-between gap-3">
              <StatusDot label={ticketLabel(selected.status)} tone={ticketTone(selected.status)} />
              <span className="text-xs text-muted-foreground">
                {tab === "pending" ? "Open request" : "Closed request"}
              </span>
            </div>
            <CardTitle className="mt-3 font-mono text-sm">{selected.id}</CardTitle>
            <CardDescription>
              {selected.kind} · {selected.target}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ol className="relative ml-2 border-l text-xs">
              {(tab === "pending"
                ? ["Submitted", selected.currentStep, "Decision", "Change applied", "Completed"]
                : selected.status === "APPROVED"
                  ? ["Submitted", "Approved", "Change applied", "Completed"]
                  : ["Submitted", "Rejected", "Closed"]
              ).map((node, index, nodes) => {
                const current = tab === "pending" ? index === 1 : index === nodes.length - 1;
                return (
                  <li key={`${index}-${node}`} className="relative min-h-11 pl-6">
                    <span
                      className={cn(
                        "absolute -left-2 top-0 grid size-4 place-items-center rounded-full border bg-background",
                        current && "border-foreground bg-foreground text-background",
                      )}
                    >
                      {index < (tab === "pending" ? 1 : nodes.length - 1) ? (
                        <Check className="size-3" />
                      ) : null}
                    </span>
                    <strong className={current ? "font-medium" : "font-normal text-muted-foreground"}>
                      {node}
                    </strong>
                    {current ? (
                      <span className="mt-1 block text-muted-foreground">
                        {tab === "pending" ? "Current step" : "Final step"}
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ol>
            <dl className="border-t pt-2 text-xs">
              <div className="flex min-h-10 items-center justify-between gap-3 border-b">
                <dt className="text-muted-foreground">Submitted by</dt>
                <dd className="font-medium">You</dd>
              </div>
              <div className="flex min-h-10 items-center justify-between gap-3">
                <dt className="text-muted-foreground">
                  {tab === "pending" ? "Waiting on" : "Closed"}
                </dt>
                <dd className="font-medium">
                  {tab === "pending" ? selected.actionOwner : selected.completedAt}
                </dd>
              </div>
            </dl>
            <p className="text-xs leading-5 text-muted-foreground">
              Approval decisions and resource application are tracked as
              separate steps. Request detail APIs are not connected in this UI preview.
            </p>
            <Button className="h-11 w-full" disabled>
              <ListChecks /> View Request
            </Button>
          </CardContent>
        </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
