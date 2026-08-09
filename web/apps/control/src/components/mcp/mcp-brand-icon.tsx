import {
  siAtlassian,
  siCloudflare,
  siGithub,
  siMysql,
  siPostgresql,
  siRedis,
  siUpstash,
  type SimpleIcon,
} from "simple-icons";
import type { McpServerDefinition, McpServerTemplate } from "@tasklattice/contracts";
import { useState } from "react";
import { BookOpenText, ServerCog } from "lucide-react";
import { BrandMark } from "@/components/brand/brand-logo";
import { cn } from "@/lib/utils";

const icons: Record<string, SimpleIcon> = {
  atlassian: siAtlassian,
  cloudflare: siCloudflare,
  "cloudflare-docs": siCloudflare,
  context7: siUpstash,
  "context7-docs": siUpstash,
  github: siGithub,
  mysql: siMysql,
  postgresql: siPostgresql,
  redis: siRedis,
};

export function McpBrandIcon({
  brand,
  className,
  logoUrl,
}: {
  brand: string;
  className?: string;
  logoUrl?: string | undefined;
}) {
  const [failedLogoUrl, setFailedLogoUrl] = useState<string | null>(null);
  if (logoUrl && failedLogoUrl !== logoUrl) {
    return (
      <img
        alt=""
        aria-hidden="true"
        className={cn("size-7 object-contain", className)}
        onError={() => setFailedLogoUrl(logoUrl)}
        src={logoUrl}
      />
    );
  }
  if (brand === "tasklattice") return <BrandMark className={cn("size-7", className)} />;
  if (brand === "slack") return <SlackMark className={className} />;
  if (brand === "deepwiki") return <BookOpenText aria-hidden="true" className={cn("size-7 text-foreground", className)} />;
  const icon = icons[brand];
  if (!icon) return <ServerCog aria-hidden="true" className={cn("size-6", className)} />;
  return (
    <svg
      aria-hidden="true"
      className={cn(
        "size-7",
        brand === "github" && "text-[#181717] dark:text-white",
        className,
      )}
      role="img"
      style={brand === "github" ? undefined : { color: `#${icon.hex}` }}
      viewBox="0 0 24 24"
    >
      <path d={icon.path} fill="currentColor" />
    </svg>
  );
}

type BrandableServer = Pick<McpServerDefinition, "endpoint" | "name" | "templateId">;

function normalizedEndpoint(endpoint: string | undefined): string {
  return endpoint?.trim().replace(/\/+$/, "").toLowerCase() ?? "";
}

/**
 * Resolve the durable brand of a registered server. Endpoint matching keeps
 * instances created before a catalog template was introduced visually linked
 * to that template without rewriting their Project-owned configuration.
 */
export function resolveMcpServerBrand(
  server: BrandableServer,
  templates: readonly McpServerTemplate[],
): string {
  const matchingTemplate = templates.find((template) => template.id === server.templateId)
    ?? templates.find((template) =>
      Boolean(template.endpointPlaceholder)
      && normalizedEndpoint(template.endpointPlaceholder) === normalizedEndpoint(server.endpoint));

  if (matchingTemplate) return matchingTemplate.logo;

  const identity = `${server.name} ${server.endpoint ?? ""}`.toLowerCase();
  if (identity.includes("tasklattice") || identity.includes("tasklattice-example-mcp")) {
    return "tasklattice";
  }

  return "";
}

function SlackMark({ className }: { className?: string | undefined }) {
  return (
    <svg aria-hidden="true" className={cn("size-7", className)} role="img" viewBox="0 0 24 24">
      <path fill="#E01E5A" d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313z" />
      <path fill="#36C5F0" d="M8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312z" />
      <path fill="#2EB67D" d="M18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312z" />
      <path fill="#ECB22E" d="M15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z" />
    </svg>
  );
}
