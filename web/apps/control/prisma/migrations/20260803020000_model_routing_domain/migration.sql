ALTER TABLE tasklattice.model_profiles
  RENAME TO model_routings;

ALTER TABLE tasklattice.model_profile_bindings
  RENAME TO model_routing_bindings;

ALTER TABLE tasklattice.model_routing_bindings
  RENAME COLUMN model_profile_id TO model_routing_id;

ALTER TABLE tasklattice.model_profile_audit
  RENAME TO model_routing_audit;

ALTER TABLE tasklattice.model_routing_audit
  RENAME COLUMN model_profile_id TO model_routing_id;

ALTER INDEX tasklattice.model_profile_bindings_agent_idx
  RENAME TO model_routing_bindings_agent_idx;

ALTER INDEX tasklattice.model_profile_bindings_profile_idx
  RENAME TO model_routing_bindings_routing_idx;

ALTER INDEX tasklattice.model_profile_audit_profile_idx
  RENAME TO model_routing_audit_routing_idx;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'model_profile_bindings_project_id_model_profile_id_fkey'
      AND conrelid = 'tasklattice.model_routing_bindings'::regclass
  ) THEN
    ALTER TABLE tasklattice.model_routing_bindings
      RENAME CONSTRAINT model_profile_bindings_project_id_model_profile_id_fkey
      TO model_routing_bindings_project_id_model_routing_id_fkey;
  END IF;
END $$;

UPDATE tasklattice.model_routing_bindings
SET payload = (payload - 'modelProfileId')
  || jsonb_build_object('modelRoutingId', payload -> 'modelProfileId')
WHERE payload ? 'modelProfileId';

UPDATE tasklattice.model_routing_audit
SET payload = (
  (payload - 'modelProfileId')
  || jsonb_build_object('modelRoutingId', payload -> 'modelProfileId')
)::text::jsonb
WHERE payload ? 'modelProfileId';

UPDATE tasklattice.model_routing_audit
SET payload = jsonb_set(
  payload,
  '{type}',
  to_jsonb(replace(payload ->> 'type', 'model_profile', 'model_routing')),
  false
)
WHERE payload ->> 'type' LIKE 'model_profile%';

UPDATE tasklattice.agents
SET payload = (
  payload
    - 'modelProfileId'
    - 'modelProfileBindingId'
    - 'modelProfileStatus'
    - 'modelProfileComplianceDomain'
    - 'modelProfileCapabilities'
    - 'modelProfileKeyFingerprint'
    - 'modelProfileLastSynchronizedAt'
) || jsonb_strip_nulls(jsonb_build_object(
    'modelRoutingId', payload -> 'modelProfileId',
    'modelRoutingBindingId', payload -> 'modelProfileBindingId',
    'modelRoutingStatus', payload -> 'modelProfileStatus',
    'modelRoutingComplianceDomain', payload -> 'modelProfileComplianceDomain',
    'modelRoutingCapabilities', payload -> 'modelProfileCapabilities',
    'modelRoutingKeyFingerprint', payload -> 'modelProfileKeyFingerprint',
    'modelRoutingLastSynchronizedAt', payload -> 'modelProfileLastSynchronizedAt'
  ))
WHERE payload ?| ARRAY[
  'modelProfileId',
  'modelProfileBindingId',
  'modelProfileStatus',
  'modelProfileComplianceDomain',
  'modelProfileCapabilities',
  'modelProfileKeyFingerprint',
  'modelProfileLastSynchronizedAt'
];
