import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { developmentResourceCatalog } from "../server/catalog/development-resource-catalog";
import { FilePolicyCatalogSource } from "../server/policies/policy-service";

const target = fileURLToPath(new URL(
  "./migrations/20260725151000_seed_resource_catalog/migration.sql",
  import.meta.url,
));

function literal(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

const statements: string[] = [
  `INSERT INTO tasklattice.users
    (id, username, email, display_name, auth_provider)
   VALUES ('local-admin', 'admin', 'admin@tasklattice.local', 'Local Administrator', 'local')
   ON CONFLICT (id) DO NOTHING;`,
  `INSERT INTO tasklattice.projects
    (id, name, type, created_by)
   VALUES ('individual', 'admin', 'personal', 'local-admin')
   ON CONFLICT (id) DO NOTHING;`,
  `INSERT INTO tasklattice.project_members
    (project_id, user_id, role)
   VALUES ('individual', 'local-admin', 'admin')
   ON CONFLICT (project_id, user_id) DO NOTHING;`,
];

const groups = [
  ["skills", developmentResourceCatalog.skills],
  ["mcp_servers", developmentResourceCatalog.mcpServers],
  ["knowledge_sources", developmentResourceCatalog.knowledgeSources],
  ["agent_specializations", developmentResourceCatalog.specializations],
] as const;

for (const [table, records] of groups) {
  for (const [sortOrder, record] of records.entries()) {
    statements.push(
      `INSERT INTO tasklattice.${table} (project_id, id, payload, sort_order)
       VALUES ('individual', ${literal(record.id)}, ${literal(JSON.stringify(record))}::jsonb, ${sortOrder})
       ON CONFLICT (project_id, id) DO NOTHING;`,
    );
  }
}

for (const policy of new FilePolicyCatalogSource().load().policies) {
  statements.push(
    `INSERT INTO tasklattice.sandbox_policies (project_id, id, payload, created_at)
     VALUES ('individual', ${literal(policy.id)}, ${literal(JSON.stringify(policy))}::jsonb, to_timestamp(0))
     ON CONFLICT (project_id, id) DO NOTHING;`,
  );
}

mkdirSync(fileURLToPath(new URL("./migrations/20260725151000_seed_resource_catalog", import.meta.url)), {
  recursive: true,
});
writeFileSync(target, `${statements.join("\n\n")}\n`);
