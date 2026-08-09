import { afterEach, describe, expect, it, vi } from "vitest";
import {
  acquireTerminalSession,
  releaseTerminalSession,
} from "./terminal-session";

describe("terminal session lifecycle", () => {
  const originalWebSocket = globalThis.WebSocket;
  const originalWindow = globalThis.window;

  afterEach(() => {
    Object.defineProperty(globalThis, "WebSocket", {
      configurable: true,
      value: originalWebSocket,
    });
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow,
    });
  });

  it("closes the WebSocket on the next frame when the Terminal unmounts", async () => {
    let releaseFrame: FrameRequestCallback | undefined;
    const close = vi.fn();
    class FakeWebSocket {
      static CONNECTING = 0;
      static OPEN = 1;
      readyState = FakeWebSocket.OPEN;
      addEventListener = vi.fn();
      close = close;
    }
    Object.defineProperty(globalThis, "WebSocket", {
      configurable: true,
      value: FakeWebSocket,
    });
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        cancelAnimationFrame: vi.fn(),
        requestAnimationFrame: (callback: FrameRequestCallback) => {
          releaseFrame = callback;
          return 1;
        },
      },
    });

    await acquireTerminalSession("agent/test/agent", async () => "ws://terminal");
    releaseTerminalSession("agent/test/agent");
    expect(close).not.toHaveBeenCalled();
    releaseFrame?.(0);
    expect(close).toHaveBeenCalledWith(1000, "terminal panel detached");
  });
});
