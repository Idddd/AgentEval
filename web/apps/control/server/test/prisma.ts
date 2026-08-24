import { createRequire } from "node:module";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool, type Client as PgClient } from "pg";
import migration from "../../prisma/migrations/20260723000000_initial_control_plane/migration.sql?raw";
import seedMigration from "../../prisma/migrations/20260723001000_seed_control_plane/migration.sql?raw";
import virtualEmployeeMigration from "../../prisma/migrations/20260724000000_virtual_employees/migration.sql?raw";
import projectQuotaMigration from "../../prisma/migrations/20260725000000_project_quotas/migration.sql?raw";
import personalProfileMigration from "../../prisma/migrations/20260725120000_personal_profile/migration.sql?raw";
import accountPreferencesMigration from "../../prisma/migrations/20260725130000_account_preferences/migration.sql?raw";
import userIdentitiesMigration from "../../prisma/migrations/20260725140000_user_identities/migration.sql?raw";
import resourceCatalogNamesMigration from "../../prisma/migrations/20260725150000_resource_catalog_names/migration.sql?raw";
import mcpToolDiscoveryMigration from "../../prisma/migrations/20260725160000_mcp_tool_discovery/migration.sql?raw";
import liteLLMResourceControlPlaneMigration from "../../prisma/migrations/20260725190000_litellm_resource_control_plane/migration.sql?raw";
import accessPoliciesMigration from "../../prisma/migrations/20260725200000_access_policies/migration.sql?raw";
import auditLogsMigration from "../../prisma/migrations/20260726120000_platform_audit_logs/migration.sql?raw";
import agentGardenMigration from "../../prisma/migrations/20260726150000_agent_garden/migration.sql?raw";
import vendorSkillArtifactsMigration from "../../prisma/migrations/20260726230000_vendor_skill_artifacts/migration.sql?raw";
import auditLogQueryAndTraceMigration from "../../prisma/migrations/20260727090000_audit_log_query_and_trace/migration.sql?raw";
import auditFixtureTraceCorrelationMigration from "../../prisma/migrations/20260727091000_audit_fixture_trace_correlation/migration.sql?raw";
import realAuditCaptureMigration from "../../prisma/migrations/20260727100000_real_audit_capture_and_project_soft_delete/migration.sql?raw";
import instanceAccessPolicyBindingsMigration from "../../prisma/migrations/20260802000000_instance_access_policy_bindings/migration.sql?raw";
import defaultAccessPolicyMigration from "../../prisma/migrations/20260803000000_default_access_policy/migration.sql?raw";
import reconcileSpecializationCapabilitiesMigration from "../../prisma/migrations/20260803010000_reconcile_specialization_capabilities/migration.sql?raw";
import modelRoutingDomainMigration from "../../prisma/migrations/20260803020000_model_routing_domain/migration.sql?raw";
import { developmentResourceCatalog } from "../catalog/development-resource-catalog";
import { PrismaClient } from "../generated/prisma/client";

export function createTestPrisma(): PrismaClient {
  const require = createRequire(import.meta.url);
  const { DataType, newDb } = require("pg-mem") as typeof import("pg-mem");
  const memory = newDb({ autoCreateForeignKeyIndices: true });
  memory.public.registerFunction({
    name: "to_timestamp",
    args: [DataType.integer],
    returns: DataType.timestamptz,
    implementation: (seconds: number) => new Date(seconds * 1_000),
  });
  // pg-mem models NUMERIC values but does not parse PostgreSQL precision
  // metadata. Production migrations retain Prisma's DECIMAL(65,30).
  memory.public.none(migration.replaceAll("DECIMAL(65,30)", "NUMERIC"));
  memory.public.none(seedMigration);
  memory.public.none(virtualEmployeeMigration.replaceAll("DECIMAL(18,6)", "NUMERIC"));
  memory.public.none(projectQuotaMigration.replaceAll("DECIMAL(18,6)", "NUMERIC"));
  memory.public.none(personalProfileMigration);
  memory.public.none(accountPreferencesMigration);
  memory.public.none(
    userIdentitiesMigration.replace(
      /CREATE INDEX user_identities_user_id_idx[\s\S]*?;/,
      "",
    ),
  );
  memory.public.none(
    resourceCatalogNamesMigration.replace(
      /ALTER TABLE tasklattice\.(?:skills|mcp_servers|knowledge_sources)\s+RENAME CONSTRAINT[\s\S]*?;/g,
      "",
    ),
  );
  memory.public.none(mcpToolDiscoveryMigration);
  memory.public.none(liteLLMResourceControlPlaneMigration);
  memory.public.none(accessPoliciesMigration);
  memory.public.none(auditLogsMigration);
  memory.public.none(agentGardenMigration);
  memory.public.none(vendorSkillArtifactsMigration);
  memory.public.none(auditLogQueryAndTraceMigration);
  memory.public.none(auditFixtureTraceCorrelationMigration);
  memory.public.none(realAuditCaptureMigration);
  const instancePolicyTable = instanceAccessPolicyBindingsMigration.match(
    /CREATE TABLE tasklattice\.agent_instance_access_policy_bindings[\s\S]*?\n\);/,
  )?.[0];
  const instancePolicyIndex = instanceAccessPolicyBindingsMigration.match(
    /CREATE INDEX instance_access_policy_policy_idx[\s\S]*?;/,
  )?.[0];
  const removedVirtualEmployeeTables = [
    ...instanceAccessPolicyBindingsMigration.matchAll(
      /^DROP TABLE tasklattice\.(?:virtual_employee_audit|agent_instance_virtual_employee_bindings|access_scope_bindings|identity_bindings|virtual_employee_model_access|virtual_employees);$/gm,
    ),
  ].map(([statement]) => statement);
  if (!instancePolicyTable || !instancePolicyIndex || removedVirtualEmployeeTables.length !== 6) {
    throw new Error("Instance Access Policy migration structure is incomplete.");
  }
  // pg-mem does not implement the PostgreSQL JSONB lateral expansion and DO
  // blocks used by the production backfill. The test seed has no Instances or
  // Access Policies, so applying the equivalent structural migration is exact.
  memory.public.none(
    [instancePolicyTable, instancePolicyIndex, ...removedVirtualEmployeeTables].join("\n"),
  );
  const defaultAccessPolicyId = "00000000-0000-4000-8000-00000000da12";
  if (
    !defaultAccessPolicyMigration.includes(defaultAccessPolicyId)
    || !defaultAccessPolicyMigration.includes("'serverRules', '[]'::jsonb")
    || !defaultAccessPolicyMigration.includes("'status', 'ACTIVE'")
  ) {
    throw new Error("Default Access Policy migration structure is incomplete.");
  }
  // pg-mem does not implement the PostgreSQL DO and JSONB builder functions
  // used by the production migration. Apply its equivalent seed data here.
  const defaultAccessPolicyCreatedAt = "2026-08-03T00:00:00.000Z";
  const defaultAccessPolicy = {
    id: defaultAccessPolicyId,
    name: "Default",
    status: "ACTIVE",
    serverRules: [],
    revision: 1,
    createdBy: "system:setup",
    createdAt: defaultAccessPolicyCreatedAt,
    updatedAt: defaultAccessPolicyCreatedAt,
  };
  const defaultAccessPolicyVersion = {
    policyId: defaultAccessPolicyId,
    revision: 1,
    actor: "system:setup",
    summary: "Default deny-all Access Policy created during Project setup.",
    snapshot: defaultAccessPolicy,
    createdAt: defaultAccessPolicyCreatedAt,
  };
  memory.public.none(`
    INSERT INTO tasklattice.access_policies (
      project_id, id, payload, created_at, updated_at
    )
    SELECT
      project.id,
      '${defaultAccessPolicyId}',
      '${JSON.stringify(defaultAccessPolicy)}'::jsonb,
      '${defaultAccessPolicyCreatedAt}'::timestamptz,
      '${defaultAccessPolicyCreatedAt}'::timestamptz
    FROM tasklattice.projects AS project
    WHERE project.deleted_at IS NULL;

    INSERT INTO tasklattice.access_policy_versions (
      project_id, policy_id, revision, payload, created_at
    )
    SELECT
      project.id,
      '${defaultAccessPolicyId}',
      1,
      '${JSON.stringify(defaultAccessPolicyVersion)}'::jsonb,
      '${defaultAccessPolicyCreatedAt}'::timestamptz
    FROM tasklattice.projects AS project
      WHERE project.deleted_at IS NULL;
  `);
  if (
    !reconcileSpecializationCapabilitiesMigration.includes(
      "defaultMcpServerIds",
    ) ||
    !reconcileSpecializationCapabilitiesMigration.includes(
      "defaultKnowledgeSourceIds",
    ) ||
    !reconcileSpecializationCapabilitiesMigration.includes(
      "tasklattice.mcp_servers",
    ) ||
    !reconcileSpecializationCapabilitiesMigration.includes(
      "tasklattice.knowledge_sources",
    )
  ) {
    throw new Error("Role capability reconciliation migration is incomplete.");
  }
  // pg-mem does not implement the correlated JSONB expansion used by the
  // production migration. Reconcile the same references in JavaScript.
  const resourceIds = (table: "skills" | "mcp_servers" | "knowledge_sources") =>
    new Set(
      memory.public
        .many(`SELECT project_id, id FROM tasklattice.${table}`)
        .map((row) => `${String(row.project_id)}:${String(row.id)}`),
    );
  const availableSkillIds = resourceIds("skills");
  const availableMcpServerIds = resourceIds("mcp_servers");
  const availableKnowledgeSourceIds = resourceIds("knowledge_sources");
  for (const row of memory.public.many(
    "SELECT project_id, id, payload FROM tasklattice.agent_specializations",
  )) {
    const projectId = String(row.project_id);
    const payload = row.payload as {
      defaultSkillIds: string[];
      defaultMcpServerIds: string[];
      defaultKnowledgeSourceIds: string[];
    };
    const reconciled = {
      ...payload,
      defaultSkillIds: payload.defaultSkillIds.filter((id) =>
        availableSkillIds.has(`${projectId}:${id}`),
      ),
      defaultMcpServerIds: payload.defaultMcpServerIds.filter((id) =>
        availableMcpServerIds.has(`${projectId}:${id}`),
      ),
      defaultKnowledgeSourceIds: payload.defaultKnowledgeSourceIds.filter(
        (id) => availableKnowledgeSourceIds.has(`${projectId}:${id}`),
      ),
    };
    const encoded = JSON.stringify(reconciled).replaceAll("'", "''");
    memory.public.none(
      `UPDATE tasklattice.agent_specializations
          SET payload = '${encoded}'::jsonb
        WHERE project_id = '${projectId.replaceAll("'", "''")}'
          AND id = '${String(row.id).replaceAll("'", "''")}';`,
    );
  }
  for (const skill of developmentResourceCatalog.skills) {
    const payload = JSON.stringify(skill).replaceAll("'", "''");
    memory.public.none(
      `UPDATE tasklattice.skills
          SET payload = '${payload}'::jsonb
        WHERE project_id = 'individual' AND id = '${skill.id}';`,
    );
  }
  if (
    !modelRoutingDomainMigration.includes("RENAME TO model_routings")
    || !modelRoutingDomainMigration.includes("model_routing_id")
    || !modelRoutingDomainMigration.includes("modelRoutingId")
  ) {
    throw new Error("Model Routing domain migration is incomplete.");
  }
  // pg-mem does not implement PostgreSQL constraint/index renaming or the
  // production JSONB backfill. Test seeds contain no routing or Instance rows,
  // so the equivalent structural table/column rename is sufficient here.
  memory.public.none(`
    ALTER TABLE tasklattice.model_profile_bindings
      DROP CONSTRAINT "model_profile_bindings_model_profile_id|project_id_fk";
    ALTER TABLE tasklattice.model_profiles RENAME TO model_routings;
    ALTER TABLE tasklattice.model_profile_bindings RENAME TO model_routing_bindings;
    ALTER TABLE tasklattice.model_routing_bindings RENAME COLUMN model_profile_id TO model_routing_id;
    ALTER TABLE tasklattice.model_routing_bindings
      ADD CONSTRAINT model_routing_bindings_project_id_model_routing_id_fkey
      FOREIGN KEY (project_id, model_routing_id)
      REFERENCES tasklattice.model_routings(project_id, id)
      ON DELETE CASCADE ON UPDATE CASCADE;
    ALTER TABLE tasklattice.model_profile_audit RENAME TO model_routing_audit;
    ALTER TABLE tasklattice.model_routing_audit RENAME COLUMN model_profile_id TO model_routing_id;
  `);
  const pg = memory.adapters.createPg();
  const query = pg.Client.prototype.query;
  pg.Client.prototype.query = function (
    this: PgClient,
    input: string | { rowMode?: string; types?: unknown },
    ...args: unknown[]
  ) {
    if (typeof input === "object") {
      const arrayRows = input.rowMode === "array";
      const { rowMode: _rowMode, types: _types, ...compatible } = input;
      const transform = (result: { fields?: Array<{ name: string }>; rows?: Array<Record<string, unknown>> }) => {
        if (arrayRows && result.rows) {
          const fieldNames = result.fields?.map((field) => field.name) ?? [];
          const names = fieldNames.length && fieldNames.every(Boolean)
            ? fieldNames
            : Object.keys(result.rows[0] ?? {});
          const sample = result.rows[0] ?? {};
          const oid = (value: unknown) =>
            value instanceof Date ? 1184
              : typeof value === "boolean" ? 16
                : typeof value === "number" ? 701
                  : typeof value === "bigint" ? 20
                    : typeof value === "object" && value !== null ? 3802
                      : 25;
          const fields = names.map((name, index) => ({
            ...(result.fields?.[index] ?? {}),
            name,
            dataTypeID: (result.fields?.[index] as { dataTypeID?: number } | undefined)?.dataTypeID ?? oid(sample[name]),
          }));
          return {
            ...result,
            fields,
            rows: result.rows.map((row) => names.map((name, index) =>
              fields[index]?.dataTypeID === 3802 && typeof row[name] === "object"
                ? JSON.stringify(row[name])
                : row[name],
            )),
          };
        }
        return result;
      };
      const callbackIndex = args.findLastIndex((argument) => typeof argument === "function");
      if (callbackIndex >= 0) {
        const callback = args[callbackIndex] as (error: unknown, result: unknown) => void;
        args[callbackIndex] = (error: unknown, result: Parameters<typeof transform>[0]) =>
          callback(error, error ? result : transform(result));
      }
      const result = query.call(this, compatible, ...args);
      return result && typeof (result as Promise<unknown>).then === "function"
        ? (result as Promise<Parameters<typeof transform>[0]>).then(transform)
        : result;
    }
    return query.call(this, input, ...args);
  } as typeof query;
  const pool = new Pool({ Client: pg.Client } as never);
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}
