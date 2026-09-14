import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

// Production-server smoke test against an isolated OpenAPI-shaped fixture.
// No external backend, persisted user records or real credentials are involved.
const received = [];
const fixture = createServer(async (req, res) => {
  let body = "";
  for await (const chunk of req) body += chunk;
  received.push({
    url: req.url,
    method: req.method,
    authorization: req.headers.authorization,
    body,
  });
  res.setHeader("Content-Type", "application/json");
  if (req.headers.authorization !== "Bearer smoke-token") {
    res.writeHead(401);
    res.end(
      JSON.stringify({
        error: { code: "unauthorized", message: "Unauthorized" },
      }),
    );
    return;
  }
  if (req.method === "GET" && req.url === "/api/v1/policies") {
    res.end(JSON.stringify({ items: [], count: 0 }));
    return;
  }
  if (req.method === "POST" && req.url === "/api/v1/guardrails") {
    res.writeHead(201);
    res.end(JSON.stringify({ id: "smoke-guard", ...JSON.parse(body) }));
    return;
  }
  res.writeHead(404);
  res.end(
    JSON.stringify({ error: { code: "not_found", message: "Not found" } }),
  );
});
fixture.listen(0, "127.0.0.1");
await once(fixture, "listening");
const upstreamPort = fixture.address().port;
async function freePort() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}
try {
  for (const mode of ["mock", "live", "auto"]) {
    const port = await freePort();
    const child = spawn(
      process.execPath,
      [fileURLToPath(new URL("../.output/server/index.mjs", import.meta.url))],
      {
        env: {
          ...process.env,
          PORT: String(port),
          HOST: "127.0.0.1",
          MARKETPLACE_DATA_MODE: mode,
          GUARD_API_URL: `http://127.0.0.1:${upstreamPort}/api/v1`,
          GUARD_POLICY_AUTHORING_URL: "",
        },
        stdio: "ignore",
        windowsHide: true,
      },
    );
    try {
      const base = `http://127.0.0.1:${port}`;
      let config;
      for (let i = 0; i < 100; i++) {
        try {
          config = await (await fetch(`${base}/api/marketplace-config`)).json();
          break;
        } catch {
          await delay(100);
        }
      }
      assert.equal(
        config?.mode,
        mode,
        "runtime mode must not be baked into the image",
      );
      const before = received.length;
      const unauthorized = await fetch(`${base}/api/guard/policies`);
      assert.equal(unauthorized.status, mode === "mock" ? 409 : 401);
      assert.equal(
        received.length,
        before,
        "unauthorized/mock requests must not reach Guard",
      );
      if (mode !== "mock") {
        const headers = {
          Authorization: "Bearer smoke-token",
          "Content-Type": "application/json",
        };
        const response = await fetch(`${base}/api/guard/policies`, { headers });
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), { items: [], count: 0 });
        const body = {
          name: "Smoke",
          draftConfig: {
            policyBindings: [{ policyId: "policy", policyVersion: "1" }],
          },
        };
        const created = await fetch(`${base}/api/guard/guardrails`, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        });
        assert.equal(created.status, 201);
        assert.equal((await created.json()).id, "smoke-guard");
        assert.deepEqual(JSON.parse(received.at(-1).body), body);
      }
      console.log(`${mode}: production configuration and proxy passed`);
    } finally {
      const stopped = once(child, "exit");
      child.kill();
      await stopped;
    }
  }
} finally {
  await new Promise((resolve) => fixture.close(resolve));
}
