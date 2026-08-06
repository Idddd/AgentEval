import type { AgentGardenIntegrationType } from "@tasklattice/contracts";
import {
  siLangflow,
  siPydantic,
  type SimpleIcon,
} from "simple-icons";
import {
  Blocks,
  Bot,
  Braces,
  Briefcase,
  Bug,
  ChartNoAxesCombined,
  ClipboardPlus,
  HandCoins,
  Headphones,
  Landmark,
  LibraryBig,
  Orbit,
  Plane,
  ScanSearch,
  ShieldCheck,
  ShoppingBasket,
  Waypoints,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

const icons: Partial<Record<AgentGardenIntegrationType, LucideIcon>> = {
  a2a: Waypoints,
  "watsonx-orchestrate": Orbit,
  custom: Blocks,
};

const catalogIcons: Record<string, LucideIcon> = {
  briefcase: Briefcase,
  bug: Bug,
  chart: ChartNoAxesCombined,
  "clipboard-plus": ClipboardPlus,
  "hand-coins": HandCoins,
  headphones: Headphones,
  landmark: Landmark,
  "library-big": LibraryBig,
  plane: Plane,
  "scan-search": ScanSearch,
  "shield-check": ShieldCheck,
  "shopping-basket": ShoppingBasket,
};

const brandAssets: Partial<Record<AgentGardenIntegrationType, string>> = {
  openclaw: "/assets/brands/openclaw-lobehub.webp",
  hermes: "/assets/brands/hermesagent-lobehub.webp",
  "claude-code": "/assets/providers/anthropic.webp",
  a2a: "/assets/agent-providers/a2a-agent.png",
  langgraph: "/assets/agent-providers/langgraph.png",
  "bedrock-agentcore": "/assets/providers/aws.webp",
  "azure-ai-foundry": "/assets/providers/azure.webp",
  "vertex-ai-agent-engine": "/assets/agent-providers/google.svg",
};

const simpleIcons: Partial<
  Record<AgentGardenIntegrationType, SimpleIcon>
> = {
  langflow: siLangflow,
  "pydantic-ai": siPydantic,
};

export function AgentGardenIcon({
  className,
  catalogIcon,
  iconClassName,
  type,
}: {
  className?: string;
  catalogIcon?: string | undefined;
  iconClassName?: string;
  type: AgentGardenIntegrationType;
}) {
  const Icon = catalogIcons[catalogIcon ?? ""] ?? icons[type] ?? Bot;
  const asset = brandAssets[type];
  const simpleIcon = simpleIcons[type];
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid size-11 shrink-0 place-items-center rounded-md border bg-background shadow-xs",
        className,
      )}
    >
      {asset && !catalogIcon ? (
        <img
          src={asset}
          alt=""
          className={cn("size-8 object-contain", iconClassName)}
        />
      ) : simpleIcon ? (
        <svg
          viewBox="0 0 24 24"
          className={cn("size-5 fill-current text-primary", iconClassName)}
        >
          <path d={simpleIcon.path} />
        </svg>
      ) : (
        <Icon className={cn("size-5 text-primary", iconClassName)} />
      )}
    </span>
  );
}

export function AgentCapabilityIcon({
  capability,
}: {
  capability: "interactive" | "delegate" | "callable";
}) {
  const Icon =
    capability === "interactive"
      ? Braces
      : capability === "delegate"
        ? Workflow
        : Waypoints;
  return <Icon aria-hidden="true" className="size-3" />;
}
