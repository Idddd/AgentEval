CREATE TYPE tasklattice.mcp_discovery_status AS ENUM (
  'HEALTHY',
  'PERMISSION_REQUIRED',
  'UNCHECKED',
  'UNAVAILABLE'
);

ALTER TABLE tasklattice.mcp_servers
  ADD COLUMN discovery_status tasklattice.mcp_discovery_status NOT NULL DEFAULT 'UNCHECKED',
  ADD COLUMN last_discovery_attempt_at TIMESTAMPTZ(6),
  ADD COLUMN last_discovered_at TIMESTAMPTZ(6),
  ADD COLUMN last_discovery_error TEXT;

CREATE TABLE tasklattice.mcp_tools (
  project_id TEXT NOT NULL,
  mcp_server_id TEXT NOT NULL,
  name TEXT NOT NULL,
  title TEXT,
  description TEXT,
  input_schema JSONB NOT NULL,
  output_schema JSONB,
  annotations JSONB,
  discovered_at TIMESTAMPTZ(6) NOT NULL,
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT mcp_tools_pkey PRIMARY KEY (project_id, mcp_server_id, name),
  CONSTRAINT mcp_tools_server_fkey
    FOREIGN KEY (project_id, mcp_server_id)
    REFERENCES tasklattice.mcp_servers(project_id, id)
    ON DELETE CASCADE
);

CREATE INDEX mcp_tools_project_id_mcp_server_id_idx
  ON tasklattice.mcp_tools(project_id, mcp_server_id);

INSERT INTO tasklattice.mcp_tools (
  project_id,
  mcp_server_id,
  name,
  description,
  input_schema,
  annotations,
  discovered_at
)
SELECT
  server.project_id,
  fixture.mcp_server_id,
  fixture.name,
  fixture.description,
  '{"type":"object","properties":{}}'::jsonb,
  fixture.annotations::jsonb,
  '2026-07-25T00:00:00.000Z'::timestamptz
FROM tasklattice.mcp_servers AS server
JOIN (
  VALUES
    ('hr-knowledge-base', 'search_policies', 'Search the approved employee policy collection.', '{"readOnlyHint":true}'),
    ('hr-knowledge-base', 'read_policy', 'Read one approved policy document.', '{"readOnlyHint":true}'),
    ('hr-knowledge-base', 'list_policy_categories', 'List available policy categories.', '{"readOnlyHint":true}'),
    ('workday', 'get_employee_profile', 'Read the current employee profile.', '{"readOnlyHint":true}'),
    ('workday', 'list_time_off', 'List approved and pending time-off entries.', '{"readOnlyHint":true}'),
    ('workday', 'get_org_chart', 'Read reporting relationships.', '{"readOnlyHint":true}'),
    ('slack', 'search_messages', 'Search messages in approved channels.', '{"readOnlyHint":true,"openWorldHint":true}'),
    ('slack', 'read_thread', 'Read a Slack conversation thread.', '{"readOnlyHint":true,"openWorldHint":true}'),
    ('slack', 'post_message', 'Post a message to an approved channel.', '{"openWorldHint":true}'),
    ('google-drive', 'search_files', 'Search files visible to the Project.', '{"readOnlyHint":true}'),
    ('google-drive', 'read_file', 'Read an approved file.', '{"readOnlyHint":true}'),
    ('google-drive', 'list_folder', 'List items in an approved folder.', '{"readOnlyHint":true}'),
    ('mcp-github-tools', 'search_repositories', 'Search repositories visible to the connected account.', '{"readOnlyHint":true}'),
    ('mcp-github-tools', 'create_issue', 'Create an issue in an approved repository.', '{}'),
    ('mcp-github-tools', 'merge_pull_request', 'Merge an approved pull request.', '{"destructiveHint":true}'),
    ('mcp-data-warehouse', 'list_datasets', 'List governed analytics datasets.', '{"readOnlyHint":true}'),
    ('mcp-data-warehouse', 'describe_table', 'Read a table schema.', '{"readOnlyHint":true}'),
    ('mcp-data-warehouse', 'run_readonly_query', 'Execute a governed read-only query.', '{"readOnlyHint":true}')
) AS fixture(mcp_server_id, name, description, annotations)
  ON server.id = fixture.mcp_server_id
ON CONFLICT (project_id, mcp_server_id, name) DO NOTHING;

UPDATE tasklattice.mcp_servers
SET
  discovery_status = 'HEALTHY',
  last_discovery_attempt_at = '2026-07-25T00:00:00.000Z'::timestamptz,
  last_discovered_at = '2026-07-25T00:00:00.000Z'::timestamptz,
  last_discovery_error = NULL
WHERE id IN (
  'hr-knowledge-base',
  'workday',
  'slack',
  'google-drive',
  'mcp-github-tools',
  'mcp-data-warehouse'
);
