import { describe, expect, it, vi } from "vitest";
import {
  encodeTerminalResize,
  parseTerminalResize,
} from "@tasklattice/contracts";
import { agentMemoryInstructions, nemoClawTerminalArguments, onboardCommand } from "./nemoclaw.js";
import { getAgentPlatformRuntime } from "./agent-platform.js";
import {
  composeOpenShellInferencePolicy,
  deepSeekProviderCreateCommand,
  isOpenShellProviderAttachedError,
  openShellNemoClawProbeArguments,
  openShellAuditArguments,
  openShellSandboxCreateArguments,
  openShellTerminalArguments,
  openShellWebUiOrigin,
  openShellWebUiOriginProbeArguments,
  openShellWebUiServiceArguments,
  openShellWebUiTokenArguments,
  parseOpenShellServiceUrl,
  parseOpenShellAuditLog,
  taskLatticeLiteLlmProviderProfile,
  taskLatticeLiteLlmProviderProfileId,
  tokenizedOpenClawUrl,
} from "./openshell.js";

describe("NemoClaw command contract", () => {
  it("maps the scoped LiteLLM endpoint without putting the key in argv", () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "host-secret-value");
    const command = onboardCommand({
      name: "tasklattice-research-a1b2c3d4",
      agentPlatform: "openclaw",
      providerName: "DeepSeek",
      model: "tali/provider/deepseek-chat",
      inferenceEndpoint: "http://tasklattice-litellm:4000/v1",
      systemPrompt: "You are a research agent.",
      apiKey: "database-secret-value",
    });
    expect(command.args).toContain("openclaw");
    expect(command.args.join(" ")).not.toContain("database-secret-value");
    expect(command.env.NEMOCLAW_PROVIDER).toBe("custom");
    expect(command.env.NEMOCLAW_ENDPOINT_URL).toBe("http://tasklattice-litellm:4000/v1");
    expect(command.env.COMPATIBLE_API_KEY).toBe("database-secret-value");
  });

  it("selects Hermes through the same NemoClaw onboarding contract", () => {
    const command = onboardCommand({
      name: "tasklattice-hermes-a1b2c3d4",
      agentPlatform: "hermes",
      providerName: "DeepSeek",
      model: "tali/provider/deepseek-chat",
      inferenceEndpoint: "http://tasklattice-litellm:4000/v1",
      systemPrompt: "You are a research agent.",
      apiKey: "database-secret-value",
    });

    expect(command.args).toContain("hermes");
    expect(command.args).not.toContain("openclaw");
  });
});

describe("OpenShell Kubernetes command contract", () => {
  const input = {
    name: "tasklattice-research-a1b2c3d4",
    agentPlatform: "openclaw" as const,
    providerName: "DeepSeek",
    model: "tali/provider/deepseek-chat",
    inferenceEndpoint: "http://tasklattice-litellm:4000/v1",
    systemPrompt: "You are a research agent.",
    apiKey: "database-secret-value",
  };

  it("passes the virtual key through the Provider environment only", () => {
    const command = deepSeekProviderCreateCommand(input);
    expect(command.args.join(" ")).not.toContain("database-secret-value");
    expect(command.args).toContain(taskLatticeLiteLlmProviderProfileId);
    expect(command.args).toContain("OPENAI_API_KEY");
    expect(command.args).toContain("OPENAI_BASE_URL=http://tasklattice-litellm:4000/v1");
    expect(command.env.OPENAI_API_KEY).toBe("database-secret-value");
  });

  it("recognizes the transient Provider attachment conflict during deletion", () => {
    expect(
      isOpenShellProviderAttachedError(
        "provider 'tali-instance' is attached to sandbox(es): tali-instance",
      ),
    ).toBe(true);
    expect(
      isOpenShellProviderAttachedError("provider 'tali-instance' not found"),
    ).toBe(false);
  });

  it("defines LiteLLM credential injection for OpenClaw and Hermes", () => {
    const profile = taskLatticeLiteLlmProviderProfile(
      "http://tasklattice-litellm.tasklattice-sandboxes.svc.cluster.local:4000/v1",
    );

    expect(profile).toContain("id: tasklattice-litellm");
    expect(profile).toContain("env_vars:\n      - OPENAI_API_KEY");
    expect(profile).toContain("auth_style: bearer");
    expect(profile).toContain("header_name: authorization");
    expect(profile).toContain(
      "host: tasklattice-litellm.tasklattice-sandboxes.svc.cluster.local",
    );
    expect(profile).toContain("port: 4000");
    expect(profile).toContain("access: full");
    expect(profile).toContain("allowed_ips:");
    expect(profile).toContain("- 192.168.0.0/16");
    expect(profile).toContain("- /usr/local/bin/node");
    expect(profile).toContain("- /opt/hermes/.venv/bin/python");
  });

  it("creates a managed Pod-backed sandbox with uploaded instructions", () => {
    const args = openShellSandboxCreateArguments(
      input,
      "/tmp/AGENTS.md",
      "/tmp/tali-nemoclaw-start",
      "/tmp/openshell-policy.yaml",
    );
    expect(args).toContain("ghcr.io/sn0rt/tasklattice-nemoclaw-sandbox:dev");
    expect(args).toContain("tasklattice.ai/managed=true");
    expect(args).toContain(
      "/tmp/AGENTS.md:/sandbox/.openclaw/workspace/AGENTS.md",
    );
    expect(args).toContain(
      "/tmp/tali-nemoclaw-start:/tmp/tali-nemoclaw-start",
    );
    expect(args).toContain("tali-tasklattice-research-a1b2c3d4");
    expect(args).toContain("--policy");
    expect(args).toContain("/tmp/openshell-policy.yaml");
    expect(args).toContain("1");
    expect(args).toContain("2Gi");
    expect(args.slice(-2)).toEqual([
      "/bin/bash",
      "/tmp/tali-nemoclaw-start",
    ]);
  });

  it("leaves inference routing to the attached Provider profile", () => {
    const policy = composeOpenShellInferencePolicy(
      "version: 1\nnetwork_policies:\n  github:\n    name: github\n  tasklattice_inference_gateway:\n    name: legacy\n",
      "http://tasklattice-litellm.tasklattice-sandboxes.svc.cluster.local:4000/v1",
      "openclaw",
    );

    expect(policy).toContain("github:");
    expect(policy).not.toContain("tasklattice_inference_gateway:");
    expect(policy).not.toContain("tasklattice-litellm");
  });

  it("does not duplicate Provider routing in a minimal Hermes policy", () => {
    const policy = composeOpenShellInferencePolicy(
      "version: 1\n",
      "https://inference.example.com/v1",
      "hermes",
    );

    expect(policy).toBe("version: 1\n");
  });

  it("reads and parses OpenShell OCSF policy decisions", () => {
    expect(openShellAuditArguments(input.name).slice(-6)).toEqual([
      "logs",
      input.name,
      "--source",
      "sandbox",
      "--since",
      "24h",
    ]);
    const events = parseOpenShellAuditLog(
      "[1775014132.118] [sandbox] [OCSF ] [ocsf] NET:OPEN [INFO] ALLOWED /usr/bin/curl(58) -> api.github.com:443 [policy:github_api engine:opa]\n" +
      "[1775014132.690] [sandbox] [OCSF ] [ocsf] NET:OPEN [MED] DENIED /usr/bin/curl(64) -> httpbin.org:443 [policy:- engine:opa] [reason:no matching policy]\n" +
      "[1775014113.058] [sandbox] [INFO ] [openshell_sandbox] Starting sandbox\n",
    );
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      category: "NET:OPEN",
      severity: "MED",
      decision: "DENIED",
    });
    expect(events[1]).toMatchObject({
      decision: "ALLOWED",
      policy: "github_api",
    });
  });

  it("only marks the runtime healthy after the NemoClaw gateway responds", () => {
    const args = openShellNemoClawProbeArguments(
      input.name,
      input.agentPlatform,
    );
    expect(args).toContain(input.name);
    expect(args.at(-1)).toContain("/usr/local/bin/nemoclaw-start");
    expect(args.at(-1)).toContain("/sandbox/.openclaw/openclaw.json");
    expect(args.at(-1)).toContain("127.0.0.1:18789/health");
  });

  it("opens only the Gateway-backed OpenClaw TUI", () => {
    const args = openShellTerminalArguments(input.name, input.agentPlatform);
    expect(args).toContain(input.name);
    expect(args).toContain("--tty");
    expect(args).toContain("--timeout");
    expect(args).toContain("TERM=xterm-256color");
    expect(args.at(-1)).toBe("exec openclaw tui");
    expect(args.at(-1)).not.toContain("--local");
    expect(args.at(-1)).not.toContain("/bin/bash -l");
  });

  it("launches the OpenClaw TUI through a NemoClaw exec PTY", () => {
    const args = nemoClawTerminalArguments(input.name, input.agentPlatform);
    expect(args.slice(0, 7)).toEqual([
      input.name,
      "exec",
      "--tty",
      "--stdin",
      "--timeout",
      "0",
      "--",
    ]);
    expect(args.at(-1)).toBe("exec openclaw tui");
  });

  it("uses the Hermes image, state path, health probe, and TUI adapter", () => {
    const hermesInput = { ...input, agentPlatform: "hermes" as const };
    const createArgs = openShellSandboxCreateArguments(
      hermesInput,
      "/tmp/SOUL.md",
      "/tmp/tali-nemoclaw-start",
      "/tmp/openshell-policy.yaml",
    );

    expect(createArgs).toContain(
      "ghcr.io/sn0rt/tasklattice-nemoclaw-hermes-sandbox:dev",
    );
    expect(createArgs).toContain("/tmp/SOUL.md:/sandbox/.hermes/SOUL.md");
    expect(
      openShellNemoClawProbeArguments(
        hermesInput.name,
        hermesInput.agentPlatform,
      ).at(-1),
    ).toContain("127.0.0.1:8642/health");
    expect(
      openShellTerminalArguments(
        hermesInput.name,
        hermesInput.agentPlatform,
      ).at(-1),
    ).toBe("exec hermes --tui");
    expect(
      nemoClawTerminalArguments(
        hermesInput.name,
        hermesInput.agentPlatform,
      ).at(-1),
    ).toBe("exec hermes --tui");
  });

  it("normalizes only a sandbox-owned Hermes workspace mount", () => {
    const bootstrap = getAgentPlatformRuntime("hermes").bootstrapScript(
      "http://hermes.example.test",
      "18789",
      "http://inference.example.test/v1",
      "deepseek-chat",
    );

    expect(bootstrap).toContain("workspace_identity=\"$(stat -c '%u:%g' /sandbox)\"");
    expect(bootstrap).toContain('[ "$workspace_identity" != "$sandbox_identity" ]');
    expect(bootstrap).toContain("chmod 0770 /sandbox");
    expect(bootstrap).toContain("chmod g-s /sandbox");
    expect(bootstrap).toContain("chmod 3770 /sandbox/.hermes");
    expect(bootstrap).toContain("[bootstrap] Hermes identity");
    expect(bootstrap).toContain("bootstrap-hermes-config.py");
    expect(bootstrap).not.toContain("sed -i");
    expect(bootstrap.indexOf("chmod 0770 /sandbox")).toBeLessThan(
      bootstrap.indexOf("/usr/local/bin/nemoclaw-start"),
    );
  });

  it("bootstraps native OpenClaw Memory without enabling semantic search", () => {
    const bootstrap = getAgentPlatformRuntime("openclaw").bootstrapScript(
      "http://openclaw.example.test",
      "18789",
      "http://inference.example.test/v1",
      "deepseek-chat",
      { mode: "native", citations: "auto" },
    );

    expect(bootstrap).toContain("MEMORY.md");
    expect(bootstrap).toContain('enabled: false');
    expect(bootstrap).toContain('backend: "builtin"');
    expect(agentMemoryInstructions({ mode: "native", citations: "auto" }))
      .toContain("Read MEMORY.md at the start of a new session");
  });

  it("configures Hybrid Memory through the Instance LiteLLM endpoint", () => {
    const bootstrap = getAgentPlatformRuntime("openclaw").bootstrapScript(
      "http://openclaw.example.test",
      "18789",
      "http://inference.example.test/v1",
      "deepseek-chat",
      {
        mode: "hybrid",
        embeddingModel: "tali/provider-a/text-embedding-3-small",
        includeSessionTranscripts: true,
        citations: "auto",
        maxResults: 6,
        minScore: 0.35,
      },
    );

    expect(bootstrap).toContain('provider: "openai-compatible"');
    expect(bootstrap).toContain("OPENAI_API_KEY");
    expect(bootstrap).toContain('sources: memory.includeSessionTranscripts');
    expect(agentMemoryInstructions({
      mode: "hybrid",
      embeddingModel: "embedding-model",
      includeSessionTranscripts: true,
      citations: "auto",
      maxResults: 6,
      minScore: 0.35,
    })).toContain("Use memory_search before answering");
  });

  it("exposes the NemoClaw Web UI as a named OpenShell service", () => {
    expect(openShellWebUiServiceArguments(input.name, "expose").slice(-5)).toEqual([
      "service",
      "expose",
      input.name,
      "18789",
      "webui",
    ]);
    expect(openShellWebUiServiceArguments(input.name, "get").slice(-4)).toEqual([
      "service",
      "get",
      input.name,
      "webui",
    ]);
    expect(openShellWebUiServiceArguments(input.name, "delete").slice(-4)).toEqual([
      "service",
      "delete",
      input.name,
      "webui",
    ]);
  });

  it("extracts the browser endpoint from colored OpenShell output", () => {
    expect(
      parseOpenShellServiceUrl(
        "URL: \u001b[36mhttp://sandbox--webui.openshell.localhost:8080/\u001b[39m\n",
      ),
    ).toBe("http://sandbox--webui.openshell.localhost:8080/");
    expect(parseOpenShellServiceUrl("service endpoint not found")).toBeUndefined();
  });

  it("authorizes the routed origin and bootstraps dashboard authentication", () => {
    const endpoint =
      "http://tali-research-a1b2c3d4--webui.openshell.localhost:8080/";
    expect(openShellWebUiOrigin("tali-research-a1b2c3d4")).toBe(
      "http://tali-research-a1b2c3d4--webui.openshell.localhost:8080",
    );
    expect(openShellWebUiOriginProbeArguments(input.name, endpoint)).toContain(
      "http://tali-research-a1b2c3d4--webui.openshell.localhost:8080",
    );
    expect(openShellWebUiTokenArguments(input.name).slice(-6)).toEqual([
      "--name",
      input.name,
      "--",
      "node",
      "-e",
      'const c=require("/sandbox/.openclaw/openclaw.json");process.stdout.write(c.gateway.auth.token)',
    ]);
    expect(tokenizedOpenClawUrl(endpoint, "secret value\n")).toBe(
      `${endpoint}#token=secret+value`,
    );
  });

  it("round-trips bounded browser terminal resize messages", () => {
    expect(parseTerminalResize(encodeTerminalResize({ cols: 120, rows: 36 }))).toEqual({
      cols: 120,
      rows: 36,
    });
    expect(parseTerminalResize("plain terminal input")).toBeUndefined();
    expect(parseTerminalResize("\u0000TALI_RESIZE:120:36:1")).toBeUndefined();
    expect(parseTerminalResize(encodeTerminalResize({ cols: 2, rows: 1 }))).toBeUndefined();
  });
});
