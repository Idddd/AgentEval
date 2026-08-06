import { describe, expect, it } from "vitest";
import { createTestStore } from "../test/store";
import { seedAgentCatalogForExistingProjects } from "./seed-agent-catalog";

describe("seedAgentCatalogForExistingProjects", () => {
  it("persists the versioned catalog for every Project idempotently", async () => {
    const project = createTestStore();

    await expect(
      seedAgentCatalogForExistingProjects(project.database()),
    ).resolves.toMatchObject({
      projects: 1,
      records: 16,
    });
    await expect(
      seedAgentCatalogForExistingProjects(project.database()),
    ).resolves.toMatchObject({
      projects: 1,
      records: 0,
    });
    await expect(
      project.database().agentCatalogRecord.count({
        where: { projectId: project.projectId },
      }),
    ).resolves.toBe(16);
  });
});
