import { useEffect, useMemo, useRef, useState } from "react";
import type { AgentPlatformId, TerminalTarget } from "@tasklattice/contracts";
import { Maximize2, Minimize2, RefreshCw } from "lucide-react";
import {
  AgentTerminal,
  type TerminalConnectionSnapshot,
} from "@/components/terminal";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getAgentPlatformPresentation } from "@/lib/agent-platforms";
import { cn } from "@/lib/utils";

const statusLabels: Record<TerminalConnectionSnapshot["state"], string> = {
  connecting: "Connecting…",
  connected: "Connected",
  closed: "Connection closed",
  error: "Connection failed",
};

function targetLabel(target: TerminalTarget): string {
  return target.displayName ?? target.containerName;
}

export function AgentTerminalPanel({
  agentId,
  agentPlatform,
  targets,
}: {
  agentId: string;
  agentPlatform: AgentPlatformId;
  targets: TerminalTarget[];
}) {
  const primaryTarget = useMemo(
    () => targets.find((target) => target.primary && target.available) ?? targets.find((target) => target.available),
    [targets],
  );
  const [selectedTargetId, setSelectedTargetId] = useState(
    primaryTarget?.id ?? "",
  );
  const [fullScreen, setFullScreen] = useState(false);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [connection, setConnection] = useState<TerminalConnectionSnapshot>({
    state: "connecting",
  });
  const expandButton = useRef<HTMLButtonElement>(null);
  const platform = getAgentPlatformPresentation(agentPlatform);
  const selectedTarget =
    targets.find(
      (target) => target.id === selectedTargetId && target.available,
    ) ?? primaryTarget;

  useEffect(() => {
    if (primaryTarget && !targets.some((target) => target.id === selectedTargetId && target.available))
      setSelectedTargetId(primaryTarget.id);
  }, [primaryTarget, selectedTargetId, targets]);

  useEffect(() => {
    if (!fullScreen) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFullScreen(false);
    };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
      window.requestAnimationFrame(() => expandButton.current?.focus());
    };
  }, [fullScreen]);

  if (!selectedTarget) return null;

  const reconnect = () => {
    setConnection({ state: "connecting" });
    setReconnectAttempt((attempt) => attempt + 1);
  };

  return (
    <section
      id="terminal"
      aria-label={`${platform.name} terminal`}
      className={cn(
        "flex scroll-mt-24 flex-col overflow-hidden border bg-[#0b0f0e]",
        fullScreen
          ? "fixed inset-0 z-[90] h-dvh w-screen"
          : "h-[calc(100dvh-18rem)] min-h-[520px] max-h-[760px]",
      )}
    >
      <div
        role="toolbar"
        aria-label="Terminal controls"
        className="flex min-h-14 shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b bg-background px-3 py-2 text-foreground"
      >
        <div className="flex min-w-0 items-center gap-2 text-xs">
          <span className="text-muted-foreground">Container</span>
          {targets.length > 1 ? (
            <Select
              value={selectedTarget.id}
              onValueChange={(targetId) => {
                const nextTarget = targets.find(
                  (target) => target.id === targetId && target.available,
                );
                if (!nextTarget) return;
                setConnection({ state: "connecting" });
                setReconnectAttempt(0);
                setSelectedTargetId(nextTarget.id);
              }}
            >
              <SelectTrigger aria-label="Select terminal container" className="h-9 min-w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {targets.map((target) => (
                  <SelectItem key={target.id} value={target.id} disabled={!target.available}>
                    {targetLabel(target)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <strong className="truncate font-medium text-foreground">
              {targetLabel(selectedTarget)}
            </strong>
          )}
        </div>

        <div
          role="status"
          title={connection.message}
          className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground"
        >
          <span
            className={cn(
              "size-1.5 shrink-0 rounded-full",
              connection.state === "connected" && "bg-emerald-500",
              connection.state === "connecting" && "animate-pulse bg-amber-500",
              (connection.state === "closed" || connection.state === "error") && "bg-red-500",
            )}
          />
          <span className="truncate">
            {connection.message ?? statusLabels[connection.state]}
          </span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {connection.state === "closed" || connection.state === "error" ? (
            <Button type="button" variant="outline" size="sm" onClick={reconnect}>
              <RefreshCw /> Reconnect
            </Button>
          ) : null}
          {fullScreen ? (
            <span className="hidden text-[11px] text-muted-foreground sm:inline">
              Esc to exit
            </span>
          ) : null}
          <Button
            ref={expandButton}
            type="button"
            variant="outline"
            size="sm"
            className="min-w-11"
            aria-label={fullScreen ? "Exit full-screen terminal" : "Open full-screen terminal"}
            onClick={() => setFullScreen((current) => !current)}
          >
            {fullScreen ? <Minimize2 /> : <Maximize2 />}
            <span className="hidden sm:inline">
              {fullScreen ? "Exit full screen" : "Full screen"}
            </span>
          </Button>
        </div>
      </div>

      <AgentTerminal
        agentId={agentId}
        agentPlatform={agentPlatform}
        reconnectAttempt={reconnectAttempt}
        targetId={selectedTarget.id}
        targetLabel={targetLabel(selectedTarget)}
        onConnectionChange={setConnection}
      />
    </section>
  );
}
