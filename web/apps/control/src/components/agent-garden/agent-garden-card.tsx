import type {
  AgentGardenEntry,
} from "@tasklattice/contracts";
import {
  ArrowRight,
  ExternalLink,
  Link2,
  Play,
} from "lucide-react";
import { AgentGardenIcon } from "./agent-garden-icon";
import {
  agentStatusLabel,
  isPreviewAgent,
  previewAgentLabel,
  usageModeLabel,
} from "./agent-garden-presentation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function AgentGardenCard({
  agent,
  canManage,
  connectionCount,
  onConnect,
  onCreateInstance,
  onDetails,
  onTry,
}: {
  agent: AgentGardenEntry;
  canManage: boolean;
  connectionCount: number;
  onConnect: () => void;
  onCreateInstance: () => void;
  onDetails: () => void;
  onTry: () => void;
}) {
  const ready = agent.status === "READY";
  const interactiveAction =
    agent.usageCapabilities.interactive && ready;
  const connectAction =
    agent.usageCapabilities.acceptsDelegation && ready;
  const preview = isPreviewAgent(agent);
  const language = agent.configuration.language;
  const cardTags = agent.tags
    .filter((tag) => tag !== language && tag !== "Demo")
    .slice(0, language ? 1 : 2);

  return (
    <article
      className={cn(
        "group flex min-h-52 flex-col rounded-lg border bg-card p-4 shadow-xs transition-[border-color,background-color,box-shadow,transform] duration-200",
        "hover:-translate-y-0.5 hover:border-primary/25 hover:bg-accent/15 hover:shadow-sm",
        agent.status === "COMING_SOON" && "bg-muted/25",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <AgentGardenIcon
          type={agent.integrationType}
          catalogIcon={agent.configuration.icon}
        />
        <div className="text-right">
          <span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {agent.source === "BUILT_IN"
              ? "Built-in"
              : "Project"}
          </span>
          {preview ? (
            <span className="mt-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-primary">
              {previewAgentLabel(agent)}
            </span>
          ) : null}
          {connectionCount ? (
            <span className="mt-1 block text-[10px] text-primary">
              {connectionCount} connected
            </span>
          ) : null}
        </div>
      </div>

      <button
        type="button"
        onClick={onDetails}
        className="mt-4 min-h-11 text-left focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <strong className="block text-sm leading-6 group-hover:text-primary">
          {agent.name}
        </strong>
        <span className="mt-1 line-clamp-2 block text-xs leading-5 text-muted-foreground">
          {agent.description}
        </span>
      </button>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <Badge
          variant="secondary"
          className="bg-primary/8 text-primary"
        >
          {agent.platformLabel}
        </Badge>
        {language ? (
          <Badge variant="secondary" className="font-normal">
            {language}
          </Badge>
        ) : null}
        <Badge variant="outline">
          {usageModeLabel(agent.usageMode)}
        </Badge>
        {cardTags.map((tag) => (
          <Badge
            key={tag}
            variant="secondary"
            className="font-normal text-muted-foreground"
          >
            {tag}
          </Badge>
        ))}
        {agent.status !== "READY" ? (
          <Badge
            variant={
              agent.status === "UNAVAILABLE"
                ? "destructive"
                : "outline"
            }
          >
            {agentStatusLabel(agent.status)}
          </Badge>
        ) : null}
      </div>

      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-4">
        <Button
          type="button"
          variant="ghost"
          className="h-11 px-2"
          onClick={onDetails}
        >
          Details
        </Button>
        <div className="ml-auto flex flex-wrap justify-end gap-2">
          {preview ? (
            <Button
              type="button"
              variant="outline"
              className="h-11"
              onClick={onTry}
            >
              <Play /> Try demo
            </Button>
          ) : null}
          {interactiveAction &&
          agent.source === "PROJECT_REGISTERED" &&
          agent.endpoint ? (
            <Button
              asChild
              variant="outline"
              className="h-11"
            >
              <a
                href={agent.endpoint}
                target="_blank"
                rel="noreferrer"
              >
                Open Agent <ExternalLink />
              </a>
            </Button>
          ) : null}
          {interactiveAction && agent.source === "BUILT_IN" ? (
            <Button
              type="button"
              className="h-11"
              onClick={onCreateInstance}
            >
              Create Instance <ArrowRight />
            </Button>
          ) : null}
          {connectAction ? (
            <Button
              type="button"
              className="h-11"
              disabled={!canManage}
              onClick={onConnect}
            >
              <Link2 /> Connect to…
            </Button>
          ) : null}
          {!ready && agent.status === "COMING_SOON" ? (
            <Button
              type="button"
              variant="outline"
              className="h-11"
              disabled
            >
              Coming soon
            </Button>
          ) : null}
          {!ready && agent.status !== "COMING_SOON" ? (
            <Button
              type="button"
              variant="outline"
              className="h-11"
              onClick={onDetails}
            >
              Review status
            </Button>
          ) : null}
        </div>
      </div>
    </article>
  );
}
