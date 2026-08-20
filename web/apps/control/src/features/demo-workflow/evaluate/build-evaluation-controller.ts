import type {
  EvaluationLayerStore,
  TargetRevisionInput,
} from "@/features/evaluation-layer/mock-store";
import type { EvaluationLayerTool } from "@/features/evaluation-layer/model";
import type {
  DemoAgentRevision,
  DemoWorkflowState,
  DemoWorkflowStore,
} from "../model";

export interface DemoEvaluationBridge {
  sync(): void;
  evaluationTargetIdFor(demoRevisionId: string): string | null;
  evaluationTargetRevisionIdFor(demoRevisionId: string): string | null;
  isAdminEvalEligible(evaluationTargetRevisionId: string): boolean;
  submitToAdminEval(evaluationTargetRevisionId: string): void;
}

const MIRRORED_STATUSES = new Set<DemoAgentRevision["status"]>([
  "READY_FOR_VALIDATION",
  "VALIDATING",
  "VALIDATION_FAILED",
  "VALIDATED",
  "RELEASE_CANDIDATE",
  "PENDING_EVAL",
  "BUSINESS_EVALUATING",
  "BUSINESS_EVAL_FAILED",
  "READY_FOR_APPROVAL",
  "PENDING_APPROVAL",
  "REJECTED",
  "APPROVED",
  "PUBLISHED",
]);

function evaluationTools(
  revision: DemoAgentRevision,
  state: DemoWorkflowState,
): EvaluationLayerTool[] {
  const mcpTools = revision.mcpIds.flatMap((id) => {
    const server = state.mcpServers.find((item) => item.id === id);
    return server
      ? [{
          id: `mcp:${server.id}`,
          name: server.name,
          description: server.endpoint,
          connectionType: "http" as const,
          verificationRequired: true,
          enabled: true,
          tags: ["MCP Server", server.authType],
          testRequirements: ["Connection", "Authorization"],
        }]
      : [];
  });
  const skillTools = revision.skillIds.flatMap((id) => {
    const skill = state.skills.find((item) => item.id === id);
    return skill
      ? [{
          id: `skill:${skill.id}`,
          name: skill.name,
          description: skill.description,
          connectionType: "agent" as const,
          verificationRequired: false,
          enabled: true,
          tags: ["Skill"],
          testRequirements: ["Instruction integrity"],
        }]
      : [];
  });
  return [...mcpTools, ...skillTools];
}

function revisionInput(
  revision: DemoAgentRevision,
  state: DemoWorkflowState,
): TargetRevisionInput {
  return {
    model: revision.model,
    adapter: revision.runtimeType,
    endpoint: revision.endpoint,
    tools: evaluationTools(revision, state),
    sources: revision.knowledgeBaseIds.flatMap((id) => {
      const knowledgeBase = state.knowledgeBases.find((item) => item.id === id);
      return knowledgeBase ? [{ id: knowledgeBase.id, name: knowledgeBase.name }] : [];
    }),
  };
}

function sameConfiguration(
  current: {
    model?: string;
    adapter?: string;
    endpoint?: string;
    tools: EvaluationLayerTool[];
    sources?: Array<{ id: string; name: string }>;
  },
  desired: TargetRevisionInput,
) {
  return JSON.stringify({
    model: current.model ?? "",
    adapter: current.adapter ?? "",
    endpoint: current.endpoint ?? "",
    tools: current.tools,
    sources: current.sources ?? [],
  }) === JSON.stringify({
    model: desired.model ?? "",
    adapter: desired.adapter ?? "",
    endpoint: desired.endpoint ?? "",
    tools: desired.tools ?? [],
    sources: desired.sources ?? [],
  });
}

function uniqueTargetName(name: string, evaluationStore: EvaluationLayerStore) {
  const names = new Set(
    evaluationStore.getState().targets.map((target) => target.name.toLowerCase()),
  );
  if (!names.has(name.toLowerCase())) return name;
  const buildName = `${name} · Build`;
  if (!names.has(buildName.toLowerCase())) return buildName;
  let suffix = 2;
  while (names.has(`${buildName} ${suffix}`.toLowerCase())) suffix += 1;
  return `${buildName} ${suffix}`;
}

export function createDemoEvaluationBridge(
  workflowStore: DemoWorkflowStore,
  evaluationStore: EvaluationLayerStore,
): DemoEvaluationBridge {
  const targetIdByAgentId = new Map<string, string>();
  const targetRevisionIdByDemoRevisionId = new Map<string, string>();
  const demoRevisionIdByTargetRevisionId = new Map<string, string>();

  const linkRevision = (demoRevisionId: string, targetRevisionId: string) => {
    const previous = targetRevisionIdByDemoRevisionId.get(demoRevisionId);
    if (previous) demoRevisionIdByTargetRevisionId.delete(previous);
    targetRevisionIdByDemoRevisionId.set(demoRevisionId, targetRevisionId);
    demoRevisionIdByTargetRevisionId.set(targetRevisionId, demoRevisionId);
  };

  const syncTargets = () => {
    const workflowState = workflowStore.getState();
    const revisions = workflowState.agentRevisions
      .filter((revision) => MIRRORED_STATUSES.has(revision.status))
      .sort((left, right) => left.revision - right.revision);

    for (const revision of revisions) {
      const agent = workflowState.agents.find((item) => item.id === revision.agentId);
      if (!agent) continue;
      const desired = revisionInput(revision, workflowState);
      let targetId = targetIdByAgentId.get(agent.id);

      if (!targetId) {
        const created = evaluationStore.createTarget({
          name: uniqueTargetName(agent.name, evaluationStore),
          description: agent.description,
          kind: "agent",
          ...(desired.model !== undefined ? { model: desired.model } : {}),
          ...(desired.adapter !== undefined ? { adapter: desired.adapter } : {}),
          ...(desired.endpoint !== undefined ? { endpoint: desired.endpoint } : {}),
          ...(desired.tools !== undefined ? { tools: desired.tools } : {}),
          ...(desired.sources !== undefined ? { sources: desired.sources } : {}),
        });
        if (!created.ok) continue;
        targetId = created.value.targetId;
        targetIdByAgentId.set(agent.id, targetId);
        const target = evaluationStore.getState().targets.find((item) => item.id === targetId);
        if (target) linkRevision(revision.id, target.currentRevisionId);
        continue;
      }

      const evaluationState = evaluationStore.getState();
      const target = evaluationState.targets.find((item) => item.id === targetId);
      const current = target
        ? evaluationState.targetRevisions.find((item) => item.id === target.currentRevisionId)
        : undefined;
      const linkedRevisionId = targetRevisionIdByDemoRevisionId.get(revision.id);
      if (linkedRevisionId && current && linkedRevisionId === current.id && sameConfiguration(current, desired)) {
        continue;
      }
      if (linkedRevisionId && current && sameConfiguration(
        evaluationState.targetRevisions.find((item) => item.id === linkedRevisionId) ?? current,
        desired,
      )) {
        continue;
      }

      const created = evaluationStore.createTargetRevision(
        targetId,
        desired,
        { name: "Agent Wizard", role: "member" },
      );
      if (created.ok) linkRevision(revision.id, created.value.revisionId);
    }
  };

  const syncRuns = () => {
    for (const [targetRevisionId, demoRevisionId] of demoRevisionIdByTargetRevisionId) {
      const runs = evaluationStore.getState().runs
        .filter((run) => run.targetRevisionId === targetRevisionId)
        .sort((left, right) => right.startedAt.localeCompare(left.startedAt));
      const run = runs[0];
      if (!run) continue;
      let revision = workflowStore.getState().agentRevisions.find((item) => item.id === demoRevisionId);
      if (!revision) continue;
      const active = run.status === "QUEUED" || run.status === "RUNNING";
      const terminal = run.status === "COMPLETED" || run.status === "PARTIAL" || run.status === "FAILED";

      if ((active || terminal) && revision.status === "VALIDATION_FAILED") {
        workflowStore.markReadyForTechnicalValidation(revision.id, "agent-wizard");
        revision = workflowStore.getState().agentRevisions.find((item) => item.id === demoRevisionId)!;
      }
      if ((active || terminal) && revision.status === "READY_FOR_VALIDATION") {
        workflowStore.startTechnicalValidation(revision.id, "agent-wizard");
        revision = workflowStore.getState().agentRevisions.find((item) => item.id === demoRevisionId)!;
      }
      if (terminal && revision.status === "VALIDATING") {
        const passed = run.status === "COMPLETED" && run.results.every((result) => result.status === "PASS");
        workflowStore.completeTechnicalValidation(revision.id, passed ? "PASSED" : "FAILED");
      }
    }
  };

  const syncDecisions = () => {
    const workflowState = workflowStore.getState();
    const evaluationState = evaluationStore.getState();
    for (const [targetRevisionId, demoRevisionId] of demoRevisionIdByTargetRevisionId) {
      const demoRevision = workflowState.agentRevisions.find((item) => item.id === demoRevisionId);
      if (!demoRevision || !["APPROVED", "PUBLISHED", "REJECTED"].includes(demoRevision.status)) {
        continue;
      }
      const latestRun = evaluationState.runs
        .filter((run) => run.targetRevisionId === targetRevisionId)
        .sort((left, right) => right.startedAt.localeCompare(left.startedAt))[0];
      const report = latestRun
        ? evaluationState.reports.find((item) => item.runId === latestRun.id)
        : undefined;
      if (!report || evaluationState.revisionDecisions.some((item) => item.reportId === report.id)) {
        continue;
      }
      evaluationStore.decideRevision(
        report.id,
        demoRevision.status === "REJECTED" ? "REJECTED" : "APPROVED",
        { name: "Local Administrator", role: "admin" },
      );
    }
  };

  return {
    sync() {
      syncDecisions();
      syncTargets();
      syncRuns();
    },
    evaluationTargetIdFor(demoRevisionId) {
      const targetRevisionId = targetRevisionIdByDemoRevisionId.get(demoRevisionId);
      if (!targetRevisionId) return null;
      return evaluationStore.getState().targetRevisions.find((item) => item.id === targetRevisionId)?.targetId ?? null;
    },
    evaluationTargetRevisionIdFor(demoRevisionId) {
      return targetRevisionIdByDemoRevisionId.get(demoRevisionId) ?? null;
    },
    isAdminEvalEligible(evaluationTargetRevisionId) {
      return demoRevisionIdByTargetRevisionId.has(evaluationTargetRevisionId);
    },
    submitToAdminEval(evaluationTargetRevisionId) {
      const demoRevisionId = demoRevisionIdByTargetRevisionId.get(evaluationTargetRevisionId);
      if (!demoRevisionId) throw new Error("This evaluation is not linked to a Build revision");
      workflowStore.submitReleaseCandidate(demoRevisionId, "agent-wizard");
    },
  };
}
