// Local UAT only: forward the independent backend's scan to one real NeMo endpoint.
// The existing independent service has a deployment-wide credential shared by its mock
// and real targets. Exchange it here for the scoped, locally issued NeMo endpoint key.
import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";

const { endpointId, credential } = JSON.parse(readFileSync("/run/uat/nemo-endpoint.json", "utf8"));
const expected = Buffer.from("Bearer " + readFileSync("/run/uat/eval-token", "utf8").trim());
if (!/^[a-f0-9-]{36}$/i.test(endpointId) || typeof credential !== "string" || !credential || expected.length <= 7) throw new Error("Invalid local credentials.");
const destination = `http://runner:8091/runtime/v1/endpoints/${endpointId}/backend/v1/scans`;
const server = createServer(async (request, response) => {
  const finish = (status, body) => {
    response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    response.end(JSON.stringify(body));
  };
  if (request.url !== "/scan" || request.method !== "POST") return finish(404, { error: "Not found" });
  const auth = Buffer.from(request.headers.authorization ?? "");
  if (auth.length !== expected.length || !timingSafeEqual(auth, expected)) return finish(401, { error: "Unauthorized" });
  let size = 0;
  const chunks = [];
  try {
    for await (const chunk of request) {
      size += chunk.length;
      if (size > 400_000) return finish(413, { error: "Scan input too large" });
      chunks.push(chunk);
    }
    const input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (typeof input?.input !== "string" || !input.input.length || input.input.length > 100_000)
      return finish(400, { error: "Invalid scan input" });
    const upstream = await fetch(destination, {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(15_000),
      headers: { Authorization: `Bearer ${credential}`, "Content-Type": "application/json" },
      body: JSON.stringify({ input: input.input, flagOnly: false, verbose: true }),
    });
    if (!upstream.ok) return finish(upstream.status, { error: "NeMo scan failed" });
    const scan = await upstream.json();
    if (!["cleared", "flagged", "redacted", "blocked"].includes(scan.result?.outcome))
      return finish(502, { error: "NeMo returned an invalid scan result" });
    return finish(200, { id: scan.id, result: { outcome: scan.result.outcome } });
  } catch (error) {
    return finish(error instanceof SyntaxError ? 400 : 502, { error: "NeMo scan could not be completed" });
  }
});
server.requestTimeout = 20_000;
server.listen(8080, "0.0.0.0");
