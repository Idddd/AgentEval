-- Every active Project starts with a selectable, fail-closed Access Policy.
-- The deterministic ID is safe because Access Policy identity is Project-scoped.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM tasklattice.access_policies
    WHERE id = '00000000-0000-4000-8000-00000000da12'
      AND payload->>'createdBy' IS DISTINCT FROM 'system:setup'
  ) THEN
    RAISE EXCEPTION 'Reserved default Access Policy ID is already in use.';
  END IF;
END $$;

INSERT INTO tasklattice.access_policies (
  project_id,
  id,
  payload,
  created_at,
  updated_at
)
SELECT
  project.id,
  '00000000-0000-4000-8000-00000000da12',
  jsonb_build_object(
    'id', '00000000-0000-4000-8000-00000000da12',
    'name', 'Default',
    'status', 'ACTIVE',
    'serverRules', '[]'::jsonb,
    'revision', 1,
    'createdBy', 'system:setup',
    'createdAt', to_jsonb(CURRENT_TIMESTAMP),
    'updatedAt', to_jsonb(CURRENT_TIMESTAMP)
  ),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM tasklattice.projects AS project
WHERE project.deleted_at IS NULL
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
    'actor', 'system:setup',
    'summary', 'Default deny-all Access Policy created during Project setup.',
    'snapshot', policy.payload,
    'createdAt', policy.payload->'createdAt'
  ),
  policy.created_at
FROM tasklattice.access_policies AS policy
WHERE policy.id = '00000000-0000-4000-8000-00000000da12'
  AND policy.payload->>'createdBy' = 'system:setup'
ON CONFLICT (project_id, policy_id, revision) DO NOTHING;
