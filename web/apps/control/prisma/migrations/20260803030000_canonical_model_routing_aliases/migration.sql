UPDATE tasklattice.model_routings
SET payload = jsonb_set(
  payload,
  '{publicModelAlias}',
  to_jsonb('tali-routing-' || id),
  true
)
WHERE payload ->> 'publicModelAlias' IS DISTINCT FROM 'tali-routing-' || id;

UPDATE tasklattice.agents
SET payload = jsonb_set(
  payload,
  '{model}',
  to_jsonb('tali-routing-' || (payload ->> 'modelRoutingId')),
  true
)
WHERE payload ->> 'modelRoutingId' IS NOT NULL
  AND payload ->> 'model' IS DISTINCT FROM 'tali-routing-' || (payload ->> 'modelRoutingId');

UPDATE tasklattice.model_endpoint_mapping
SET liteLLM_model_name = 'tali-routing-' || substring(model_endpoint_id FROM 15),
    liteLLM_model_group = 'tali-routing-' || substring(model_endpoint_id FROM 15)
WHERE model_endpoint_id LIKE 'model-routing:%'
  AND (
    liteLLM_model_name IS DISTINCT FROM 'tali-routing-' || substring(model_endpoint_id FROM 15)
    OR liteLLM_model_group IS DISTINCT FROM 'tali-routing-' || substring(model_endpoint_id FROM 15)
  );
