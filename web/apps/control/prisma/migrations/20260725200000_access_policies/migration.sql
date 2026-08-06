CREATE TABLE tasklattice.access_policies (
    project_id TEXT NOT NULL,
    id TEXT NOT NULL,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ(6) NOT NULL,
    updated_at TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT access_policies_pkey PRIMARY KEY (project_id, id),
    CONSTRAINT access_policies_project_id_fkey
      FOREIGN KEY (project_id) REFERENCES tasklattice.projects(id)
      ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX access_policies_updated_idx
  ON tasklattice.access_policies(project_id, updated_at DESC);

CREATE TABLE tasklattice.access_policy_versions (
    project_id TEXT NOT NULL,
    policy_id TEXT NOT NULL,
    revision INTEGER NOT NULL,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT access_policy_versions_pkey PRIMARY KEY (project_id, policy_id, revision),
    CONSTRAINT access_policy_versions_project_id_fkey
      FOREIGN KEY (project_id) REFERENCES tasklattice.projects(id)
      ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT access_policy_versions_policy_fkey
      FOREIGN KEY (project_id, policy_id)
      REFERENCES tasklattice.access_policies(project_id, id)
      ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX access_policy_versions_created_idx
  ON tasklattice.access_policy_versions(project_id, policy_id, created_at DESC);
