import type { PrismaClient } from "../generated/prisma/client";
import { AgentGardenStore } from "./agent-garden-store";
import { databaseAgentCatalog } from "./database-agent-catalog";

export interface AgentCatalogSeedResult {
  projects: number;
  records: number;
}

export async function seedAgentCatalogForExistingProjects(
  database: PrismaClient,
): Promise<AgentCatalogSeedResult> {
  const projects = await database.project.findMany({
    where: { deletedAt: null },
    select: { id: true },
    orderBy: { id: "asc" },
  });
  let records = 0;

  for (const project of projects) {
    records += await new AgentGardenStore(
      project.id,
      database,
    ).ensureAgents(databaseAgentCatalog);
  }

  return {
    projects: projects.length,
    records,
  };
}
