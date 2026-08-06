import type { Request, Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { requireBasicAuthentication } from "./basic-auth.js";

const host = process.env.HOST?.trim() || "0.0.0.0";
const port = parsePort(process.env.PORT);
const allowedHosts = (process.env.ALLOWED_HOSTS ?? "localhost,127.0.0.1")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

function createExampleServer(): McpServer {
  const server = new McpServer({
    name: "tasklattice-example-mcp",
    version: "0.1.0",
  });

  server.registerTool(
    "echo_message",
    {
      title: "Echo Message",
      description: "Return the supplied message unchanged for MCP connectivity testing.",
      inputSchema: {
        message: z.string().min(1).max(2_000).describe("Message to echo back."),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ message }) => ({
      content: [{ type: "text", text: message }],
    }),
  );

  server.registerTool(
    "calculate_sum",
    {
      title: "Calculate Sum",
      description: "Add two numbers and return the deterministic result.",
      inputSchema: {
        left: z.number().finite().describe("Left operand."),
        right: z.number().finite().describe("Right operand."),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ left, right }) => ({
      content: [{ type: "text", text: JSON.stringify({ result: left + right }) }],
    }),
  );

  server.registerTool(
    "get_platform_status",
    {
      title: "Get Platform Status",
      description: "Return static example service health and deployment metadata.",
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => ({
      content: [{
        type: "text",
        text: JSON.stringify({
          service: "tasklattice-example-mcp",
          status: "healthy",
          transport: "streamable-http",
        }),
      }],
    }),
  );

  return server;
}

const app = createMcpExpressApp({ host, allowedHosts });

app.get("/healthz", (_request, response) => {
  response.status(200).json({
    service: "tasklattice-example-mcp",
    status: "ok",
  });
});

app.use("/mcp", requireBasicAuthentication);

app.post("/mcp", async (request: Request, response: Response) => {
  const server = createExampleServer();
  const transport = new StreamableHTTPServerTransport();

  try {
    await server.connect(transport);
    await transport.handleRequest(request, response, request.body);
  } catch (error) {
    console.error("Failed to handle MCP request.", error);
    if (!response.headersSent) {
      response.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  } finally {
    await transport.close();
    await server.close();
  }
});

app.get("/mcp", (_request, response) => {
  response.status(405).json({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Method not allowed for stateless transport." },
    id: null,
  });
});

app.delete("/mcp", (_request, response) => {
  response.status(405).json({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Method not allowed for stateless transport." },
    id: null,
  });
});

const httpServer = app.listen(port, host, () => {
  console.log(`TaskLattice example MCP Server listening on http://${host}:${port}/mcp`);
});

function shutdown(signal: string): void {
  console.log(`Received ${signal}; shutting down.`);
  httpServer.close((error) => {
    if (error) {
      console.error("Failed to stop HTTP server cleanly.", error);
      process.exitCode = 1;
    }
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

function parsePort(value: string | undefined): number {
  const parsed = Number(value ?? "3000");
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) {
    throw new Error(`PORT must be an integer between 1 and 65535; received ${value ?? ""}.`);
  }
  return parsed;
}
