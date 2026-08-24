import {
  agentConnectionSchema,
  agentGardenEntrySchema,
  type AgentConnection,
  type AgentGardenEntry,
} from "@tasklattice/contracts";
import { prisma } from "../db/prisma";
import type { Prisma, PrismaClient } from "../generated/prisma/client";

function jsonInput(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export class AgentGardenStore {
  constructor(
    readonly projectId = "individual",
    private readonly db: PrismaClient = prisma(),
  ) {}

  database(): PrismaClient {
    return this.db;
  }

  async saveAgent(agent: AgentGardenEntry): Promise<AgentGardenEntry> {
    const parsed = agentGardenEntrySchema.parse(agent);
    await this.db.agentCatalogRecord.upsert({
      where: {
        projectId_id: {
          projectId: this.projectId,
          id: parsed.id,
        },
      },
      create: {
        projectId: this.projectId,
        id: parsed.id,
        payload: jsonInput(parsed),
        createdAt: parsed.createdAt ? new Date(parsed.createdAt) : new Date(),
        updatedAt: parsed.updatedAt ? new Date(parsed.updatedAt) : new Date(),
      },
      update: {
        payload: jsonInput(parsed),
        updatedAt: parsed.updatedAt ? new Date(parsed.updatedAt) : new Date(),
      },
    });
    return parsed;
  }

  async ensureAgents(agents: AgentGardenEntry[]): Promise<number> {
    if (!agents.length) return 0;
    const rows = await this.db.agentCatalogRecord.findMany({
      where: {
        projectId: this.projectId,
        id: { in: agents.map((agent) => agent.id) },
      },
      select: { id: true, payload: true },
    });
    const existing = new Map(
      rows.map((row) => [
        row.id,
        agentGardenEntrySchema.parse(row.payload),
      ]),
    );
    let saved = 0;
    for (const agent of agents) {
      const current = existing.get(agent.id);
      if (
        current?.configuration.catalogVersion ===
        agent.configuration.catalogVersion
      ) {
        continue;
      }
      await this.saveAgent(agent);
      saved += 1;
    }
    return saved;
  }

  async getAgent(id: string): Promise<AgentGardenEntry | undefined> {
    const row = await this.db.agentCatalogRecord.findUnique({
      where: {
        projectId_id: {
          projectId: this.projectId,
          id,
        },
      },
      select: { payload: true },
    });
    return row ? agentGardenEntrySchema.parse(row.payload) : undefined;
  }

  async listAgents(): Promise<AgentGardenEntry[]> {
    const rows = await this.db.agentCatalogRecord.findMany({
      where: { projectId: this.projectId },
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      select: { payload: true },
    });
    return rows.map((row) => agentGardenEntrySchema.parse(row.payload));
  }

  async deleteAgent(id: string): Promise<boolean> {
    const result = await this.db.agentCatalogRecord.deleteMany({
      where: { projectId: this.projectId, id },
    });
    return result.count > 0;
  }

  async saveConnection(
    connection: AgentConnection,
  ): Promise<AgentConnection> {
    const parsed = agentConnectionSchema.parse(connection);
    await this.db.agentConnectionRecord.create({
      data: {
        projectId: this.projectId,
        id: parsed.id,
        coordinatorInstanceId: parsed.coordinatorInstanceId,
        connectedAgentId: parsed.connectedAgentId,
        payload: jsonInput(parsed),
        createdAt: new Date(parsed.createdAt),
        updatedAt: new Date(parsed.updatedAt),
      },
    });
    return parsed;
  }

  async listConnections(): Promise<AgentConnection[]> {
    const rows = await this.db.agentConnectionRecord.findMany({
      where: { projectId: this.projectId },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      select: { payload: true },
    });
    return rows.map((row) => agentConnectionSchema.parse(row.payload));
  }

  async findConnection(
    coordinatorInstanceId: string,
    connectedAgentId: string,
  ): Promise<AgentConnection | undefined> {
    const row = await this.db.agentConnectionRecord.findUnique({
      where: {
        projectId_coordinatorInstanceId_connectedAgentId: {
          projectId: this.projectId,
          coordinatorInstanceId,
          connectedAgentId,
        },
      },
      select: { payload: true },
    });
    return row ? agentConnectionSchema.parse(row.payload) : undefined;
  }

  async countConnectionsForAgent(connectedAgentId: string): Promise<number> {
    return this.db.agentConnectionRecord.count({
      where: {
        projectId: this.projectId,
        connectedAgentId,
      },
    });
  }

  async deleteConnection(id: string): Promise<boolean> {
    const result = await this.db.agentConnectionRecord.deleteMany({
      where: { projectId: this.projectId, id },
    });
    return result.count > 0;
  }
}
