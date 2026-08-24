import { randomUUID } from "node:crypto";
import type {
  AgentPlatformId,
  TerminalSessionResponse,
} from "@tasklattice/contracts";

export interface TerminalSessionRecord {
  projectId: string;
  agentId: string;
  agentPlatform: AgentPlatformId;
  sandboxName: string;
  targetId: string;
  expiresAt: number;
}

const sessions = new Map<string, TerminalSessionRecord>();

export function createTerminalSession(
  projectId: string,
  agentId: string,
  sandboxName: string,
  agentPlatform: AgentPlatformId,
  targetId: string,
): TerminalSessionResponse {
  const id = randomUUID();
  const token = randomUUID();
  const expiresAt = Date.now() + 5 * 60_000;
  sessions.set(`${id}:${token}`, {
    projectId,
    agentId,
    agentPlatform,
    sandboxName,
    targetId,
    expiresAt,
  });
  return {
    id,
    expiresAt: new Date(expiresAt).toISOString(),
    websocketUrl: `/api/v1/projects/${encodeURIComponent(projectId)}/terminal-sessions/${id}/ws?token=${token}`,
  };
}

export function consumeTerminalSession(
  id: string,
  token: string,
): TerminalSessionRecord | undefined {
  const key = `${id}:${token}`;
  const session = sessions.get(key);
  sessions.delete(key);
  return session && session.expiresAt >= Date.now() ? session : undefined;
}
