-- Role defaults are references into the Project resource catalog. Earlier
-- migrations replaced LiteLLM-managed MCP and Knowledge resources without
-- removing the old IDs from Agent specialization payloads. Keep only defaults
-- that still resolve in the same Project so the UI and create API share one
-- truthful capability set.
UPDATE tasklattice.agent_specializations AS specialization
SET payload = jsonb_set(
  jsonb_set(
    jsonb_set(
      specialization.payload,
      '{defaultSkillIds}',
      COALESCE((
        SELECT jsonb_agg(reference.id ORDER BY reference.position)
        FROM jsonb_array_elements_text(
          COALESCE(specialization.payload -> 'defaultSkillIds', '[]'::jsonb)
        ) WITH ORDINALITY AS reference(id, position)
        WHERE EXISTS (
          SELECT 1
          FROM tasklattice.skills AS skill
          WHERE skill.project_id = specialization.project_id
            AND skill.id = reference.id
        )
      ), '[]'::jsonb)
    ),
    '{defaultMcpServerIds}',
    COALESCE((
      SELECT jsonb_agg(reference.id ORDER BY reference.position)
      FROM jsonb_array_elements_text(
        COALESCE(specialization.payload -> 'defaultMcpServerIds', '[]'::jsonb)
      ) WITH ORDINALITY AS reference(id, position)
      WHERE EXISTS (
        SELECT 1
        FROM tasklattice.mcp_servers AS server
        WHERE server.project_id = specialization.project_id
          AND server.id = reference.id
      )
    ), '[]'::jsonb)
  ),
  '{defaultKnowledgeSourceIds}',
  COALESCE((
    SELECT jsonb_agg(reference.id ORDER BY reference.position)
    FROM jsonb_array_elements_text(
      COALESCE(specialization.payload -> 'defaultKnowledgeSourceIds', '[]'::jsonb)
    ) WITH ORDINALITY AS reference(id, position)
    WHERE EXISTS (
      SELECT 1
      FROM tasklattice.knowledge_sources AS source
      WHERE source.project_id = specialization.project_id
        AND source.id = reference.id
    )
  ), '[]'::jsonb)
),
updated_at = now();
