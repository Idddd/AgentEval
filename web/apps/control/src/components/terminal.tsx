import { useEffect, useRef } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal as Xterm } from "@xterm/xterm";
import { encodeTerminalResize, type AgentPlatformId } from "@tasklattice/contracts";
import "@xterm/xterm/css/xterm.css";
import { api } from "@/lib/api";
import {
  acquireTerminalSession,
  releaseTerminalSession,
  resetTerminalSession,
  type TerminalSession,
  type TerminalSessionEvent,
} from "@/lib/terminal-session";
import { getAgentPlatformPresentation } from "@/lib/agent-platforms";

export type TerminalConnectionState =
  | "connecting"
  | "connected"
  | "closed"
  | "error";

export interface TerminalConnectionSnapshot {
  state: TerminalConnectionState;
  message?: string;
}

export function AgentTerminal({
  agentId,
  agentPlatform,
  reconnectAttempt,
  targetId,
  targetLabel,
  onConnectionChange,
}: {
  agentId: string;
  agentPlatform: AgentPlatformId;
  reconnectAttempt: number;
  targetId: string;
  targetLabel: string;
  onConnectionChange: (snapshot: TerminalConnectionSnapshot) => void;
}) {
  const platform = getAgentPlatformPresentation(agentPlatform);
  const container = useRef<HTMLDivElement>(null);
  const connectionChange = useRef(onConnectionChange);

  useEffect(() => {
    connectionChange.current = onConnectionChange;
  }, [onConnectionChange]);

  useEffect(() => {
    if (!container.current) return;
    const sessionKey = `agent/${agentId}/${targetId}`;
    if (reconnectAttempt > 0) resetTerminalSession(sessionKey);
    connectionChange.current({ state: "connecting" });

    const terminal = new Xterm({
      convertEol: true,
      cursorBlink: true,
      cursorStyle: "block",
      fontSize: 13,
      fontFamily:
        '"SFMono-Regular", "Cascadia Code", "Roboto Mono", "JetBrains Mono", Menlo, Monaco, Consolas, monospace',
      scrollback: 2_000,
      theme: {
        background: "#0b0f0e",
        foreground: "#d8e0db",
        cursor: "#b9f45a",
        selectionBackground: "#36531499",
      },
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(container.current);

    let disposed = false;
    let session: TerminalSession | undefined;
    let sessionListener: ((event: TerminalSessionEvent) => void) | undefined;
    let receivedOutput = false;
    const notify = (snapshot: TerminalConnectionSnapshot) => {
      if (!disposed) connectionChange.current(snapshot);
    };
    const connectionTimer = window.setTimeout(() => {
      if (disposed || receivedOutput) return;
      notify({
        state: "error",
        message: "Terminal connection timed out.",
      });
      if (
        session?.socket.readyState === WebSocket.OPEN ||
        session?.socket.readyState === WebSocket.CONNECTING
      )
        session.socket.close(4000, "terminal connection timed out");
    }, 15_000);
    const sendResize = () => {
      fit.fit();
      if (session?.socket.readyState === WebSocket.OPEN)
        session.socket.send(
          encodeTerminalResize({ cols: terminal.cols, rows: terminal.rows }),
        );
    };
    const resizeObserver = new ResizeObserver(sendResize);
    resizeObserver.observe(container.current);
    requestAnimationFrame(sendResize);

    const inputSubscription = terminal.onData((data) => {
      if (session?.socket.readyState === WebSocket.OPEN)
        session.socket.send(data);
    });
    const focusTerminal = () => terminal.focus();
    container.current.addEventListener("pointerdown", focusTerminal);

    void acquireTerminalSession(sessionKey, async () => {
      const created = await api.createTerminalSession(agentId, targetId);
      const protocol = location.protocol === "https:" ? "wss:" : "ws:";
      return `${protocol}//${location.host}${created.websocketUrl}`;
    })
      .then((acquired) => {
        session = acquired;
        if (disposed) {
          releaseTerminalSession(sessionKey);
          return;
        }
        sessionListener = (event) => {
          if (disposed) return;
          if (event.type === "open") {
            sendResize();
            terminal.focus();
            return;
          }
          if (event.type === "message") {
            if (!receivedOutput) {
              receivedOutput = true;
              window.clearTimeout(connectionTimer);
              notify({ state: "connected" });
            }
            terminal.write(event.data);
            return;
          }
          if (event.type === "close") {
            window.clearTimeout(connectionTimer);
            notify({
              state: "closed",
              ...(event.event.reason ? { message: event.event.reason } : {}),
            });
            return;
          }
          window.clearTimeout(connectionTimer);
          notify({
            state: "error",
            message: "Unable to connect to the Agent terminal.",
          });
        };
        session.listeners.add(sessionListener);
        if (session.buffer.length) {
          receivedOutput = true;
          window.clearTimeout(connectionTimer);
          notify({ state: "connected" });
          terminal.write(session.buffer.join(""));
          session.buffer.length = 0;
        }
        if (session.connected) {
          sendResize();
          terminal.focus();
        }
      })
      .catch((reason: unknown) => {
        window.clearTimeout(connectionTimer);
        notify({
          state: "error",
          message:
            reason instanceof Error ? reason.message : "Terminal unavailable.",
        });
      });

    return () => {
      disposed = true;
      window.clearTimeout(connectionTimer);
      resizeObserver.disconnect();
      container.current?.removeEventListener("pointerdown", focusTerminal);
      if (session && sessionListener) session.listeners.delete(sessionListener);
      releaseTerminalSession(sessionKey);
      inputSubscription.dispose();
      terminal.dispose();
    };
  }, [agentId, reconnectAttempt, targetId]);

  return (
    <div
      ref={container}
      aria-label={`Interactive ${platform.name} terminal for ${targetLabel}`}
      className="min-h-0 flex-1 cursor-text overflow-hidden bg-[#0b0f0e] p-3"
    />
  );
}
