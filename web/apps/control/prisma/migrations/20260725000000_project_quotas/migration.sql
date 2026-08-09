CREATE TABLE "tasklattice"."project_quotas" (
    "project_id" TEXT NOT NULL,
    "hard_budget_usd" DECIMAL(18,6),
    "budget_duration" TEXT,
    "tpm_limit" BIGINT,
    "max_instances" INTEGER,
    "max_mcp_integrations" INTEGER,
    "max_knowledge_base_integrations" INTEGER,
    "litellm_team_id" TEXT,
    "sync_status" TEXT NOT NULL DEFAULT 'pending',
    "last_synced_at" TIMESTAMPTZ(6),
    "last_sync_error" TEXT,
    "updated_by" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_quotas_pkey" PRIMARY KEY ("project_id"),
    CONSTRAINT "project_quotas_project_id_fkey"
      FOREIGN KEY ("project_id") REFERENCES "tasklattice"."projects"("id")
      ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "project_quotas_non_negative" CHECK (
      ("hard_budget_usd" IS NULL OR "hard_budget_usd" >= 0) AND
      ("tpm_limit" IS NULL OR "tpm_limit" >= 0) AND
      ("max_instances" IS NULL OR "max_instances" >= 0) AND
      ("max_mcp_integrations" IS NULL OR "max_mcp_integrations" >= 0) AND
      ("max_knowledge_base_integrations" IS NULL OR "max_knowledge_base_integrations" >= 0)
    )
);

INSERT INTO "tasklattice"."project_quotas" ("project_id")
SELECT "id" FROM "tasklattice"."projects"
ON CONFLICT ("project_id") DO NOTHING;
