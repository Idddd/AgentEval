UPDATE tasklattice.skills
SET payload = payload || jsonb_build_object(
  'trustLevel',
  COALESCE(
    payload -> 'trustLevel',
    to_jsonb(
      CASE
        WHEN payload ->> 'status' = 'DRAFT' THEN 'UNSAFE'
        WHEN id IN (
          'document-summarization',
          'data-extraction',
          'incident-triage',
          'customer-conversation-summary',
          'skill-sql-query'
        ) THEN 'BUILT_IN'
        ELSE 'TRUSTED_SOURCE'
      END
    )
  ),
  'compatibleAgents',
  COALESCE(
    payload -> 'compatibleAgents',
    CASE
      WHEN payload ->> 'category' = 'Developer Tools'
        THEN '["openclaw", "claude-code"]'::jsonb
      WHEN payload ->> 'category' = 'Operations'
        THEN '["hermes", "openclaw", "claude-code"]'::jsonb
      ELSE '["hermes", "openclaw"]'::jsonb
    END
  )
)
WHERE NOT payload ? 'trustLevel'
   OR NOT payload ? 'compatibleAgents';
