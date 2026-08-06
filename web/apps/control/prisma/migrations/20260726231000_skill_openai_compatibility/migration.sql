UPDATE tasklattice.skills
SET payload = jsonb_set(
  payload,
  '{compatibleAgents}',
  CASE id
    WHEN 'employee-policy-search' THEN '["hermes","openai"]'::jsonb
    WHEN 'document-summarization' THEN '["hermes","openai"]'::jsonb
    WHEN 'onboarding-guidance' THEN '["hermes","openclaw"]'::jsonb
    WHEN 'data-extraction' THEN '["hermes","openclaw","openai"]'::jsonb
    WHEN 'citation-builder' THEN '["openai","claude-code"]'::jsonb
    WHEN 'incident-triage' THEN '["hermes","openclaw","claude-code"]'::jsonb
    WHEN 'infrastructure-change-review' THEN '["openclaw","claude-code","openai"]'::jsonb
    WHEN 'customer-conversation-summary' THEN '["hermes","openai"]'::jsonb
    WHEN 'knowledge-answering' THEN '["hermes","openclaw","openai"]'::jsonb
    WHEN 'skill-sql-query' THEN '["claude-code","openai"]'::jsonb
    WHEN 'skill-code-generation' THEN '["openclaw","claude-code","openai"]'::jsonb
    WHEN 'skill-web-research' THEN '["hermes","openclaw","openai"]'::jsonb
    WHEN 'helm-chart-developer' THEN '["openclaw","claude-code"]'::jsonb
    WHEN 'kubernetes-expert' THEN '["openclaw","claude-code","openai"]'::jsonb
    WHEN 'ocp-expert' THEN '["hermes","openclaw","claude-code"]'::jsonb
    ELSE payload->'compatibleAgents'
  END,
  true
)
WHERE id IN (
  'employee-policy-search',
  'document-summarization',
  'onboarding-guidance',
  'data-extraction',
  'citation-builder',
  'incident-triage',
  'infrastructure-change-review',
  'customer-conversation-summary',
  'knowledge-answering',
  'skill-sql-query',
  'skill-code-generation',
  'skill-web-research',
  'helm-chart-developer',
  'kubernetes-expert',
  'ocp-expert'
);
