import { createHash } from "node:crypto";
import type { NmgrPersistence } from "./nmgr";

type StoredRun = {
  id: string;
  status: "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";
  createdAt: string;
  target: string;
  targetName: string;
  targetVersion: number;
  configRevision: string;
};

const digest = (parts: string[]) => createHash("sha256").update(JSON.stringify(parts)).digest("hex");

export class EvaluationRunHistory {
  private readonly scope: string;
  constructor(private readonly db: NmgrPersistence, workspace: string, guardrail: string, version: number, base: string, project: string) {
    this.scope = digest([workspace, guardrail, String(version), base, project]);
  }
  private get index() { return "eval-history:" + this.scope; }
  private key(id: string) { return "eval-run:" + digest([this.scope, id]); }
  async recent() { return (await this.db.readDocument<StoredRun[]>(this.index)) ?? []; }
  find(id: string) { return this.db.readDocument<StoredRun>(this.key(id)); }
  async remember(run: StoredRun) {
    await this.db.exclusive(async () => {
      const entries = await this.recent();
      const existing = await this.find(run.id);
      // A late poll or replayed submission must not roll a terminal result back to RUNNING.
      const latest = existing && existing.status !== "RUNNING" ? existing : run;
      if (!existing || existing.status !== latest.status) await this.db.writeDocument(this.key(run.id), latest);
      const recent = [latest, ...entries.filter(item => item.id !== run.id)]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 12);
      await this.db.writeDocument(this.index, recent);
    });
  }
}
