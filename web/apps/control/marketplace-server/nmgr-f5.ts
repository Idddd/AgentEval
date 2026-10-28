import { z } from "zod";
import { isDeepStrictEqual } from "node:util";
import { StoreError } from "./marketplace-db";
import { DeploymentError } from "./diagnostics";
import { scannerBody, scanEvidence, mergeProjectConfig, type F5Remote, type F5ScannerRef } from "./f5-client";
import type { Entity } from "../src/features/nmgr/model";
import type { NmgrBinding, NmgrJob } from "./nmgr";

export type F5Binding = { sourceId: string; scannerId?: string; scannerName?: string; versionId?: string; projectId?: string };
export type F5Case = { input: string; expected: "allow" | "block"; phase: "input" | "output" };
export type F5Work = { name: string; scanner?: ReturnType<typeof scannerBody>; refs: F5ScannerRef[]; cases: F5Case[]; results: ReturnType<typeof scanEvidence>[]; accessIndex: number };
const uuid = z.string().uuid();
const requireMatch = (ok: unknown, message: string) => { if (!ok) throw new DeploymentError("f5", "f5_binding_conflict", message, undefined, 409); };
export function f5Evaluation(e: Entity, cases: F5Case[], sourceId: string, requestId: string) {
  const directions = e.config!.direction === "both" ? ["input", "output"] : [e.config!.direction === "request" ? "input" : "output"];
  if (!cases.length || cases.some(c => !directions.includes(c.phase)) || directions.some(d => !cases.some(c => c.phase === d && c.expected === "block"))) throw new StoreError(422, "F5 evaluation requires a blocking case for every configured direction and cases only in those directions.");
  const name = `mp-${requestId}`;
  return { binding: { f5: { sourceId, scannerName: name } } satisfies NmgrBinding,
    work: { name, scanner: scannerBody(name, e.config!), refs: [], cases, results: [], accessIndex: 0 } satisfies F5Work };
}
async function readScanner(remote: F5Remote, b: F5Binding, e: Entity, published = false) {
  const scanner = (await remote.request(`/scanners/${uuid.parse(b.scannerId)}${b.versionId ? `?version=${uuid.parse(b.versionId)}` : ""}`)).scanner;
  const expected = scannerBody(b.scannerName!, e.config!);
  requireMatch(scanner?.id === b.scannerId && scanner.name === expected.name && scanner.direction === expected.direction &&
    Object.entries(expected.config).every(([key, value]) => isDeepStrictEqual(scanner.config?.[key], value)), "F5 Scanner content changed or does not match this evaluation.");
  const versionId = uuid.parse(scanner.versionMeta?.id);
  requireMatch((!b.versionId || b.versionId === versionId) && scanner.versionMeta.name === expected.version.name && (!published || scanner.versionMeta.published === true), "F5 Scanner version is missing, changed or not published.");
  return { scanner, versionId };
}
function matchingProject(project: any, id: string, work: F5Work) {
  requireMatch(project?.id === id && project.name === work.name && project.friendlyId === work.name && project.type === "app" && project.config && typeof project.config === "object", "F5 Project identity does not match this operation.");
}
function matchingRefs(project: any, refs: F5ScannerRef[]) {
  requireMatch(Array.isArray(project.config?.scanners) && refs.every(ref => {
    const rows = project.config.scanners.filter((r: any) => r.id === ref.id);
    return rows.length === 1 && Object.entries(ref).every(([key, value]) => rows[0][key] === value);
  }), "F5 Project did not retain the exact approved Scanner versions and settings.");
}

// One durable phase per call. All mutation attempts are journaled by NmgrService
// before this function runs; a missing create response is never blindly retried.
export async function f5Step(e: Entity, binding: NmgrBinding, job: NmgrJob, remote: F5Remote, recovering: boolean, remoteId?: string): Promise<"released" | void> {
  const b = binding.f5!;
  requireMatch(b.sourceId === remote.sourceId, "F5 source instance changed. Restore the original F5 address before continuing.");
  const work = job.f5!;
  const move = (phase: string) => { job.phase = phase; };
  if (job.phase === "f5-scanner-create") {
    if (recovering) {
      requireMatch(remoteId, "F5 create outcome is unknown. Supply the exact remote Scanner ID from F5 to reconcile; no create will be repeated.");
      const candidate = { ...b, scannerId: uuid.parse(remoteId) };
      const result = await readScanner(remote, candidate, e);
      b.scannerId = candidate.scannerId; b.versionId = result.versionId;
    } else b.scannerId = uuid.parse((await remote.request("/scanners", "POST", work.scanner)).id);
    move("f5-scanner-read");
  } else if (job.phase === "f5-scanner-read") {
    const { versionId } = await readScanner(remote, b, e); b.versionId = versionId;
    work.refs = [{ id: b.scannerId!, version: versionId, direction: e.config!.direction, enabled: true, blocking: true, mode: "block" }];
    move("f5-project-create");
  } else if (job.phase === "f5-project-create") {
    if (recovering) {
      requireMatch(remoteId, "F5 create outcome is unknown. Supply the exact remote Project ID from F5 to reconcile; no create will be repeated.");
      const id = uuid.parse(remoteId), project = (await remote.request(`/projects/${id}`)).project;
      matchingProject(project, id, work); b.projectId = id;
    } else {
      b.projectId = uuid.parse((await remote.request("/projects", "POST", { name: work.name, friendlyId: work.name, type: "app", deploymentStatus: "draft", config: { scanners: [], providers: [], packages: [] }, ...(remote.adminIds.length ? { adminIds: remote.adminIds } : {}) })).id);
    }
    move("f5-project-access");
  } else if (job.phase === "f5-project-access") {
    const projectId = uuid.parse(b.projectId);
    const project = (await remote.request(`/projects/${projectId}`)).project; matchingProject(project, projectId, work);
    const ref = work.refs[work.accessIndex];
    if (!ref) { move("f5-project-bind"); return; }
    const scanner = (await remote.request(`/scanners/${uuid.parse(ref.id)}?version=${uuid.parse(ref.version)}`)).scanner;
    requireMatch(scanner?.id === ref.id && scanner.versionMeta?.id === ref.version && (!work.cases.length ? scanner.versionMeta.published === true : true), "Referenced F5 Scanner version is unavailable.");
    const availability = z.object({ global: z.boolean(), projectIds: z.array(z.string()) }).parse(scanner.availability);
    if (!availability.global && !availability.projectIds.includes(projectId)) {
      await remote.request(`/scanners/${ref.id}/access`, "PATCH", { global: false, projectIds: [...availability.projectIds, projectId] });
      const verified = (await remote.request(`/scanners/${ref.id}`)).scanner;
      requireMatch(verified?.availability?.global === false && [...availability.projectIds, projectId].every(id => verified.availability.projectIds?.includes(id)), "F5 Scanner access scope was not retained.");
    }
    work.accessIndex++;
  } else if (job.phase === "f5-project-bind") {
    const projectId = uuid.parse(b.projectId), project = (await remote.request(`/projects/${projectId}`)).project;
    matchingProject(project, projectId, work);
    // Patch only supported config; keep providers, packages and unrelated settings.
    await remote.request(`/projects/${projectId}`, "PATCH", { config: mergeProjectConfig(project.config, work.refs) });
    move("f5-project-read");
  } else if (job.phase === "f5-project-read") {
    const projectId = uuid.parse(b.projectId), project = (await remote.request(`/projects/${projectId}`)).project;
    matchingProject(project, projectId, work); matchingRefs(project, work.refs);
    if (!work.cases.length) return "released";
    move("f5-scan");
  } else if (job.phase === "f5-scan") {
    const index = work.results.length, test = work.cases[index]!;
    const project = (await remote.request(`/projects/${uuid.parse(b.projectId)}`)).project;
    matchingProject(project, b.projectId!, work); matchingRefs(project, work.refs);
    const result = await remote.request("/scans", "POST", { input: test.input, project: b.projectId, scanDirection: test.phase === "input" ? "request" : "response", verbose: true, flagOnly: false });
    work.results.push(scanEvidence(result, b.scannerId!, b.versionId!, test.phase, test.expected, `case-${index + 1}`));
    if (work.results.length === work.cases.length) {
      const passed = work.results.every(r => r.passed), end = new Date().toISOString();
      e.runs = [{ id: work.name, version: e.version, configurationRevision: e.configurationRevision ?? 0, base: e.deployed, dataset: job.dataset!, passed, start: job.started, end, cases: work.results.length, tester: "IT Admin", evidence: { source: "F5", status: passed ? "passed" : "failed", results: work.results, failureReason: null } }, ...e.runs];
      e.status = passed ? "TEST PASSED" : "TEST FAILED"; job.status = "done";
    }
  } else if (job.phase === "f5-scanner-publish") {
    const { scanner } = await readScanner(remote, b, e);
    if (!scanner.versionMeta.published) await remote.request(`/scanners/${b.scannerId}/versions/${b.versionId}`, "PATCH", { published: true, push: false });
    move("f5-scanner-published");
  } else if (job.phase === "f5-scanner-published") {
    await readScanner(remote, b, e, true); binding.publishedVersion = b.versionId!; return "released";
  } else throw new StoreError(409, "Unknown F5 operation phase.");
}
