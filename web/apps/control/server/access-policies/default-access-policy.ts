import type { AccessPolicy, AccessPolicyVersion } from "@tasklattice/contracts";
import type { Prisma, PrismaClient } from "../generated/prisma/client";

export const DEFAULT_ACCESS_POLICY_ID = "00000000-0000-4000-8000-00000000da12";

const DEFAULT_ACCESS_POLICY_ACTOR = "system:setup";

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function defaultPolicy(timestamp: string): AccessPolicy {
  return {
    id: DEFAULT_ACCESS_POLICY_ID,
    name: "Default",
    status: "ACTIVE",
    serverRules: [],
    revision: 1,
    createdBy: DEFAULT_ACCESS_POLICY_ACTOR,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function initialVersion(policy: AccessPolicy): AccessPolicyVersion {
  return {
    policyId: policy.id,
    revision: policy.revision,
    actor: DEFAULT_ACCESS_POLICY_ACTOR,
    summary: "Default deny-all Access Policy created during Project setup.",
    snapshot: policy,
    createdAt: policy.createdAt,
  };
}

export async function ensureDefaultAccessPolicy(
  db: PrismaClient,
  projectId: string,
): Promise<AccessPolicy> {
  const candidate = defaultPolicy(new Date().toISOString());
  return db.$transaction(async (transaction) => {
    await transaction.accessPolicyRecord.createMany({
      data: [
        {
          projectId,
          id: candidate.id,
          payload: json(candidate),
          createdAt: candidate.createdAt,
          updatedAt: candidate.updatedAt,
        },
      ],
      skipDuplicates: true,
    });
    const stored = await transaction.accessPolicyRecord.findUniqueOrThrow({
      where: {
        projectId_id: {
          projectId,
          id: DEFAULT_ACCESS_POLICY_ID,
        },
      },
      select: { payload: true },
    });
    const policy = stored.payload as unknown as AccessPolicy;
    await transaction.accessPolicyVersionRecord.createMany({
      data: [
        {
          projectId,
          policyId: policy.id,
          revision: 1,
          payload: json(initialVersion(policy)),
          createdAt: policy.createdAt,
        },
      ],
      skipDuplicates: true,
    });
    return policy;
  });
}
