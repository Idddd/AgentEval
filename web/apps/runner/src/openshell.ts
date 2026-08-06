import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import type { ProvisioningStage, SandboxAuditEvent } from "@tasklattice/contracts";
import type { AgentPlatformId } from "@tasklattice/contracts";
import { parse, stringify } from "yaml";
import { getAgentPlatformRuntime } from "./agent-platform.js";
import {
  agentMemoryInstructions,
  runCommand,
  type ProvisionInput,
} from "./nemoclaw.js";

const nemoClawGatewayPort = process.env.NEMOCLAW_DASHBOARD_PORT ?? "18789";
const nemoClawWebUiService = "webui";
const kubernetesServiceDnsSuffix = "svc.cluster.local";
const defaultKubernetesServiceCidrs = [
  "10.0.0.0/8",
  "172.16.0.0/12",
  "192.168.0.0/16",
] as const;

function kubernetesServiceCidrs(): string[] {
  return (
    process.env.OPENSHELL_KUBERNETES_SERVICE_CIDRS
      ?.split(",")
      .map((cidr) => cidr.trim())
      .filter(Boolean)
    ?? [...defaultKubernetesServiceCidrs]
  );
}

export interface OpenShellSandbox {
  name: string;
  phase: string;
}

export interface ProvisioningObserver {
  onLog?: (lines: string[]) => void;
  onStage?: (stage: ProvisioningStage, message: string) => void;
}

export const taskLatticeLiteLlmProviderProfileId = "tasklattice-litellm";

export function taskLatticeLiteLlmProviderProfile(
  inferenceEndpoint: string,
  routingId = taskLatticeLiteLlmProviderProfileId,
  resourceVersion?: number,
): string {
  const endpoint = new URL(inferenceEndpoint);
  if (endpoint.protocol !== "http:" && endpoint.protocol !== "https:")
    throw new Error("The Instance inference endpoint must use HTTP or HTTPS.");
  const port = endpoint.port
    ? Number(endpoint.port)
    : endpoint.protocol === "https:"
      ? 443
      : 80;
  const isKubernetesService =
    endpoint.hostname === kubernetesServiceDnsSuffix ||
    endpoint.hostname.endsWith(`.${kubernetesServiceDnsSuffix}`);
  return stringify(
    {
      id: routingId,
      ...(resourceVersion !== undefined
        ? { resource_version: resourceVersion }
        : {}),
      display_name: "TaskLattice LiteLLM",
      description:
        "TaskLattice instance-scoped inference through the LiteLLM gateway",
      category: "inference",
      credentials: [
        {
          name: "api_key",
          description: "TaskLattice Instance virtual key",
          env_vars: ["OPENAI_API_KEY"],
          required: true,
          auth_style: "bearer",
          header_name: "authorization",
          query_param: "",
        },
      ],
      endpoints: [
        {
          host: endpoint.hostname,
          port,
          protocol: "rest",
          // OpenShell 0.0.82 does not expand the read-write shorthand for a
          // provider-composed endpoint before enforcing the tunneled POST.
          // The virtual key remains model-scoped; full only affects methods
          // sent to this one exact LiteLLM host and port.
          access: "full",
          enforcement: "enforce",
          ...(isKubernetesService
            ? { allowed_ips: kubernetesServiceCidrs() }
            : {}),
        },
      ],
      binaries: [
        "/usr/local/bin/node",
        "/usr/local/bin/hermes",
        "/opt/hermes/.venv/bin/python",
        "/opt/hermes/.venv/bin/python3",
        "/usr/local/bin/python",
        "/usr/local/bin/python3",
        "/usr/bin/python3.*",
      ],
      inference_capable: true,
      discovery: { credentials: ["api_key"] },
    },
    { lineWidth: 0 },
  ).trimEnd() + "\n";
}

export function openShellBinary(): string {
  return process.env.OPENSHELL_BIN ?? "openshell";
}

export function openShellArguments(args: string[]): string[] {
  return [
    "--gateway-endpoint",
    process.env.OPENSHELL_GATEWAY_ENDPOINT ??
      "http://openshell.openshell.svc.cluster.local:8080",
    ...args,
  ];
}

export function openShellAuditArguments(name: string): string[] {
  return openShellArguments([
    "logs",
    name,
    "--source",
    "sandbox",
    "--since",
    "24h",
  ]);
}

function auditTimestamp(value: string): string {
  const epochSeconds = Number(value);
  if (Number.isFinite(epochSeconds))
    return new Date(epochSeconds * 1_000).toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? new Date(0).toISOString()
    : parsed.toISOString();
}

export function parseOpenShellAuditLog(output: string): SandboxAuditEvent[] {
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((raw, index) => {
      const match = raw.match(
        /^\[([^\]]+)\]\s+\[([^\]]+)\]\s+\[([^\]]+)\]\s+\[([^\]]+)\]\s+(\S+)\s+\[([^\]]+)\]\s+(.*)$/,
      );
      if (!match || match[3]?.trim() !== "OCSF") return [];
      const body = match[7] ?? "";
      const decision =
        (["ALLOWED", "DENIED", "BLOCKED", "APPROVED", "REJECTED"] as const).find(
          (value) => new RegExp(`\\b${value}\\b`).test(body),
        ) ?? "OBSERVED";
      const severity = match[6]?.trim().toUpperCase();
      const normalizedSeverity = (
        ["INFO", "LOW", "MED", "HIGH", "CRIT"] as const
      ).find((value) => value === severity) ?? "UNKNOWN";
      const source = match[2]?.trim();
      const timestamp = auditTimestamp(match[1] ?? "");
      const policy = body.match(/\[policy:([^\s\]]+)/)?.[1];
      return [
        {
          id: `${timestamp}-${index}`,
          timestamp,
          source:
            source === "gateway" || source === "sandbox" ? source : "unknown",
          category: match[5] ?? "OCSF",
          severity: normalizedSeverity,
          decision,
          summary: body,
          ...(policy && policy !== "-" ? { policy } : {}),
          raw,
        } satisfies SandboxAuditEvent,
      ];
    })
    .reverse();
}

export async function getOpenShellAuditEvents(
  name: string,
): Promise<SandboxAuditEvent[]> {
  const result = await runCommand(
    openShellBinary(),
    openShellAuditArguments(name),
  );
  if (result.exitCode !== 0)
    throw new Error(
      result.stderr.trim() || "Unable to read OpenShell sandbox audit logs.",
    );
  return parseOpenShellAuditLog(result.stdout);
}

export function deepSeekProviderCreateCommand(input: ProvisionInput): {
  args: string[];
  env: NodeJS.ProcessEnv;
} {
  const apiKey = input.apiKey;
  return {
    args: openShellArguments([
      "provider",
      "create",
      "--name",
      openShellProviderName(input.name),
      "--type",
      taskLatticeLiteLlmProviderProfileId,
      "--credential",
      "OPENAI_API_KEY",
      "--config",
      `OPENAI_BASE_URL=${input.inferenceEndpoint}`,
    ]),
    env: {
      ...process.env,
      ...(apiKey ? { OPENAI_API_KEY: apiKey } : {}),
    },
  };
}

async function ensureLiteLlmProviderProfile(
  inferenceEndpoint: string,
): Promise<void> {
  const temporaryDirectory = await mkdtemp(
    join(tmpdir(), "tasklattice-openshell-profile-"),
  );
  const profileFile = join(temporaryDirectory, "tasklattice-litellm.yaml");
  try {
    const existing = await runCommand(
      openShellBinary(),
      openShellArguments([
        "provider",
        "profile",
        "export",
        taskLatticeLiteLlmProviderProfileId,
      ]),
    );
    let resourceVersion: number | undefined;
    const desiredProfile = parse(
      taskLatticeLiteLlmProviderProfile(inferenceEndpoint),
    ) as unknown;
    if (existing.exitCode === 0) {
      const exported = parse(existing.stdout) as unknown;
      if (!isRecord(exported) || !Number.isInteger(exported.resource_version))
        throw new Error(
          "OpenShell exported the TaskLattice LiteLLM Provider profile without a resource version.",
        );
      resourceVersion = exported.resource_version as number;
      const currentProfile = { ...exported };
      delete currentProfile.resource_version;
      if (isDeepStrictEqual(currentProfile, desiredProfile)) return;
    }
    await writeFile(
      profileFile,
      taskLatticeLiteLlmProviderProfile(
        inferenceEndpoint,
        taskLatticeLiteLlmProviderProfileId,
        resourceVersion,
      ),
      { mode: 0o600 },
    );
    if (existing.exitCode !== 0) {
      const linted = await runCommand(
        openShellBinary(),
        openShellArguments([
          "provider",
          "profile",
          "lint",
          "--file",
          profileFile,
        ]),
      );
      if (linted.exitCode !== 0)
        throw new Error(
          linted.stderr.trim() ||
            "OpenShell rejected the TaskLattice LiteLLM Provider profile.",
        );
    }
    const profileCommand = resourceVersion !== undefined
      ? [
          "provider",
          "profile",
          "update",
          taskLatticeLiteLlmProviderProfileId,
          "--file",
          profileFile,
        ]
      : ["provider", "profile", "import", "--file", profileFile];
    let applied = await runCommand(
      openShellBinary(),
      openShellArguments(profileCommand),
    );
    if (applied.exitCode !== 0 && existing.exitCode !== 0) {
      // A concurrent Instance may have imported the shared profile after the
      // export probe. Re-enter once so its resource_version is preserved.
      await ensureLiteLlmProviderProfile(inferenceEndpoint);
      return;
    }
    if (applied.exitCode !== 0)
      throw new Error(
        applied.stderr.trim() ||
          "Unable to register the TaskLattice LiteLLM Provider profile.",
      );
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

async function ensureProviderPolicyCompositionEnabled(): Promise<void> {
  const current = await runCommand(
    openShellBinary(),
    openShellArguments(["settings", "get", "--global", "--json"]),
  );
  if (current.exitCode !== 0)
    throw new Error(
      current.stderr.trim() || "Unable to read OpenShell global settings.",
    );
  const document = JSON.parse(current.stdout) as unknown;
  if (
    isRecord(document) &&
    isRecord(document.settings) &&
    document.settings.providers_v2_enabled === "true"
  )
    return;
  const enabled = await runCommand(
    openShellBinary(),
    openShellArguments([
      "settings",
      "set",
      "--global",
      "--key",
      "providers_v2_enabled",
      "--value",
      "true",
      "--yes",
    ]),
  );
  if (enabled.exitCode !== 0)
    throw new Error(
      enabled.stderr.trim() ||
        "Unable to enable OpenShell Provider policy composition.",
    );
}

export function openShellProviderName(sandboxName: string): string {
  return `tali-${sandboxName}`.slice(0, 63).replace(/-$/, "");
}

export function isOpenShellProviderAttachedError(output: string): boolean {
  const normalized = output.toLowerCase();
  return normalized.includes("provider")
    && normalized.includes("attached to")
    && normalized.includes("sandbox");
}

function openShellDeletionTiming(): { pollMs: number; timeoutMs: number } {
  return {
    pollMs: Math.max(
      100,
      Number(process.env.OPENSHELL_DELETE_POLL_INTERVAL_MS) || 500,
    ),
    timeoutMs: Math.max(
      1_000,
      Number(process.env.OPENSHELL_DELETE_TIMEOUT_MS) || 60_000,
    ),
  };
}

function waitForDeletionPoll(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function composeOpenShellInferencePolicy(
  policyYaml: string,
  _inferenceEndpoint: string,
  _agentPlatform: AgentPlatformId,
): string {
  const document = parse(policyYaml) as unknown;
  if (!isRecord(document) || document.version !== 1)
    throw new Error("OpenShell Policy YAML must be an object with version: 1.");

  const networkPolicies = isRecord(document.network_policies)
    ? { ...document.network_policies }
    : {};
  // Provider v2 composes the inference endpoint as an isolated `_provider_*`
  // rule. Keeping the legacy direct rule in a business policy can match first
  // and bypass credential resolution, so remove only TaskLattice's old entry.
  delete networkPolicies.tasklattice_inference_gateway;
  if (Object.keys(networkPolicies).length > 0)
    document.network_policies = networkPolicies;
  else
    delete document.network_policies;

  return stringify(document, { lineWidth: 0 }).trimEnd() + "\n";
}

export function openShellSandboxCreateArguments(
  input: ProvisionInput,
  instructionsFile: string,
  bootstrapFile: string,
  policyFile: string,
): string[] {
  const runtime = getAgentPlatformRuntime(input.agentPlatform);
  return openShellArguments([
    "sandbox",
    "create",
    "--name",
    input.name,
    "--from",
    runtime.sandboxImage(),
    "--cpu",
    process.env.OPENSHELL_SANDBOX_CPU ?? "1",
    "--memory",
    process.env.OPENSHELL_SANDBOX_MEMORY ?? "2Gi",
    "--provider",
    openShellProviderName(input.name),
    "--policy",
    policyFile,
    "--label",
    "tasklattice.ai/managed=true",
    "--label",
    `tali.io/instance-id=${input.instanceId}`,
    "--env",
    `TALI_AGENT_INSTANCE_ID=${input.instanceId}`,
    "--upload",
    `${instructionsFile}:${runtime.instructionsPath}`,
    "--upload",
    `${bootstrapFile}:/tmp/tali-nemoclaw-start`,
    "--no-tty",
    "--",
    "/bin/bash",
    "/tmp/tali-nemoclaw-start",
  ]);
}

export function openShellNemoClawProbeArguments(
  name: string,
  agentPlatform: AgentPlatformId,
): string[] {
  const runtime = getAgentPlatformRuntime(agentPlatform);
  return openShellArguments([
    "sandbox",
    "exec",
    "--name",
    name,
    "--",
    "/bin/sh",
    "-lc",
    runtime.healthProbe(nemoClawGatewayPort),
  ]);
}

export function openShellTerminalArguments(
  name: string,
  agentPlatform: AgentPlatformId,
): string[] {
  const runtime = getAgentPlatformRuntime(agentPlatform);
  return openShellArguments([
    "sandbox",
    "exec",
    "--name",
    name,
    "--tty",
    "--timeout",
    "0",
    "--env",
    "TERM=xterm-256color",
    "--env",
    "COLORTERM=truecolor",
    "--",
    "/bin/bash",
    "-lc",
    runtime.terminalCommand,
  ]);
}

export function openShellWebUiServiceArguments(
  name: string,
  action: "delete" | "expose" | "get",
): string[] {
  return openShellArguments([
    "service",
    action,
    name,
    ...(action === "expose" ? [nemoClawGatewayPort] : []),
    nemoClawWebUiService,
  ]);
}

export function openShellWebUiOrigin(name: string): string {
  const base = new URL(
    process.env.OPENSHELL_SERVICE_BASE_URL ??
      "http://openshell.localhost:8080",
  );
  base.hostname = `${name}--${nemoClawWebUiService}.${base.hostname}`;
  return base.origin;
}

export function openShellWebUiTokenArguments(name: string): string[] {
  return openShellArguments([
    "sandbox",
    "exec",
    "--name",
    name,
    "--",
    "node",
    "-e",
    'const c=require("/sandbox/.openclaw/openclaw.json");process.stdout.write(c.gateway.auth.token)',
  ]);
}

export function openShellWebUiOriginProbeArguments(
  name: string,
  endpointUrl: string,
): string[] {
  return openShellArguments([
    "sandbox",
    "exec",
    "--name",
    name,
    "--",
    "node",
    "-e",
    'const c=require("/sandbox/.openclaw/openclaw.json");if(!c.gateway?.controlUi?.allowedOrigins?.includes(process.argv[1]))process.exit(1)',
    new URL(endpointUrl).origin,
  ]);
}

export function tokenizedOpenClawUrl(endpointUrl: string, token: string): string {
  const url = new URL(endpointUrl);
  url.hash = new URLSearchParams({ token: token.trim() }).toString();
  return url.toString();
}

export async function deleteOpenShellWebUiEndpoint(
  name: string,
): Promise<void> {
  const result = await runCommand(
    openShellBinary(),
    openShellWebUiServiceArguments(name, "delete"),
  );
  const output = `${result.stdout}\n${result.stderr}`;
  if (result.exitCode !== 0 && !output.includes("service endpoint not found"))
    throw new Error(
      result.stderr.trim() ||
        result.stdout.trim() ||
        "Unable to delete the OpenClaw Web UI endpoint.",
    );
}

export function parseOpenShellServiceUrl(output: string): string | undefined {
  const plain = output.replace(/\u001b\[[0-9;]*m/g, "");
  const candidate = plain.match(/https?:\/\/[^\s]+/g)?.at(-1);
  if (!candidate) return undefined;
  try {
    const url = new URL(candidate);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

export async function ensureOpenShellWebUiEndpoint(
  name: string,
  agentPlatform: AgentPlatformId,
): Promise<string> {
  const existing = await runCommand(
    openShellBinary(),
    openShellWebUiServiceArguments(name, "get"),
  );
  let endpointUrl = parseOpenShellServiceUrl(existing.stdout);
  if (existing.exitCode !== 0 || !endpointUrl) {
    const exposed = await runCommand(
      openShellBinary(),
      openShellWebUiServiceArguments(name, "expose"),
    );
    endpointUrl = parseOpenShellServiceUrl(exposed.stdout);
    if (exposed.exitCode !== 0 || !endpointUrl)
      throw new Error(
        exposed.stderr.trim() ||
          exposed.stdout.trim() ||
          "OpenShell did not return a NemoClaw Web UI endpoint.",
      );
  }

  if (agentPlatform === "hermes") return endpointUrl;

  if (new URL(endpointUrl).origin !== openShellWebUiOrigin(name))
    throw new Error(
      "The OpenShell service URL does not match OPENSHELL_SERVICE_BASE_URL; the OpenClaw Web UI origin was not authorized at sandbox startup.",
    );

  const originProbe = await runCommand(
    openShellBinary(),
    openShellWebUiOriginProbeArguments(name, endpointUrl),
  );
  if (originProbe.exitCode !== 0)
    throw new Error(
      "The OpenClaw gateway did not retain the routed Web UI origin allowlist.",
    );

  const token = await runCommand(
    openShellBinary(),
    openShellWebUiTokenArguments(name),
  );
  if (token.exitCode !== 0 || !token.stdout.trim())
    throw new Error(
      token.stderr.trim() || "Unable to resolve the OpenClaw Web UI token.",
    );

  return tokenizedOpenClawUrl(endpointUrl, token.stdout);
}

async function createOpenShellNemoClawSandbox(
  input: ProvisionInput,
  instructionsFile: string,
  bootstrapFile: string,
  policyFile: string,
  observer?: ProvisioningObserver,
): Promise<string[]> {
  const timeoutMs = Number(process.env.NEMOCLAW_START_TIMEOUT_MS ?? "180000");
  return new Promise((resolve, reject) => {
    const child = spawn(
      openShellBinary(),
      openShellSandboxCreateArguments(
        input,
        instructionsFile,
        bootstrapFile,
        policyFile,
      ),
      { env: process.env, stdio: ["ignore", "pipe", "pipe"] },
    );
    let output = "";
    let pendingLine = "";
    let settled = false;
    let probing = false;
    const append = (data: Buffer) => {
      const chunk = data.toString();
      output = (output + chunk).slice(-64_000);
      const parts = `${pendingLine}${chunk}`.split(/\r?\n/);
      pendingLine = parts.pop() ?? "";
      const lines = parts.filter(Boolean);
      if (lines.length) observer?.onLog?.(lines);
    };
    child.stdout.on("data", append);
    child.stderr.on("data", append);

    const flushPendingLine = () => {
      if (!pendingLine) return;
      observer?.onLog?.([pendingLine]);
      pendingLine = "";
    };

    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearInterval(probeTimer);
      clearTimeout(timeoutTimer);
      flushPendingLine();
      if (error) reject(error);
      else resolve(output.split("\n").filter(Boolean).slice(-100));
    };

    const probeTimer = setInterval(async () => {
      if (settled || probing) return;
      probing = true;
      try {
        const probe = await runCommand(
          openShellBinary(),
          openShellNemoClawProbeArguments(
            input.name,
            input.agentPlatform,
          ),
        );
        if (probe.exitCode === 0) {
          // The startup command is intentionally long-lived. Match NemoClaw's
          // create-stream behavior: detach the local CLI once runtime health is
          // proven; OpenShell keeps nemoclaw-start as a child of its PID 1.
          settled = true;
          clearInterval(probeTimer);
          clearTimeout(timeoutTimer);
          flushPendingLine();
          child.kill("SIGTERM");
          resolve(output.split("\n").filter(Boolean).slice(-100));
        }
      } finally {
        probing = false;
      }
    }, 1_000);

    const timeoutTimer = setTimeout(() => {
      child.kill("SIGTERM");
      finish(
        new Error(
          `NemoClaw gateway startup timed out. ${output.trim().slice(-4_000)}`,
        ),
      );
    }, timeoutMs);

    child.on("error", (error) => finish(error));
    child.on("close", (code) => {
      if (settled) return;
      finish(
        new Error(
          output.trim() || `OpenShell sandbox creation exited ${code ?? 1}.`,
        ),
      );
    });
  });
}

async function ensureInstanceProvider(input: ProvisionInput): Promise<void> {
  await ensureProviderPolicyCompositionEnabled();
  await ensureLiteLlmProviderProfile(input.inferenceEndpoint);
  const providerName = openShellProviderName(input.name);
  const existing = await runCommand(
    openShellBinary(),
    openShellArguments(["provider", "get", providerName]),
  );
  if (existing.exitCode === 0) {
    const plain = existing.stdout.replace(/\u001b\[[0-9;]*m/g, "");
    const providerType = plain.match(/^\s*Type:\s*(\S+)/m)?.[1];
    if (providerType === taskLatticeLiteLlmProviderProfileId) return;
    throw new Error(
      `Existing OpenShell Provider ${providerName} uses legacy type ${providerType ?? "unknown"}; migrate or remove it before reprovisioning this Instance.`,
    );
  }

  const apiKey = input.apiKey;
  if (!apiKey)
    throw new Error(
      "A LiteLLM virtual key is required to create the OpenShell provider.",
    );

  const command = deepSeekProviderCreateCommand(input);
  const created = await runCommand(
    openShellBinary(),
    command.args,
    command.env,
  );
  if (created.exitCode !== 0) {
    // Another concurrent request may have created the shared provider.
    const retry = await runCommand(
      openShellBinary(),
      openShellArguments(["provider", "get", providerName]),
    );
    if (retry.exitCode !== 0)
      throw new Error(
        created.stderr.trim() || "Unable to configure the Instance Provider.",
      );
  }
}

export async function provisionOpenShellSandbox(
  input: ProvisionInput,
  observer?: ProvisioningObserver,
): Promise<string[]> {
  observer?.onStage?.("PROVIDER", "Creating an isolated LiteLLM Provider for this Instance.");
  await ensureInstanceProvider(input);

  observer?.onStage?.("SANDBOX", "Applying the OpenShell policy and scoped Provider attachment.");

  const temporaryDirectory = await mkdtemp(join(tmpdir(), "tasklattice-openshell-"));
  const runtime = getAgentPlatformRuntime(input.agentPlatform);
  const instructionsFile = join(temporaryDirectory, "AGENTS.md");
  const bootstrapFile = join(temporaryDirectory, "tali-nemoclaw-start");
  const policyFile = join(temporaryDirectory, "openshell-policy.yaml");
  try {
    await writeFile(
      instructionsFile,
      `## TaskLattice Agent Instructions\n\n${input.systemPrompt.trim()}${agentMemoryInstructions(input.memory)}\n`,
      { mode: 0o600 },
    );
    await writeFile(
      bootstrapFile,
      runtime.bootstrapScript(
        openShellWebUiOrigin(input.name),
        nemoClawGatewayPort,
        input.inferenceEndpoint,
        input.model,
        input.memory,
      ),
      { mode: 0o600 },
    );
    await writeFile(
      policyFile,
      composeOpenShellInferencePolicy(
        input.policyYaml ?? "version: 1\n",
        input.inferenceEndpoint,
        input.agentPlatform,
      ),
      { mode: 0o600 },
    );
    observer?.onStage?.("POD", "Creating the OpenShell Sandbox and starting its Kubernetes Pod.");
    return await createOpenShellNemoClawSandbox(
      input,
      instructionsFile,
      bootstrapFile,
      policyFile,
      observer,
    );
  } catch (error) {
    await deleteOpenShellSandbox(input.name).catch(() => undefined);
    await deleteOpenShellProvider(input.name).catch(() => undefined);
    throw error;
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

export async function deleteOpenShellProvider(name: string): Promise<void> {
  const timing = openShellDeletionTiming();
  const deadline = Date.now() + timing.timeoutMs;
  while (true) {
    const result = await runCommand(
      openShellBinary(),
      openShellArguments(["provider", "delete", openShellProviderName(name)]),
    );
    const output = `${result.stdout}\n${result.stderr}`;
    if (result.exitCode === 0 || output.toLowerCase().includes("not found"))
      return;
    if (!isOpenShellProviderAttachedError(output) || Date.now() >= deadline)
      throw new Error(
        result.stderr.trim() || "OpenShell Provider deletion failed.",
      );
    await waitForDeletionPoll(timing.pollMs);
  }
}

export async function observeOpenShellSandbox(
  name: string,
): Promise<OpenShellSandbox | undefined> {
  const result = await runCommand(
    openShellBinary(),
    openShellArguments(["sandbox", "list", "-o", "json"]),
  );
  if (result.exitCode !== 0)
    throw new Error(
      result.stderr.trim() || "Unable to list OpenShell sandboxes.",
    );
  const sandboxes = JSON.parse(result.stdout) as OpenShellSandbox[];
  return sandboxes.find((sandbox) => sandbox.name === name);
}

export async function deleteOpenShellSandbox(name: string): Promise<void> {
  const result = await runCommand(
    openShellBinary(),
    openShellArguments(["sandbox", "delete", name]),
  );
  const output = `${result.stdout}\n${result.stderr}`.toLowerCase();
  if (
    result.exitCode !== 0 &&
    !output.includes("sandbox not found") &&
    !output.includes("not found")
  )
    throw new Error(
      result.stderr.trim() || "OpenShell sandbox deletion failed.",
    );
  const timing = openShellDeletionTiming();
  const deadline = Date.now() + timing.timeoutMs;
  while (await observeOpenShellSandbox(name)) {
    if (Date.now() >= deadline)
      throw new Error(
        `OpenShell sandbox ${name} is still present after the deletion timeout.`,
      );
    await waitForDeletionPoll(timing.pollMs);
  }
}
