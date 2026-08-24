import type {
  AccessPolicy,
  AccessPolicyVersion,
} from "@tasklattice/contracts";
import { prisma } from "../db/prisma";
import type { Prisma, PrismaClient } from "../generated/prisma/client";

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function decode<T>(value: Prisma.JsonValue): T {
  return value as T;
}

export class AccessPolicyStore {
  constructor(
    readonly projectId: string,
    private readonly db: PrismaClient = prisma(),
  ) {}

  async list(): Promise<AccessPolicy[]> {
    const rows = await this.db.accessPolicyRecord.findMany({
      where: { projectId: this.projectId },
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      select: { payload: true },
    });
    return rows.map((row) => decode<AccessPolicy>(row.payload));
  }

  async get(id: string): Promise<AccessPolicy | undefined> {
    const row = await this.db.accessPolicyRecord.findUnique({
      where: { projectId_id: { projectId: this.projectId, id } },
      select: { payload: true },
    });
    return row ? decode<AccessPolicy>(row.payload) : undefined;
  }

  async save(
    policy: AccessPolicy,
    version: AccessPolicyVersion,
  ): Promise<AccessPolicy> {
    await this.db.$transaction(async (transaction) => {
      await transaction.accessPolicyRecord.upsert({
        where: { projectId_id: { projectId: this.projectId, id: policy.id } },
        create: {
          projectId: this.projectId,
          id: policy.id,
          payload: json(policy),
          createdAt: policy.createdAt,
          updatedAt: policy.updatedAt,
        },
        update: {
          payload: json(policy),
          updatedAt: policy.updatedAt,
        },
      });
      await transaction.accessPolicyVersionRecord.create({
        data: {
          projectId: this.projectId,
          policyId: policy.id,
          revision: version.revision,
          payload: json(version),
          createdAt: version.createdAt,
        },
      });
    });
    return policy;
  }

  async updateReconciliation(
    policy: AccessPolicy,
  ): Promise<AccessPolicy> {
    await this.db.accessPolicyRecord.update({
      where: { projectId_id: { projectId: this.projectId, id: policy.id } },
      data: { payload: json(policy), updatedAt: policy.updatedAt },
    });
    return policy;
  }

  async versions(policyId: string): Promise<AccessPolicyVersion[]> {
    const rows = await this.db.accessPolicyVersionRecord.findMany({
      where: { projectId: this.projectId, policyId },
      orderBy: { revision: "desc" },
      select: { payload: true },
    });
    return rows.map((row) => decode<AccessPolicyVersion>(row.payload));
  }

  async delete(id: string): Promise<boolean> {
    return (await this.db.accessPolicyRecord.deleteMany({
      where: { projectId: this.projectId, id },
    })).count > 0;
  }
}
