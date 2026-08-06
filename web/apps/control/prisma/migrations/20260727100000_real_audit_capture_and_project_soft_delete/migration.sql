ALTER TABLE tasklattice.projects
  ADD COLUMN deleted_at TIMESTAMPTZ(6),
  ADD COLUMN deleted_by TEXT;

ALTER TABLE tasklattice.audit_logs
  ADD COLUMN record_id TEXT;

UPDATE tasklattice.audit_logs
SET record_id = project_id || ':' || id
WHERE record_id IS NULL;

ALTER TABLE tasklattice.audit_logs
  ALTER COLUMN record_id SET NOT NULL,
  DROP CONSTRAINT audit_logs_pkey,
  DROP CONSTRAINT audit_logs_project_id_fkey,
  ALTER COLUMN project_id DROP NOT NULL,
  ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (record_id),
  ADD CONSTRAINT audit_logs_project_id_id_key UNIQUE (project_id, id),
  ADD CONSTRAINT audit_logs_project_id_fkey
    FOREIGN KEY (project_id) REFERENCES tasklattice.projects(id)
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX projects_active_created_idx
  ON tasklattice.projects(deleted_at, created_at);

CREATE INDEX audit_logs_retention_idx
  ON tasklattice.audit_logs(occurred_at DESC);
