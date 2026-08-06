import { isIP } from "node:net";
import { z } from "zod";
import type {
  AgentGardenEntry,
  AgentGardenSkill,
} from "@tasklattice/contracts";

const agentCardSkillSchema = z.object({
  id: z.string().trim().min(1).max(200),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2_000).optional(),
  tags: z.array(z.string().trim().min(1).max(80)).max(32).optional(),
}).passthrough();

const agentCardSchema = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2_000).optional(),
  url: z.string().trim().url().optional(),
  supportedInterfaces: z.array(z.object({
    url: z.string().trim().url(),
    protocolBinding: z.string().trim().optional(),
    protocolVersion: z.string().trim().optional(),
  }).passthrough()).max(32).optional(),
  skills: z.array(agentCardSkillSchema).max(1_000).optional(),
}).passthrough();

export interface AgentDiscoveryResult {
  endpoint: string;
  agentCardUrl: string | null;
  skills: AgentGardenSkill[];
}

export interface AgentDiscoveryClient {
  discover(
    agent: AgentGardenEntry,
    credential?: string,
  ): Promise<AgentDiscoveryResult>;
}

function isObviouslyPrivateHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    normalized === "localhost"
    || normalized.endsWith(".localhost")
    || normalized.endsWith(".local")
    || normalized === "::1"
  ) return true;
  if (isIP(normalized) === 4) {
    const [first = 0, second = 0] = normalized.split(".").map(Number);
    return first === 10
      || first === 127
      || (first === 169 && second === 254)
      || (first === 172 && second >= 16 && second <= 31)
      || (first === 192 && second === 168);
  }
  return isIP(normalized) === 6
    && (
      normalized.startsWith("fc")
      || normalized.startsWith("fd")
      || normalized.startsWith("fe80:")
    );
}

function assertEndpointPolicy(value: string, internalNetworkOnly: boolean): URL {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Agent endpoints must use HTTP or HTTPS.");
  }
  if (url.username || url.password) {
    throw new Error("Agent endpoint credentials must use a Secret reference.");
  }
  if (!internalNetworkOnly && isObviouslyPrivateHost(url.hostname)) {
    throw new Error(
      "Private Agent endpoints must be marked as internal network only.",
    );
  }
  if (
    process.env.NODE_ENV === "production"
    && !internalNetworkOnly
    && url.protocol !== "https:"
  ) {
    throw new Error("Public Agent endpoints must use HTTPS in production.");
  }
  return url;
}

function requestHeaders(
  agent: AgentGardenEntry,
  credential?: string,
): Headers {
  const headers = new Headers({
    accept: "application/a2a+json, application/json",
  });
  if (!credential) return headers;
  if (agent.authType === "bearer_token") {
    headers.set("authorization", `Bearer ${credential}`);
  } else if (agent.authType === "api_key") {
    headers.set("x-api-key", credential);
  }
  return headers;
}

function defaultAgentCardUrl(agent: AgentGardenEntry): string | null {
  if (agent.agentCardUrl) return agent.agentCardUrl;
  if (!agent.endpoint) return null;
  if (
    agent.integrationType !== "a2a"
    && agent.integrationType !== "pydantic-ai"
    && agent.integrationType !== "langgraph"
  ) return null;
  if (agent.integrationType === "langgraph") {
    const assistantId = agent.configuration.assistantId;
    if (!assistantId) return null;
    const base = new URL(agent.endpoint);
    base.pathname = `${base.pathname.replace(/\/$/, "")}/.well-known/agent-card.json`;
    base.searchParams.set("assistant_id", assistantId);
    return base.toString();
  }
  return new URL("/.well-known/agent-card.json", agent.endpoint).toString();
}

async function responseText(
  response: Response,
  limit = 1_000_000,
): Promise<string> {
  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (declaredLength > limit) {
    throw new Error("Agent Card exceeds the one megabyte discovery limit.");
  }
  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > limit) {
    throw new Error("Agent Card exceeds the one megabyte discovery limit.");
  }
  return text;
}

export class HttpAgentDiscoveryClient implements AgentDiscoveryClient {
  async discover(
    agent: AgentGardenEntry,
    credential?: string,
  ): Promise<AgentDiscoveryResult> {
    if (!agent.endpoint) throw new Error("Agent endpoint is required.");
    assertEndpointPolicy(agent.endpoint, agent.internalNetworkOnly);
    const agentCardUrl = defaultAgentCardUrl(agent);
    if (agentCardUrl) {
      assertEndpointPolicy(agentCardUrl, agent.internalNetworkOnly);
      const response = await fetch(agentCardUrl, {
        headers: requestHeaders(agent, credential),
        redirect: "manual",
        signal: AbortSignal.timeout(7_000),
      });
      if (response.status >= 300 && response.status < 400) {
        throw new Error("Agent Card redirects are not followed during discovery.");
      }
      if (!response.ok) {
        throw new Error(`Agent Card discovery failed with HTTP ${response.status}.`);
      }
      const card = agentCardSchema.parse(JSON.parse(await responseText(response)));
      const endpoint =
        card.supportedInterfaces?.[0]?.url
        ?? card.url
        ?? agent.endpoint;
      assertEndpointPolicy(endpoint, agent.internalNetworkOnly);
      return {
        endpoint,
        agentCardUrl,
        skills: (card.skills ?? []).map((skill) => ({
          id: skill.id,
          name: skill.name,
          description: skill.description ?? "",
          tags: skill.tags ?? [],
        })),
      };
    }

    const response = await fetch(agent.endpoint, {
      method: "HEAD",
      headers: requestHeaders(agent, credential),
      redirect: "manual",
      signal: AbortSignal.timeout(7_000),
    });
    await response.body?.cancel();
    if (response.status >= 300 && response.status < 400) {
      throw new Error("Agent endpoint redirects are not followed during discovery.");
    }
    if (response.status === 401 || response.status === 403) {
      throw new Error("Agent endpoint rejected the configured authentication.");
    }
    if (!response.ok && response.status !== 405) {
      throw new Error(`Agent endpoint health check failed with HTTP ${response.status}.`);
    }
    return {
      endpoint: agent.endpoint,
      agentCardUrl: null,
      skills: [],
    };
  }
}
