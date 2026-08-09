import { afterEach, describe, expect, it } from "vitest";
import { readdirSync } from "node:fs";
import { relative } from "node:path";
import { fileURLToPath } from "node:url";
import type { PrismaClient } from "../generated/prisma/client";
import { createTestPrisma } from "../test/prisma";
import {
  captureAuditRequest,
  writeAuditResponse,
} from "./audit-request";

let database: PrismaClient | undefined;

afterEach(async () => {
  await database?.$disconnect();
  database = undefined;
});

describe("platform audit request capture", () => {
  it("classifies side-effect routes and redacts credentials recursively", async () => {
    database = createTestPrisma();
    const captured = await captureAuditRequest(new Request(
      "http://tasklattice.local/api/v1/projects/individual/providers",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "user-agent": "vitest",
          "x-request-id": "request-provider-create",
        },
        body: JSON.stringify({
          name: "DeepSeek",
          credential: {
            apiKey: "sk-never-store",
            token: "also-never-store",
          },
          config: { endpoint: "https://api.example.test" },
        }),
      },
    ));
    expect(captured).toMatchObject({
      descriptor: {
        action: "provider.create",
        objectType: "Provider",
        projectId: "individual",
      },
      body: {
        credential: "[REDACTED]",
      },
    });

    await writeAuditResponse(
      captured!,
      new Response(JSON.stringify({
        account: { id: "provider-deepseek", name: "DeepSeek" },
      }), {
        status: 201,
        headers: { "content-type": "application/json" },
      }),
      database,
    );

    const row = await database.auditLogRecord.findFirstOrThrow({
      where: { requestId: "request-provider-create" },
    });
    expect(row).toMatchObject({
      action: "provider.create",
      objectId: "provider-deepseek",
      objectName: "DeepSeek",
      outcome: "success",
      projectId: "individual",
    });
    expect(JSON.stringify(row.requestBody)).not.toContain("sk-never-store");
    expect(JSON.stringify(row.requestBody)).not.toContain("also-never-store");
  });

  it("explicitly excludes read-only vector search POST requests", async () => {
    expect(await captureAuditRequest(new Request(
      "http://tasklattice.local/api/internal/vector-stores/individual/v1/vector_stores/kb/search",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: "audit" }),
      },
    ))).toBeUndefined();
  });

  it("excludes read-only cost analytics requests", async () => {
    expect(await captureAuditRequest(new Request(
      "http://tasklattice.local/api/v1/projects/individual/costs/breakdown",
    ))).toBeUndefined();
  });

  it("classifies every side-effect API route", async () => {
    const routeRoot = fileURLToPath(new URL("../routes/api/v1", import.meta.url));
    const routeFiles = readdirSync(routeRoot, {
      recursive: true,
      withFileTypes: true,
    })
      .filter((entry) => entry.isFile())
      .map((entry) =>
        relative(routeRoot, `${entry.parentPath}/${entry.name}`).replaceAll("\\", "/"),
      )
      .filter((path) => /\.(?:post|put|patch|delete)\.ts$/.test(path));

    const uncovered: string[] = [];
    for (const file of routeFiles) {
      const method = file.match(/\.([^.]+)\.ts$/)![1]!.toUpperCase();
      const route = file
        .replace(/\.(?:post|put|patch|delete)\.ts$/, "")
        .replace(/\/index$/, "")
        .replace(/\[projectId\]/g, "individual")
        .replace(/\[[^\]]+\]/g, "test-object");
      const request = new Request(`http://tasklattice.local/api/v1/${route}`, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!await captureAuditRequest(request)) uncovered.push(file);
    }

    expect(uncovered).toEqual([]);
    expect(routeFiles).toHaveLength(42);
  });
});
