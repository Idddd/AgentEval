import type {
  TraceDetail,
  TraceScore,
  TraceSpan,
  TraceStatus,
  TraceSummary,
} from "@tasklattice/contracts";
import type { TraceRepository } from "./trace-repository";

interface TraceFixture {
  traceId: string;
  flowId?: string;
  title: string;
  rootAgentName: string;
  occurredAgoMs: number;
  coveragePercent: number;
  scores: TraceScore[];
  spans: TraceSpan[];
}

const successFixture: TraceFixture = {
  traceId: "6e7f1c9a4c824b1aa7a5e68a0b134101",
  flowId: "flow-access-1042",
  title: "Resolve workspace access issue",
  rootAgentName: "Support Coordinator",
  occurredAgoMs: 4 * 60_000,
  coveragePercent: 100,
  scores: [
    { name: "Accuracy", value: true, source: "evaluator" },
    { name: "Policy", value: true, source: "evaluator" },
    { name: "Resolution", value: 0.94, source: "evaluator" },
  ],
  spans: [
    {
      spanId: "span-root-success",
      name: "Resolve workspace access issue",
      type: "workflow",
      serviceName: "tasklattice-control",
      agentName: "Support Coordinator",
      startOffsetMs: 0,
      durationMs: 4820,
      status: "ok",
      input: {
        channel: "in_app",
        request: "I cannot access the security workspace after changing teams.",
        locale: "en-AU",
      },
      output: {
        resolution: "Workspace membership refreshed and access restored.",
        escalated: false,
      },
      attributes: {
        "gen_ai.operation.name": "invoke_workflow",
        "gen_ai.workflow.name": "workspace_access_resolution",
        "tasklattice.flow.id": "flow-access-1042",
        "tasklattice.environment": "demo",
      },
    },
    {
      spanId: "span-coordinator",
      parentSpanId: "span-root-success",
      name: "Support Coordinator",
      type: "agent",
      serviceName: "support-coordinator",
      agentName: "Support Coordinator",
      startOffsetMs: 90,
      durationMs: 4480,
      status: "ok",
      input: { intent: "workspace_access", confidence: 0.97 },
      output: { nextAction: "deliver_resolution", verified: true },
      attributes: {
        "gen_ai.operation.name": "invoke_agent",
        "gen_ai.agent.id": "agent-support-coordinator",
        "gen_ai.agent.name": "Support Coordinator",
      },
    },
    {
      spanId: "span-analyze",
      parentSpanId: "span-coordinator",
      name: "Analyze request",
      type: "generation",
      serviceName: "model-gateway",
      startOffsetMs: 180,
      durationMs: 1040,
      status: "ok",
      model: "gpt-5.2",
      tokenUsage: { input: 684, output: 172 },
      costUsd: 0.0124,
      input: {
        prompt: "Classify the support request and select the safest resolution path.",
        contextItems: 4,
      },
      output: {
        intent: "workspace_access",
        plan: ["verify identity", "inspect memberships", "refresh entitlement"],
      },
      attributes: {
        "gen_ai.operation.name": "chat",
        "gen_ai.provider.name": "openai",
        "gen_ai.request.model": "gpt-5.2",
      },
    },
    {
      spanId: "span-research-agent",
      parentSpanId: "span-coordinator",
      name: "Access Research Agent",
      type: "agent",
      serviceName: "access-research-agent",
      agentName: "Access Research Agent",
      startOffsetMs: 1290,
      durationMs: 2620,
      status: "ok",
      input: { userReference: "usr_04K2", workspace: "security-team" },
      output: { mismatchFound: true, remediation: "refresh_membership" },
      attributes: {
        "gen_ai.operation.name": "invoke_agent",
        "gen_ai.agent.id": "agent-access-research",
        "a2a.context.id": "a2a-context-8491",
        "a2a.task.id": "a2a-task-1208",
      },
    },
    {
      spanId: "span-user-context",
      parentSpanId: "span-research-agent",
      name: "identity.get_user_context",
      type: "mcp",
      serviceName: "identity-mcp",
      startOffsetMs: 1430,
      durationMs: 620,
      status: "ok",
      input: { userReference: "usr_04K2" },
      output: { activeTeam: "security", previousTeam: "growth" },
      attributes: {
        "gen_ai.operation.name": "execute_tool",
        "gen_ai.tool.name": "identity.get_user_context",
        "rpc.system": "mcp",
      },
    },
    {
      spanId: "span-entitlements",
      parentSpanId: "span-research-agent",
      name: "NeoCloud entitlement lookup",
      type: "external",
      serviceName: "neocloud-entitlements",
      startOffsetMs: 1680,
      durationMs: 1180,
      status: "ok",
      input: { workspace: "security-team", subject: "usr_04K2" },
      output: { role: "viewer", membershipState: "stale" },
      attributes: {
        "http.request.method": "GET",
        "server.address": "entitlements.neocloud.internal",
        "http.response.status_code": 200,
      },
    },
    {
      spanId: "span-refresh",
      parentSpanId: "span-research-agent",
      name: "Refresh workspace membership",
      type: "tool",
      serviceName: "neocloud-entitlements",
      startOffsetMs: 2920,
      durationMs: 710,
      status: "ok",
      input: { subject: "usr_04K2", workspace: "security-team" },
      output: { membershipState: "active", revision: 18 },
      attributes: {
        "gen_ai.operation.name": "execute_tool",
        "gen_ai.tool.name": "workspace.refresh_membership",
      },
      events: [
        {
          name: "membership.updated",
          offsetMs: 653,
          severity: "info",
          attributes: { revision: 18 },
        },
      ],
    },
    {
      spanId: "span-policy",
      parentSpanId: "span-coordinator",
      name: "Verify response policy",
      type: "guardrail",
      serviceName: "runtime-policy",
      startOffsetMs: 3950,
      durationMs: 210,
      status: "ok",
      input: { policy: "support-safe-response-v4" },
      output: { allowed: true, findings: [] },
      attributes: {
        "tasklattice.policy.name": "support-safe-response-v4",
        "tasklattice.policy.decision": "allow",
      },
    },
    {
      spanId: "span-final",
      parentSpanId: "span-coordinator",
      name: "Draft final response",
      type: "generation",
      serviceName: "model-gateway",
      startOffsetMs: 4190,
      durationMs: 350,
      status: "ok",
      model: "gpt-5.2-mini",
      tokenUsage: { input: 412, output: 138 },
      costUsd: 0.0048,
      input: { resolution: "membership_refreshed", tone: "concise" },
      output: {
        response: "Your workspace membership was out of date. It has now been refreshed, and access is restored.",
      },
      attributes: {
        "gen_ai.operation.name": "chat",
        "gen_ai.provider.name": "openai",
        "gen_ai.request.model": "gpt-5.2-mini",
      },
    },
    {
      spanId: "span-delivery",
      parentSpanId: "span-root-success",
      name: "Deliver response",
      type: "external",
      serviceName: "support-channel",
      startOffsetMs: 4590,
      durationMs: 180,
      status: "ok",
      input: { channel: "in_app" },
      output: { delivered: true },
      attributes: {
        "messaging.system": "tasklattice.support",
        "messaging.operation.name": "send",
      },
    },
  ],
};

const errorFixture: TraceFixture = {
  traceId: "903fca7d2c204964bd1af2107062fdb4",
  flowId: "flow-refund-7714",
  title: "Process enterprise refund request",
  rootAgentName: "Billing Agent",
  occurredAgoMs: 17 * 60_000,
  coveragePercent: 92,
  scores: [
    { name: "Accuracy", value: false, source: "evaluator" },
    { name: "Compliance", value: true, source: "evaluator" },
    { name: "Escalation", value: true, source: "human" },
  ],
  spans: [
    {
      spanId: "span-root-error",
      name: "Process enterprise refund request",
      type: "workflow",
      serviceName: "billing-orchestrator",
      agentName: "Billing Agent",
      startOffsetMs: 0,
      durationMs: 8420,
      status: "error",
      input: { invoiceId: "INV-88214", reason: "duplicate_charge" },
      output: { resolution: "escalated", retryable: true },
      attributes: {
        "gen_ai.operation.name": "invoke_workflow",
        "tasklattice.flow.id": "flow-refund-7714",
      },
      events: [
        {
          name: "exception",
          offsetMs: 8100,
          severity: "error",
          attributes: {
            "exception.type": "UpstreamUnavailable",
            "exception.message": "NeoCloud billing returned 502 after retry.",
          },
        },
      ],
    },
    {
      spanId: "span-billing-agent",
      parentSpanId: "span-root-error",
      name: "Billing Agent",
      type: "agent",
      serviceName: "billing-agent",
      agentName: "Billing Agent",
      startOffsetMs: 110,
      durationMs: 8080,
      status: "error",
      input: { invoiceId: "INV-88214" },
      output: { decision: "escalate_to_human" },
      attributes: {
        "gen_ai.operation.name": "invoke_agent",
        "gen_ai.agent.id": "agent-billing",
      },
    },
    {
      spanId: "span-refund-plan",
      parentSpanId: "span-billing-agent",
      name: "Plan refund resolution",
      type: "generation",
      serviceName: "model-gateway",
      startOffsetMs: 240,
      durationMs: 1320,
      status: "ok",
      model: "claude-sonnet-4.5",
      tokenUsage: { input: 944, output: 264 },
      costUsd: 0.019,
      input: { issue: "duplicate_charge", customerTier: "enterprise" },
      output: { tools: ["billing.get_invoice", "billing.issue_refund"] },
      attributes: {
        "gen_ai.operation.name": "chat",
        "gen_ai.provider.name": "anthropic",
      },
    },
    {
      spanId: "span-invoice",
      parentSpanId: "span-billing-agent",
      name: "billing.get_invoice",
      type: "mcp",
      serviceName: "billing-mcp",
      startOffsetMs: 1650,
      durationMs: 820,
      status: "ok",
      input: { invoiceId: "INV-88214" },
      output: { amount: 249, currency: "USD", duplicate: true },
      attributes: {
        "gen_ai.operation.name": "execute_tool",
        "gen_ai.tool.name": "billing.get_invoice",
      },
    },
    {
      spanId: "span-refund-api-first",
      parentSpanId: "span-billing-agent",
      name: "NeoCloud issue refund",
      type: "external",
      serviceName: "neocloud-billing",
      startOffsetMs: 2580,
      durationMs: 2250,
      status: "error",
      input: { invoiceId: "INV-88214", amount: 249 },
      output: { status: 502, message: "Upstream temporarily unavailable" },
      attributes: {
        "http.request.method": "POST",
        "server.address": "billing.neocloud.internal",
        "http.response.status_code": 502,
        "error.type": "502",
      },
      events: [
        {
          name: "retry.scheduled",
          offsetMs: 2240,
          severity: "warning",
          attributes: { delayMs: 1000, attempt: 2 },
        },
      ],
    },
    {
      spanId: "span-refund-api-retry",
      parentSpanId: "span-billing-agent",
      name: "NeoCloud issue refund · retry 2",
      type: "external",
      serviceName: "neocloud-billing",
      startOffsetMs: 5880,
      durationMs: 2030,
      status: "error",
      input: { invoiceId: "INV-88214", amount: 249, attempt: 2 },
      output: { status: 502, message: "Upstream temporarily unavailable" },
      attributes: {
        "http.request.method": "POST",
        "server.address": "billing.neocloud.internal",
        "http.response.status_code": 502,
        "error.type": "502",
      },
    },
    {
      spanId: "span-escalation",
      parentSpanId: "span-billing-agent",
      name: "Create support escalation",
      type: "tool",
      serviceName: "support-case-service",
      startOffsetMs: 7940,
      durationMs: 210,
      status: "ok",
      input: { reason: "refund_provider_unavailable", priority: "high" },
      output: { caseId: "CASE-11842", queue: "billing-urgent" },
      attributes: {
        "gen_ai.operation.name": "execute_tool",
        "gen_ai.tool.name": "support.create_case",
      },
    },
  ],
};

const asyncFixture: TraceFixture = {
  traceId: "b2884545403a40b3a9c5d6be1c68068f",
  flowId: "flow-risk-2094",
  title: "Review supplier onboarding",
  rootAgentName: "Risk Coordinator",
  occurredAgoMs: 31 * 60_000,
  coveragePercent: 76,
  scores: [
    { name: "Evidence", value: 0.88, source: "evaluator" },
    { name: "Risk policy", value: true, source: "evaluator" },
  ],
  spans: [
    {
      spanId: "span-root-async",
      name: "Review supplier onboarding",
      type: "workflow",
      serviceName: "risk-orchestrator",
      agentName: "Risk Coordinator",
      startOffsetMs: 0,
      durationMs: 6240,
      status: "ok",
      input: { supplierId: "SUP-2094", region: "APAC" },
      output: { taskId: "a2a-task-7730", state: "waiting_for_callback" },
      attributes: {
        "gen_ai.operation.name": "invoke_workflow",
        "tasklattice.flow.id": "flow-risk-2094",
        "a2a.context.id": "a2a-context-risk-2094",
      },
    },
    {
      spanId: "span-risk-agent",
      parentSpanId: "span-root-async",
      name: "Risk Coordinator",
      type: "agent",
      serviceName: "risk-coordinator",
      agentName: "Risk Coordinator",
      startOffsetMs: 100,
      durationMs: 5920,
      status: "ok",
      input: { supplierId: "SUP-2094" },
      output: { action: "await_compliance_agent" },
      attributes: {
        "gen_ai.operation.name": "invoke_agent",
        "gen_ai.agent.id": "agent-risk-coordinator",
      },
    },
    {
      spanId: "span-retrieve-policy",
      parentSpanId: "span-risk-agent",
      name: "Retrieve regional policy",
      type: "retriever",
      serviceName: "policy-knowledge-base",
      startOffsetMs: 240,
      durationMs: 890,
      status: "ok",
      input: { query: "APAC supplier onboarding requirements" },
      output: { documents: 6, topScore: 0.93 },
      attributes: {
        "gen_ai.operation.name": "retrieval",
        "gen_ai.data_source.id": "kb-risk-policies",
      },
    },
    {
      spanId: "span-a2a-send",
      parentSpanId: "span-risk-agent",
      name: "Send task to Compliance Agent",
      type: "agent",
      serviceName: "compliance-agent.remote",
      agentName: "Compliance Agent",
      startOffsetMs: 1280,
      durationMs: 3420,
      status: "ok",
      input: { supplierId: "SUP-2094", task: "verify_documents" },
      output: { taskId: "a2a-task-7730", state: "working" },
      attributes: {
        "gen_ai.operation.name": "invoke_agent",
        "a2a.context.id": "a2a-context-risk-2094",
        "a2a.task.id": "a2a-task-7730",
        "tasklattice.telemetry.coverage": "boundary-only",
      },
      links: [
        {
          traceId: "c638d03ad8874ee288d0eb30af019bb2",
          spanId: "span-compliance-remote-root",
          relationship: "remote_async_execution",
        },
      ],
      events: [
        {
          name: "telemetry.coverage.partial",
          offsetMs: 50,
          severity: "warning",
          attributes: { reason: "Remote agent exports to another backend" },
        },
      ],
    },
    {
      spanId: "span-callback",
      parentSpanId: "span-risk-agent",
      name: "Register completion callback",
      type: "external",
      serviceName: "a2a-gateway",
      startOffsetMs: 4850,
      durationMs: 710,
      status: "ok",
      input: { taskId: "a2a-task-7730" },
      output: { callbackRegistered: true, expiresIn: "30m" },
      attributes: {
        "http.request.method": "POST",
        "server.address": "a2a-gateway.tasklattice.internal",
        "http.response.status_code": 202,
      },
    },
  ],
};

const fixtures = [successFixture, errorFixture, asyncFixture] as const;

function summarize(fixture: TraceFixture, startTime: string): TraceSummary {
  const root = fixture.spans.find((span) => !span.parentSpanId) ?? fixture.spans[0]!;
  const agents = new Set(
    fixture.spans
      .filter((span) => span.type === "agent")
      .map((span) => span.agentName ?? span.serviceName),
  );
  const tokenUsage = fixture.spans.reduce(
    (sum, span) => ({
      input: sum.input + (span.tokenUsage?.input ?? 0),
      output: sum.output + (span.tokenUsage?.output ?? 0),
    }),
    { input: 0, output: 0 },
  );
  return {
    traceId: fixture.traceId,
    ...(fixture.flowId ? { flowId: fixture.flowId } : {}),
    title: fixture.title,
    rootAgentName: fixture.rootAgentName,
    startTime,
    durationMs: root.durationMs,
    status: root.status,
    spanCount: fixture.spans.length,
    agentCount: agents.size,
    inputTokens: tokenUsage.input,
    outputTokens: tokenUsage.output,
    costUsd: fixture.spans.reduce((sum, span) => sum + (span.costUsd ?? 0), 0),
    coveragePercent: fixture.coveragePercent,
    scores: fixture.scores,
  };
}

function materialize(fixture: TraceFixture, now: number): TraceDetail {
  const startTime = new Date(now - fixture.occurredAgoMs).toISOString();
  return {
    ...summarize(fixture, startTime),
    source: "fixture",
    spans: fixture.spans,
  };
}

export class FixtureTraceRepository implements TraceRepository {
  constructor(private readonly now: () => number = Date.now) {}

  async list(): Promise<TraceSummary[]> {
    const now = this.now();
    return fixtures.map((fixture) =>
      summarize(fixture, new Date(now - fixture.occurredAgoMs).toISOString()),
    );
  }

  async getById(traceId: string): Promise<TraceDetail | undefined> {
    const fixture = fixtures.find((candidate) => candidate.traceId === traceId);
    return fixture ? materialize(fixture, this.now()) : undefined;
  }
}

export function traceStatusFromSpans(spans: readonly TraceSpan[]): TraceStatus {
  if (spans.some((span) => span.status === "error")) return "error";
  if (spans.some((span) => span.status === "running")) return "running";
  return "ok";
}
