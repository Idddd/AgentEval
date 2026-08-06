BEGIN;

CREATE TABLE tasklattice.agent_instance_access_policy_bindings (
    project_id TEXT NOT NULL,
    instance_id TEXT NOT NULL,
    access_policy_id TEXT NOT NULL,
    bound_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    bound_by TEXT NOT NULL,
    CONSTRAINT agent_instance_access_policy_bindings_pkey
      PRIMARY KEY (project_id, instance_id, access_policy_id),
    CONSTRAINT agent_instance_access_policy_project_fkey
      FOREIGN KEY (project_id) REFERENCES tasklattice.projects(id)
      ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT agent_instance_access_policy_instance_fkey
      FOREIGN KEY (project_id, instance_id)
      REFERENCES tasklattice.agents(project_id, id)
      ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT agent_instance_access_policy_policy_fkey
      FOREIGN KEY (project_id, access_policy_id)
      REFERENCES tasklattice.access_policies(project_id, id)
      ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX instance_access_policy_policy_idx
  ON tasklattice.agent_instance_access_policy_bindings(project_id, access_policy_id);

-- The legacy binding table did not have an Agent foreign key. Refuse to
-- silently discard orphaned rows or resolve conflicting copies of the old
-- Virtual Employee reference.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM tasklattice.agent_instance_virtual_employee_bindings AS binding
    LEFT JOIN tasklattice.agents AS agent
      ON agent.project_id = binding.project_id
     AND agent.id = binding.instance_id
    WHERE agent.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Cannot migrate orphaned Instance Virtual Employee bindings.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM tasklattice.agent_instance_virtual_employee_bindings AS binding
    JOIN tasklattice.agents AS agent
      ON agent.project_id = binding.project_id
     AND agent.id = binding.instance_id
    WHERE agent.payload->>'virtualEmployeeId'
          IS DISTINCT FROM binding.virtual_employee_id
  ) THEN
    RAISE EXCEPTION 'Instance Virtual Employee binding disagrees with Agent payload.';
  END IF;
END $$;

-- Materialize every current policy-to-identity assignment onto every current
-- Instance for that identity. DRAFT policies are deliberately retained as
-- bindings; policy status continues to decide whether a rule is enforced.
INSERT INTO tasklattice.agent_instance_access_policy_bindings (
  project_id,
  instance_id,
  access_policy_id,
  bound_at,
  bound_by
)
SELECT
  binding.project_id,
  binding.instance_id,
  policy.id,
  binding.bound_at,
  binding.bound_by
FROM tasklattice.access_policies AS policy
CROSS JOIN LATERAL jsonb_array_elements_text(
  CASE
    WHEN jsonb_typeof(policy.payload->'virtualEmployeeIds') = 'array'
      THEN policy.payload->'virtualEmployeeIds'
    ELSE '[]'::jsonb
  END
) AS employee(virtual_employee_id)
JOIN tasklattice.agent_instance_virtual_employee_bindings AS binding
  ON binding.project_id = policy.project_id
 AND binding.virtual_employee_id = employee.virtual_employee_id
JOIN tasklattice.agents AS agent
  ON agent.project_id = binding.project_id
 AND agent.id = binding.instance_id
ON CONFLICT DO NOTHING;

-- A stored Agent payload is the compatibility fallback for an Instance that
-- predates, or otherwise lacks, its legacy relation row.
INSERT INTO tasklattice.agent_instance_access_policy_bindings (
  project_id,
  instance_id,
  access_policy_id,
  bound_at,
  bound_by
)
SELECT
  agent.project_id,
  agent.id,
  policy.id,
  CURRENT_TIMESTAMP,
  'migration:agent-payload'
FROM tasklattice.agents AS agent
JOIN tasklattice.access_policies AS policy
  ON policy.project_id = agent.project_id
WHERE agent.payload ? 'virtualEmployeeId'
  AND COALESCE(policy.payload->'virtualEmployeeIds', '[]'::jsonb)
      ? (agent.payload->>'virtualEmployeeId')
ON CONFLICT DO NOTHING;

-- Preserve the former fail-closed behavior for Instances whose identity had
-- no Access Policy. The same deterministic ID is safe across Projects because
-- Access Policy identity is project-scoped.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM tasklattice.access_policies AS policy
    WHERE policy.id = '00000000-0000-4000-8000-00000000da11'
      AND policy.payload->>'createdBy' IS DISTINCT FROM 'system:migration'
      AND EXISTS (
        SELECT 1
        FROM tasklattice.agents AS agent
        WHERE agent.project_id = policy.project_id
          AND NOT EXISTS (
            SELECT 1
            FROM tasklattice.agent_instance_access_policy_bindings AS binding
            WHERE binding.project_id = agent.project_id
              AND binding.instance_id = agent.id
          )
      )
  ) THEN
    RAISE EXCEPTION 'Reserved migrated deny-all Access Policy ID is already in use.';
  END IF;
END $$;

INSERT INTO tasklattice.access_policies (
  project_id,
  id,
  payload,
  created_at,
  updated_at
)
SELECT DISTINCT
  agent.project_id,
  '00000000-0000-4000-8000-00000000da11',
  jsonb_build_object(
    'id', '00000000-0000-4000-8000-00000000da11',
    'name', 'Migrated deny-all',
    'status', 'ACTIVE',
    'serverRules', '[]'::jsonb,
    'revision', 1,
    'createdBy', 'system:migration',
    'createdAt', to_jsonb(CURRENT_TIMESTAMP),
    'updatedAt', to_jsonb(CURRENT_TIMESTAMP)
  ),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM tasklattice.agents AS agent
WHERE NOT EXISTS (
  SELECT 1
  FROM tasklattice.agent_instance_access_policy_bindings AS binding
  WHERE binding.project_id = agent.project_id
    AND binding.instance_id = agent.id
)
ON CONFLICT (project_id, id) DO NOTHING;

INSERT INTO tasklattice.access_policy_versions (
  project_id,
  policy_id,
  revision,
  payload,
  created_at
)
SELECT
  policy.project_id,
  policy.id,
  1,
  jsonb_build_object(
    'policyId', policy.id,
    'revision', 1,
    'actor', 'system:migration',
    'summary', 'Fail-closed policy created while migrating Instance bindings.',
    'snapshot', policy.payload,
    'createdAt', policy.payload->'createdAt'
  ),
  policy.created_at
FROM tasklattice.access_policies AS policy
WHERE policy.id = '00000000-0000-4000-8000-00000000da11'
ON CONFLICT (project_id, policy_id, revision) DO NOTHING;

INSERT INTO tasklattice.agent_instance_access_policy_bindings (
  project_id,
  instance_id,
  access_policy_id,
  bound_at,
  bound_by
)
SELECT
  agent.project_id,
  agent.id,
  '00000000-0000-4000-8000-00000000da11',
  CURRENT_TIMESTAMP,
  'system:migration'
FROM tasklattice.agents AS agent
WHERE NOT EXISTS (
  SELECT 1
  FROM tasklattice.agent_instance_access_policy_bindings AS binding
  WHERE binding.project_id = agent.project_id
    AND binding.instance_id = agent.id
)
ON CONFLICT DO NOTHING;

-- Bindings are now relational. Remove both legacy association fields from
-- stored JSON and make the new Agent payload shape explicit.
UPDATE tasklattice.agents
SET payload = jsonb_set(
  payload - 'virtualEmployeeId' - 'accessPolicyIds',
  '{schemaVersion}',
  '2'::jsonb,
  true
);

UPDATE tasklattice.access_policies
SET payload = payload - 'virtualEmployeeIds'
WHERE payload ? 'virtualEmployeeIds';

UPDATE tasklattice.access_policy_versions
SET payload = jsonb_set(
  payload,
  '{snapshot}',
  (payload->'snapshot') - 'virtualEmployeeIds',
  false
)
WHERE payload->'snapshot' ? 'virtualEmployeeIds';

DROP TABLE tasklattice.virtual_employee_audit;
DROP TABLE tasklattice.agent_instance_virtual_employee_bindings;
DROP TABLE tasklattice.access_scope_bindings;
DROP TABLE tasklattice.identity_bindings;
DROP TABLE tasklattice.virtual_employee_model_access;
DROP TABLE tasklattice.virtual_employees;

COMMIT;
