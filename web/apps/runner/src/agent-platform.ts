import type {
  AgentMemoryConfiguration,
  AgentPlatformId,
  HttpEndpoint,
} from "@tasklattice/contracts";

type NativeMemoryConfiguration = Extract<
  AgentMemoryConfiguration,
  { mode: "native" }
>;
type HybridMemoryConfiguration = Extract<
  AgentMemoryConfiguration,
  { mode: "hybrid" }
>;

export type RuntimeMemoryConfiguration =
  | NativeMemoryConfiguration
  | (Omit<HybridMemoryConfiguration, "embeddingModelDeploymentId"> & {
      embeddingModel: string;
    });

export interface AgentPlatformRuntime {
  id: AgentPlatformId;
  instructionsPath: string;
  terminalCommand: string;
  inferenceBinaries: readonly string[];
  endpointKind: HttpEndpoint["kind"];
  sandboxImage: () => string;
  bootstrapScript: (
    dashboardOrigin: string,
    dashboardPort: string,
    inferenceEndpoint: string,
    model: string,
    memory?: RuntimeMemoryConfiguration,
  ) => string;
  healthProbe: (dashboardPort: string) => string;
  startupLogs: readonly string[];
}

const openClawBootstrapScript = (
  dashboardOrigin: string,
  dashboardPort: string,
  inferenceEndpoint: string,
  model: string,
  memory?: RuntimeMemoryConfiguration,
) => {
  const memoryPayload = Buffer.from(
    JSON.stringify(memory ?? null),
    "utf8",
  ).toString("base64");
  return `#!/usr/bin/env bash
set -euo pipefail

readonly config_file=/sandbox/.openclaw/openclaw.json
readonly hash_file=/sandbox/.openclaw/.config-hash

node - "$config_file" "${dashboardOrigin}" "${inferenceEndpoint}" "${model}" "${memoryPayload}" <<'NODE'
const fs = require("node:fs");
const [configFile, corsOrigin, inferenceEndpoint, modelId, memoryPayload] = process.argv.slice(2);
const config = JSON.parse(fs.readFileSync(configFile, "utf8"));
const memory = JSON.parse(Buffer.from(memoryPayload, "base64").toString("utf8"));
const controlUi = (config.gateway ??= {}).controlUi ??= {};
const origins = Array.isArray(controlUi.allowedOrigins)
  ? controlUi.allowedOrigins
  : [];
controlUi.allowedOrigins = [...new Set([...origins, corsOrigin])];
const provider = config.models.providers.inference;
provider.baseUrl = inferenceEndpoint;
provider.apiKey = process.env.OPENAI_API_KEY || "OPENAI_API_KEY";
provider.models = [{
  ...provider.models[0],
  id: modelId,
  name: "inference/" + modelId,
}];
config.agents.defaults.model.primary = "inference/" + modelId;
if (memory) {
  const workspaceDirectory = "/sandbox/.openclaw/workspace";
  const dailyMemoryDirectory = workspaceDirectory + "/memory";
  const durableMemoryFile = workspaceDirectory + "/MEMORY.md";
  fs.mkdirSync(dailyMemoryDirectory, { recursive: true, mode: 0o770 });
  if (!fs.existsSync(durableMemoryFile)) {
    fs.writeFileSync(
      durableMemoryFile,
      "# OpenClaw Memory\\n\\n<!-- Durable, Instance-scoped memory managed by the OpenClaw Agent. -->\\n",
      { mode: 0o660 },
    );
  }
  config.memory = {
    ...(config.memory ?? {}),
    backend: "builtin",
    citations: memory.citations,
  };
  if (memory.mode === "hybrid") {
    const secretProviders = (config.secrets ??= {}).providers ??= {};
    secretProviders.tasklattice = {
      source: "env",
      allowlist: ["OPENAI_API_KEY"],
    };
    config.agents.defaults.memorySearch = {
      ...(config.agents.defaults.memorySearch ?? {}),
      enabled: true,
      sources: memory.includeSessionTranscripts
        ? ["memory", "sessions"]
        : ["memory"],
      experimental: {
        sessionMemory: memory.includeSessionTranscripts,
      },
      provider: "openai-compatible",
      remote: {
        baseUrl: inferenceEndpoint,
        apiKey: {
          source: "env",
          provider: "tasklattice",
          id: "OPENAI_API_KEY",
        },
      },
      fallback: "none",
      model: memory.embeddingModel,
      query: {
        maxResults: memory.maxResults,
        minScore: memory.minScore,
      },
    };
  } else {
    config.agents.defaults.memorySearch = {
      ...(config.agents.defaults.memorySearch ?? {}),
      enabled: false,
      sources: ["memory"],
    };
  }
}
fs.writeFileSync(configFile, JSON.stringify(config, null, 2) + "\\n", {
  mode: 0o660,
});
NODE

(cd "$(dirname "$config_file")" && sha256sum "$(basename "$config_file")" >"$hash_file")
exec env "NEMOCLAW_DASHBOARD_PORT=${dashboardPort}" /usr/local/bin/nemoclaw-start
`;
};

const hermesBootstrapScript = (
  _dashboardOrigin: string,
  dashboardPort: string,
  inferenceEndpoint: string,
  model: string,
  _memory?: RuntimeMemoryConfiguration,
) => `#!/usr/bin/env bash
set -euo pipefail

readonly hermes_dir=/sandbox/.hermes
readonly config_file="$hermes_dir/config.yaml"
readonly hash_file="$hermes_dir/.config-hash"
readonly config_bootstrap=/usr/local/lib/tasklattice/bootstrap-hermes-config.py

# OpenShell provisions the persistent workspace root with a setgid, writable
# mode so uploaded files can be staged before the workload starts. Hermes
# deliberately accepts a narrower posture. Only normalize the mount when the
# current sandbox identity owns it; otherwise fail closed and leave the
# upstream boundary validator to report the unexpected ownership.
if [ "$(id -u)" -ne 0 ]; then
  readonly sandbox_identity="$(id -u):$(id -g)"
  readonly workspace_identity="$(stat -c '%u:%g' /sandbox)"
  readonly hermes_identity="$(stat -c '%u:%g' /sandbox/.hermes)"
  if [ "$workspace_identity" != "$sandbox_identity" ]; then
    echo "Refusing to normalize /sandbox owned by $workspace_identity for $sandbox_identity" >&2
    exit 1
  fi
  if [ "$hermes_identity" != "$sandbox_identity" ]; then
    echo "Refusing to normalize /sandbox/.hermes owned by $hermes_identity for $sandbox_identity" >&2
    exit 1
  fi
  chmod 0770 /sandbox
  chmod g-s /sandbox
  chmod 3770 /sandbox/.hermes
fi

printf '[bootstrap] Hermes identity current=%s account=%s workspace=%s state=%s\n' \
  "$(id -u):$(id -g)" \
  "$(id -u sandbox):$(id -g sandbox)" \
  "$(stat -c '%u:%g:%a' /sandbox)" \
  "$(stat -c '%u:%g:%a' /sandbox/.hermes)" >&2

"$config_bootstrap" \
  --config "$config_file" \
  --hash-file "$hash_file" \
  --endpoint "${inferenceEndpoint}" \
  --model "${model}" \
  --template-endpoint https://inference.local/v1 \
  --template-model deepseek-chat
exec env "NEMOCLAW_DASHBOARD_PORT=${dashboardPort}" "NEMOCLAW_MODEL_OVERRIDE=${model}" /usr/local/bin/nemoclaw-start
`;

const agentPlatformRuntimeRegistry = {
  openclaw: {
    id: "openclaw",
    instructionsPath: "/sandbox/.openclaw/workspace/AGENTS.md",
    terminalCommand: "exec openclaw tui",
    inferenceBinaries: ["/usr/local/bin/node"],
    endpointKind: "openclaw-webui",
    sandboxImage: () =>
      process.env.OPENSHELL_SANDBOX_IMAGE ??
      "ghcr.io/sn0rt/tasklattice-nemoclaw-sandbox:dev",
    bootstrapScript: openClawBootstrapScript,
    healthProbe: (dashboardPort) =>
      `test -x /usr/local/bin/nemoclaw-start && test -f /sandbox/.openclaw/openclaw.json && curl -fsS --max-time 3 http://127.0.0.1:${dashboardPort}/health >/dev/null`,
    startupLogs: [
      "OpenClaw Agent instructions uploaded to the sandbox workspace.",
      "NemoClaw supervisor started the OpenClaw Agent gateway.",
      "OpenClaw gateway health check: Ready",
    ],
  },
  hermes: {
    id: "hermes",
    instructionsPath: "/sandbox/.hermes/SOUL.md",
    terminalCommand: "exec hermes --tui",
    inferenceBinaries: [
      "/usr/local/bin/hermes",
      "/usr/local/bin/python",
      "/usr/local/bin/python3",
      "/usr/bin/python3.*",
    ],
    endpointKind: "hermes-dashboard",
    sandboxImage: () =>
      process.env.OPENSHELL_HERMES_SANDBOX_IMAGE ??
      "ghcr.io/sn0rt/tasklattice-nemoclaw-hermes-sandbox:dev",
    bootstrapScript: hermesBootstrapScript,
    healthProbe: () =>
      "test -x /usr/local/bin/hermes && test -f /sandbox/.hermes/config.yaml && curl -fsS --max-time 3 http://127.0.0.1:8642/health >/dev/null",
    startupLogs: [
      "Hermes Agent instructions uploaded to the sandbox state directory.",
      "NemoClaw supervisor started the Hermes gateway.",
      "Hermes API health check: Ready",
    ],
  },
} as const satisfies Record<AgentPlatformId, AgentPlatformRuntime>;

export function getAgentPlatformRuntime(
  agentPlatform: AgentPlatformId,
): AgentPlatformRuntime {
  return agentPlatformRuntimeRegistry[agentPlatform];
}
