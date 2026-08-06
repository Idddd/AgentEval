export type TerminalSessionEvent =
  | { type: "open" }
  | { data: string; type: "message" }
  | { event: CloseEvent; type: "close"; wasConnected: boolean }
  | { event: Event; type: "error" };

export interface TerminalSession {
  buffer: string[];
  closeFrame: number | null;
  connected: boolean;
  listeners: Set<(event: TerminalSessionEvent) => void>;
  socket: WebSocket;
}

const terminalSessions = new Map<string, TerminalSession>();
const pendingSessions = new Map<string, Promise<TerminalSession>>();

function reviveSession(session: TerminalSession): TerminalSession {
  if (session.closeFrame) {
    window.cancelAnimationFrame(session.closeFrame);
    session.closeFrame = null;
  }
  return session;
}

async function websocketText(data: unknown): Promise<string> {
  if (typeof data === "string") return data;
  if (data instanceof Blob) return data.text();
  if (data instanceof ArrayBuffer)
    return new TextDecoder().decode(new Uint8Array(data));
  return String(data);
}

function createTerminalSession(key: string, url: string): TerminalSession {
  const session: TerminalSession = {
    buffer: [],
    closeFrame: null,
    connected: false,
    listeners: new Set(),
    socket: new WebSocket(url),
  };
  const emit = (event: TerminalSessionEvent) =>
    session.listeners.forEach((listener) => listener(event));

  session.socket.addEventListener("open", () => {
    session.connected = true;
    emit({ type: "open" });
  });
  session.socket.addEventListener("message", (event) => {
    void websocketText(event.data).then((data) => {
      if (session.listeners.size === 0) {
        session.buffer.push(data);
        if (session.buffer.length > 200) session.buffer.shift();
      }
      emit({ data, type: "message" });
    });
  });
  session.socket.addEventListener("close", (event) => {
    const wasConnected = session.connected;
    session.connected = false;
    terminalSessions.delete(key);
    emit({ event, type: "close", wasConnected });
  });
  session.socket.addEventListener("error", (event) =>
    emit({ event, type: "error" }),
  );
  terminalSessions.set(key, session);
  return session;
}

export async function acquireTerminalSession(
  key: string,
  createUrl: () => Promise<string>,
): Promise<TerminalSession> {
  const existing = terminalSessions.get(key);
  if (existing) return reviveSession(existing);

  const pending = pendingSessions.get(key);
  if (pending) return reviveSession(await pending);

  const created = createUrl().then((url) => createTerminalSession(key, url));
  pendingSessions.set(key, created);
  try {
    return reviveSession(await created);
  } finally {
    pendingSessions.delete(key);
  }
}

export function releaseTerminalSession(key: string): void {
  const session = terminalSessions.get(key);
  if (!session || session.closeFrame) return;
  session.closeFrame = window.requestAnimationFrame(() => {
    if (session.socket.readyState === WebSocket.OPEN)
      session.socket.close(1000, "terminal panel detached");
    else if (session.socket.readyState === WebSocket.CONNECTING)
      session.socket.close();
    terminalSessions.delete(key);
  });
}

export function resetTerminalSession(key: string): void {
  const session = terminalSessions.get(key);
  if (!session) return;
  if (session.closeFrame) window.cancelAnimationFrame(session.closeFrame);
  terminalSessions.delete(key);
  if (
    session.socket.readyState === WebSocket.OPEN ||
    session.socket.readyState === WebSocket.CONNECTING
  )
    session.socket.close(4001, "terminal retry requested");
}
