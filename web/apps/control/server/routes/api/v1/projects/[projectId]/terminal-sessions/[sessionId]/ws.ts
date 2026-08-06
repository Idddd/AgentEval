import { WebSocket } from "ws";
import { defineWebSocketHandler } from "nitro";
import type { AgentService } from "../../../../../../../agents/agent-service";
import { getAgentServiceForProject } from "../../../../../../../services";
import {
  consumeTerminalSession,
  type TerminalSessionRecord,
} from "../../../../../../../terminal/terminal-sessions";

interface TerminalPeerContext {
  service: AgentService;
  session: TerminalSessionRecord;
}

interface TerminalConnection {
  pending: string[];
  upstream: WebSocket;
  timeout: ReturnType<typeof setTimeout>;
}

const connections = new Map<string, TerminalConnection>();
const connectTimeoutMs = 15_000;

export default defineWebSocketHandler({
  async upgrade(request) {
    const url = new URL(request.url);
    const segments = url.pathname.split("/");
    const sessionId = segments.at(-2) ?? "";
    const token = url.searchParams.get("token") ?? "";
    const session = consumeTerminalSession(sessionId, token);
    if (!session) throw new Response("Invalid terminal session.", { status: 401 });
    const projectId = decodeURIComponent(url.pathname.split("/")[4] ?? "");
    if (projectId !== session.projectId)
      throw new Response("Invalid project context.", { status: 401 });
    // Browser WebSocket clients cannot attach the Bearer header used by the
    // JSON API. The short-lived, single-use terminal token was issued only
    // after the caller passed Project authorization, so it is the capability
    // for this upgrade. Scope the service exclusively from that token rather
    // than trying to authenticate the WebSocket as a second HTTP request.
    const service = getAgentServiceForProject(session.projectId);
    const agent = await service.get(session.agentId);
    if (!agent || agent.status !== "READY")
      throw new Response(
        "Terminal is available only when the Agent is healthy and running.",
        { status: 409 },
      );
    return { context: { service, session } };
  },
  async open(peer) {
    const { service, session } = peer.context as unknown as TerminalPeerContext;
    const connectionId = peer.id.slice(0, 8);
    console.info(
      `[terminal ${connectionId}] browser connected; opening runner terminal for ${session.sandboxName}`,
    );
    const upstream = new WebSocket(
      service.runner.terminalWebSocketUrl(
        session.sandboxName,
        session.agentPlatform,
      ),
      { headers: service.runner.authorizationHeaders() },
    );
    const timeout = setTimeout(() => {
      peer.send(
        "\r\nUnable to open the runtime terminal before the connection timeout.\r\n",
      );
      peer.close(1011, "Runtime terminal connection timed out");
      upstream.terminate();
    }, connectTimeoutMs);
    const connection: TerminalConnection = { pending: [], upstream, timeout };
    connections.set(peer.id, connection);
    upstream.on("open", () => {
      for (const input of connection.pending.splice(0)) upstream.send(input);
    });
    upstream.once("message", () => clearTimeout(timeout));
    upstream.on("message", (data) => peer.send(data));
    upstream.on("close", (code, reason) => {
      clearTimeout(timeout);
      peer.close(
        code === 1005 || code === 1006 ? 1011 : code,
        reason.toString(),
      );
    });
    upstream.on("error", (error) => {
      clearTimeout(timeout);
      console.error(`[terminal ${connectionId}] ${error.message}`);
      peer.close(1011, "Runtime terminal unavailable");
    });
  },
  message(peer, message) {
    const connection = connections.get(peer.id);
    if (!connection) return;
    const input = message.text();
    if (connection.upstream.readyState === WebSocket.OPEN)
      connection.upstream.send(input);
    else connection.pending.push(input);
  },
  close(peer) {
    const connection = connections.get(peer.id);
    if (!connection) return;
    clearTimeout(connection.timeout);
    connections.delete(peer.id);
    if (connection.upstream.readyState === WebSocket.CONNECTING)
      connection.upstream.terminate();
    else if (connection.upstream.readyState === WebSocket.OPEN)
      connection.upstream.close();
  },
});
