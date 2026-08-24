-- MCP and Knowledge Base integrations are now real LiteLLM resources.
-- Development seed records from the former direct-client/simulated retrieval
-- implementations cannot be reconciled safely.
DELETE FROM "tasklattice"."mcp_tools";
DELETE FROM "tasklattice"."mcp_servers";
DELETE FROM "tasklattice"."knowledge_sources";

ALTER TABLE "tasklattice"."mcp_servers"
  ADD COLUMN "litellm_server_id" TEXT NOT NULL;

CREATE UNIQUE INDEX "mcp_servers_litellm_server_id_key"
  ON "tasklattice"."mcp_servers"("litellm_server_id");
