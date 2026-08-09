CREATE TABLE "tasklattice"."virtual_employees" (
    "project_id" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "description" TEXT,
    "business_role" TEXT,
    "owner_team_id" TEXT,
    "environment" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "tags" JSONB NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "virtual_employees_pkey" PRIMARY KEY ("project_id", "id"),
    CONSTRAINT "virtual_employees_project_id_fkey"
      FOREIGN KEY ("project_id") REFERENCES "tasklattice"."projects"("id")
      ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "virtual_employees_project_id_name_key"
  ON "tasklattice"."virtual_employees"("project_id", "name");
CREATE INDEX "virtual_employees_project_id_status_idx"
  ON "tasklattice"."virtual_employees"("project_id", "status");
CREATE INDEX "virtual_employees_project_id_owner_team_id_idx"
  ON "tasklattice"."virtual_employees"("project_id", "owner_team_id");

CREATE TABLE "tasklattice"."virtual_employee_model_access" (
    "project_id" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "virtual_employee_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "litellm_team_id" TEXT,
    "litellm_key_id" TEXT,
    "key_alias" TEXT NOT NULL,
    "key_last_four" TEXT,
    "allowed_models" JSONB NOT NULL,
    "access_groups" JSONB NOT NULL,
    "max_budget" DECIMAL(18,6),
    "budget_duration" TEXT,
    "rpm_limit" INTEGER,
    "tpm_limit" INTEGER,
    "max_parallel_requests" INTEGER,
    "key_duration" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6),
    "fallback_models" JSONB NOT NULL,
    "secret_reference" TEXT,
    "sync_status" TEXT NOT NULL,
    "last_synced_at" TIMESTAMPTZ(6),
    "last_sync_error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "virtual_employee_model_access_pkey" PRIMARY KEY ("project_id", "id"),
    CONSTRAINT "virtual_employee_model_access_project_id_fkey"
      FOREIGN KEY ("project_id") REFERENCES "tasklattice"."projects"("id")
      ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "virtual_employee_model_access_employee_fkey"
      FOREIGN KEY ("project_id", "virtual_employee_id")
      REFERENCES "tasklattice"."virtual_employees"("project_id", "id")
      ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "virtual_employee_model_access_employee_unique"
  ON "tasklattice"."virtual_employee_model_access"("project_id", "virtual_employee_id");
CREATE INDEX "virtual_employee_model_access_project_employee_idx"
  ON "tasklattice"."virtual_employee_model_access"("project_id", "virtual_employee_id");

CREATE TABLE "tasklattice"."identity_bindings" (
    "project_id" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "virtual_employee_id" TEXT NOT NULL,
    "identity_type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "external_reference" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "system" TEXT,
    "metadata" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "identity_bindings_pkey" PRIMARY KEY ("project_id", "id"),
    CONSTRAINT "identity_bindings_project_id_fkey"
      FOREIGN KEY ("project_id") REFERENCES "tasklattice"."projects"("id")
      ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "identity_bindings_employee_fkey"
      FOREIGN KEY ("project_id", "virtual_employee_id")
      REFERENCES "tasklattice"."virtual_employees"("project_id", "id")
      ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "identity_bindings_project_employee_idx"
  ON "tasklattice"."identity_bindings"("project_id", "virtual_employee_id");

CREATE TABLE "tasklattice"."access_scope_bindings" (
    "project_id" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "virtual_employee_id" TEXT NOT NULL,
    "resource_type" TEXT NOT NULL,
    "resource_id" TEXT NOT NULL,
    "actions" JSONB NOT NULL,
    "conditions" JSONB NOT NULL,
    "enforcement_provider" TEXT NOT NULL,
    "approval_status" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "access_scope_bindings_pkey" PRIMARY KEY ("project_id", "id"),
    CONSTRAINT "access_scope_bindings_project_id_fkey"
      FOREIGN KEY ("project_id") REFERENCES "tasklattice"."projects"("id")
      ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "access_scope_bindings_employee_fkey"
      FOREIGN KEY ("project_id", "virtual_employee_id")
      REFERENCES "tasklattice"."virtual_employees"("project_id", "id")
      ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "access_scope_bindings_project_employee_idx"
  ON "tasklattice"."access_scope_bindings"("project_id", "virtual_employee_id");

CREATE TABLE "tasklattice"."agent_instance_virtual_employee_bindings" (
    "project_id" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "instance_id" TEXT NOT NULL,
    "virtual_employee_id" TEXT NOT NULL,
    "bound_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bound_by" TEXT NOT NULL,
    CONSTRAINT "agent_instance_virtual_employee_bindings_pkey" PRIMARY KEY ("project_id", "id"),
    CONSTRAINT "agent_instance_virtual_employee_bindings_project_id_fkey"
      FOREIGN KEY ("project_id") REFERENCES "tasklattice"."projects"("id")
      ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "agent_instance_virtual_employee_bindings_employee_fkey"
      FOREIGN KEY ("project_id", "virtual_employee_id")
      REFERENCES "tasklattice"."virtual_employees"("project_id", "id")
      ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "agent_instance_virtual_employee_bindings_project_instance_key"
  ON "tasklattice"."agent_instance_virtual_employee_bindings"("project_id", "instance_id");
CREATE INDEX "agent_instance_virtual_employee_bindings_project_employee_idx"
  ON "tasklattice"."agent_instance_virtual_employee_bindings"("project_id", "virtual_employee_id");

CREATE TABLE "tasklattice"."virtual_employee_audit" (
    "project_id" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "virtual_employee_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "virtual_employee_audit_pkey" PRIMARY KEY ("project_id", "id"),
    CONSTRAINT "virtual_employee_audit_project_id_fkey"
      FOREIGN KEY ("project_id") REFERENCES "tasklattice"."projects"("id")
      ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "virtual_employee_audit_employee_fkey"
      FOREIGN KEY ("project_id", "virtual_employee_id")
      REFERENCES "tasklattice"."virtual_employees"("project_id", "id")
      ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "virtual_employee_audit_project_employee_created_idx"
  ON "tasklattice"."virtual_employee_audit"("project_id", "virtual_employee_id", "created_at" DESC);
