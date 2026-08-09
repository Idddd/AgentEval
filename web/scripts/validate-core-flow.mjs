import WebSocket from "ws";

const baseUrl = process.env.TALI_BASE_URL ?? "http://127.0.0.1:18080";
const expectNemoClawRuntime = process.env.TALI_EXPECT_NEMOCLAW_RUNTIME === "1";
const validationUsername =
  process.env.TALI_VALIDATION_USERNAME ?? "admin";
const validationPassword =
  process.env.TALI_VALIDATION_PASSWORD ?? "admin";
let authToken = "";

async function request(path, init) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(authToken ? { authorization: `Bearer ${authToken}` } : {}),
      ...init?.headers,
    },
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? `HTTP ${response.status}`);
  return payload;
}

const login = await request("/api/v1/auth/local", {
  method: "POST",
  body: JSON.stringify({
    password: validationPassword,
    remember: false,
    username: validationUsername,
  }),
});
authToken = login.token;

const models = await request("/api/v1/providers/models");
const validatedModel = models.data.find(
  (model) => model.status === "VALIDATED" && model.modelType === "llm",
);
if (!validatedModel)
  throw new Error(
    "No validated LLM deployment is available for Instance creation.",
  );

const created = await request("/api/v1/agents", {
  method: "POST",
  body: JSON.stringify({
    name: `validation-${Date.now().toString().slice(-6)}`,
    description: "REST and terminal contract validation",
    runtime: "openshell",
    agentPlatform: "openclaw",
    modelDeploymentId: validatedModel.id,
    systemPrompt: "You are a validation agent. Report runtime evidence clearly.",
  }),
});

let agent = created;
for (let attempt = 0; attempt < 180 && agent.status === "PROVISIONING"; attempt += 1) {
  await new Promise((resolve) => setTimeout(resolve, 1_000));
  agent = await request(`/api/v1/agents/${created.id}`);
}
if (agent.status !== "READY") throw new Error(`Agent did not become READY: ${JSON.stringify(agent)}`);

let httpEndpointEvidence;
if (expectNemoClawRuntime) {
  if (agent.httpEndpoint?.status !== "READY" || !agent.httpEndpoint.url)
    throw new Error(`NemoClaw HTTP Endpoint unavailable: ${JSON.stringify(agent.httpEndpoint)}`);
  const endpointResponse = await fetch(agent.httpEndpoint.url, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!endpointResponse.ok)
    throw new Error(`NemoClaw HTTP Endpoint returned ${endpointResponse.status}.`);
  httpEndpointEvidence = `${agent.httpEndpoint.kind} returned HTTP ${endpointResponse.status}.`;
} else {
  httpEndpointEvidence = "Not required for the fixture runtime.";
}

const runtime = await request("/api/v1/runtime");
let terminalEvidence;
if (!runtime.terminal.available) {
  if (expectNemoClawRuntime)
    throw new Error(`NemoClaw TUI runtime unavailable: ${JSON.stringify(runtime)}`);
  let rejection = "";
  try {
    await request(`/api/v1/agents/${agent.id}/terminal-sessions`, {
      method: "POST",
      body: "{}",
    });
  } catch (error) {
    rejection = error instanceof Error ? error.message : String(error);
  }
  if (!rejection.includes("fixture runner"))
    throw new Error(`Fixture TUI session was not rejected safely: ${rejection}`);
  terminalEvidence = `TUI unavailable in ${runtime.mode}; host shell blocked before session creation.`;
} else {
  const session = await request(`/api/v1/agents/${agent.id}/terminal-sessions`, {
    method: "POST",
    body: "{}",
  });
  const wsBase = new URL(baseUrl);
  wsBase.protocol = wsBase.protocol === "https:" ? "wss:" : "ws:";
  const socket = new WebSocket(new URL(session.websocketUrl, wsBase));
  terminalEvidence = await new Promise((resolve, reject) => {
    let output = "";
    let runtimeConnected = false;
    const timer = setTimeout(
      () => reject(new Error(`NemoClaw TUI frame timeout: ${output}`)),
      20_000,
    );
    socket.on("message", (raw) => {
      const chunk = raw.toString();
      output += chunk;
      if (chunk.startsWith("Connected to NemoClaw runtime")) {
        runtimeConnected = true;
        return;
      }
      if (runtimeConnected && chunk.length > 0) {
        clearTimeout(timer);
        socket.close();
        resolve("NemoClaw runtime connected and OpenClaw TUI produced its first PTY frame.");
      }
    });
    socket.on("error", reject);
  });
}

const destroyed = await request(`/api/v1/agents/${agent.id}`, { method: "DELETE" });
const deletedResource = await fetch(`${baseUrl}/api/v1/agents/${agent.id}`, {
  headers: { authorization: `Bearer ${authToken}` },
});
const deletedEndpoint = agent.httpEndpoint?.url
  ? await fetch(agent.httpEndpoint.url)
  : undefined;
if (destroyed.status !== "DESTROYED" || deletedResource.status !== 404) {
  throw new Error(`Agent delete contract failed: ${JSON.stringify({ destroyed, getStatus: deletedResource.status })}`);
}
if (expectNemoClawRuntime && deletedEndpoint?.status !== 404)
  throw new Error(`Deleted HTTP Endpoint returned ${deletedEndpoint?.status ?? "no response"}.`);

console.log(JSON.stringify({
  result: "PASS",
  agentId: agent.id,
  sandboxName: agent.sandboxName,
  status: agent.status,
  runtime: agent.runtime,
  provider: agent.providerName,
  httpEndpointEvidence,
  terminalEvidence: String(terminalEvidence).replace(/\u001b\[[0-9;?]*[A-Za-z]/g, "").trim(),
  deleteEvidence: `${destroyed.status} / Agent GET ${deletedResource.status} / Endpoint GET ${deletedEndpoint?.status ?? "N/A"}`,
}, null, 2));
