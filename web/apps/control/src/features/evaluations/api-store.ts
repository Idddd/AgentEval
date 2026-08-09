import {
  createEvaluationStore,
  type EvaluationStore,
  type EvaluationStoreDependencies,
} from "./mock-store";
import { cloneEvaluationFixtures } from "./fixture-validation";
import type { EvaluationState } from "./model";

const DEFAULT_BASE_URL = "/api/v1/evaluations";

async function apiFetch(baseUrl: string, path: string, init?: RequestInit) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!response.ok && response.status !== 501) {
    throw new Error(`API ${response.status}`);
  }
  return response.status === 501 ? null : ((await response.json()) as unknown);
}

export function createApiEvaluationStore(options: {
  baseUrl?: string;
  fixtures?: () => EvaluationState;
  deps?: Partial<EvaluationStoreDependencies>;
}): EvaluationStore {
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
  const fixtureSource = options.fixtures ?? cloneEvaluationFixtures;
  const local = createEvaluationStore(fixtureSource(), options.deps);

  void apiFetch(baseUrl, "/state")
    .then((payload) => {
      if (payload && typeof payload === "object") {
        local.replaceState(() => payload as EvaluationState);
      }
    })
    .catch(() => {
      // DEMO: keep local fixtures
    });

  const applyServerRecord = (kind: keyof EvaluationState, payload: unknown) => {
    if (!payload || typeof payload !== "object") return;
    const record = payload as { id?: string };
    if (!record.id) return;
    local.replaceState((current) => {
      const list = current[kind] as Array<{ id: string }>;
      const exists = list.some((item) => item.id === record.id);
      const next = exists
        ? list.map((item) => (item.id === record.id ? { ...item, ...record } : item))
        : [...list, record];
      return { ...current, [kind]: next } as EvaluationState;
    });
  };

  const mirror = (
    path: string,
    body: unknown,
    options: { method?: string; kind?: keyof EvaluationState } = {},
  ) => {
    void apiFetch(baseUrl, path, {
      method: options.method ?? "POST",
      body: JSON.stringify(body),
    })
      .then((payload) => {
        if (options.kind) applyServerRecord(options.kind, payload);
      })
      .catch(() => {
        // DEMO: keep local result
      });
  };

  return {
    ...local,
    createTarget(input) {
      const result = local.createTarget(input);
      if (result.ok) {
        const revisionId = local
          .getState()
          .targetRevisions.find((item) => item.targetId === result.value.id)?.id;
        mirror(
          "/targets",
          {
            id: result.value.id,
            revisionId,
            name: result.value.name,
            description: result.value.description,
            model: input.model,
            systemPrompt: input.systemPrompt,
          },
          { kind: "targets" },
        );
      }
      return result;
    },
    createTargetRevision(targetId, patch) {
      const result = local.createTargetRevision(targetId, patch);
      if (result.ok) {
        mirror(
          `/targets/${targetId}/revisions`,
          { id: result.value.id, ...patch },
          { kind: "targetRevisions" },
        );
      }
      return result;
    },
    createDataset(input) {
      const result = local.createDataset(input);
      if (result.ok) {
        mirror("/datasets", { id: result.value.id, ...input }, { kind: "datasets" });
      }
      return result;
    },
    updateDatasetDraft(datasetId, patch) {
      const result = local.updateDatasetDraft(datasetId, patch);
      if (result.ok) {
        mirror(
          `/datasets/${datasetId}`,
          { ...patch, draftCases: patch.draftCases ?? undefined },
          { kind: "datasets" },
        );
      }
      return result;
    },
    publishDatasetRevision(datasetId) {
      const result = local.publishDatasetRevision(datasetId);
      if (result.ok) {
        mirror(
          `/datasets/${datasetId}/publish`,
          { id: result.value.id },
          { kind: "datasetRevisions" },
        );
      }
      return result;
    },
    createCase(datasetId, input) {
      const result = local.createCase(datasetId, input);
      if (result.ok) {
        mirror(`/datasets/${datasetId}/cases`, {
          id: result.value.id,
          ...input,
        });
      }
      return result;
    },
    updateCase(datasetId, caseId, input) {
      const result = local.updateCase(datasetId, caseId, input);
      if (result.ok) {
        mirror(`/datasets/${datasetId}/cases/${caseId}`, input);
      }
      return result;
    },
    duplicateCase(datasetId, caseId) {
      const result = local.duplicateCase(datasetId, caseId);
      if (result.ok) {
        mirror(`/datasets/${datasetId}/cases/${caseId}/duplicate`, {});
      }
      return result;
    },
    deleteCase(datasetId, caseId) {
      const result = local.deleteCase(datasetId, caseId);
      if (result.ok) {
        mirror(`/datasets/${datasetId}/cases/${caseId}`, {}, { method: "DELETE" });
      }
      return result;
    },
    importCases(datasetId, json) {
      const result = local.importCases(datasetId, json);
      if (result.ok) {
        mirror(`/datasets/${datasetId}/import`, { cases: result.value });
      }
      return result;
    },
    generateCases(datasetId) {
      const result = local.generateCases(datasetId);
      if (result.ok) {
        mirror(`/datasets/${datasetId}/generate`, {
          count: result.value.length,
        });
      }
      return result;
    },
    createRun(input) {
      const result = local.createRun(input);
      if (result.ok) {
        mirror(
          "/runs",
          {
            id: result.value.id,
            targetRevisionId: input.targetRevisionId,
            datasetRevisionId: input.datasetRevisionId,
          },
          { kind: "runs" },
        );
      }
      return result;
    },
    advanceRun(runId) {
      const result = local.advanceRun(runId);
      if (result.ok) {
        void apiFetch(baseUrl, `/runs/${runId}/advance`, {
          method: "POST",
          body: JSON.stringify({}),
        })
          .then((payload) => {
            applyServerRecord("runs", payload);
            const serverRun = payload as {
              id?: string;
              results?: Array<{ status: string }>;
              reportId?: string;
            };
            const localRun = local.getState().runs.find((item) => item.id === runId);
            if (
              serverRun?.id &&
              serverRun.results?.length &&
              !serverRun.reportId &&
              localRun?.reportId
            ) {
              void apiFetch(baseUrl, "/reports", {
                method: "POST",
                body: JSON.stringify({ id: localRun.reportId, runId }),
              }).then((reportPayload) => applyServerRecord("reports", reportPayload));
            }
          })
          .catch(() => {
            // DEMO: keep local run result
          });
      }
      return result;
    },
    createReport(runId) {
      const result = local.createReport(runId);
      if (result.ok) {
        mirror("/reports", { id: result.value.id, runId }, { kind: "reports" });
      }
      return result;
    },
    submitReflection(reportId, suggestionIds) {
      return local.submitReflection(reportId, suggestionIds);
    },
    finishReflectionWithoutChanges(reportId) {
      return local.finishReflectionWithoutChanges(reportId);
    },
  };
}
