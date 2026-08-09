ALTER TABLE tasklattice.extension_skills RENAME TO skills;
ALTER TABLE tasklattice.extension_mcp_servers RENAME TO mcp_servers;
ALTER TABLE tasklattice.extension_knowledge_sources RENAME TO knowledge_sources;

ALTER TABLE tasklattice.skills
  RENAME CONSTRAINT extension_skills_pkey TO skills_pkey;
ALTER TABLE tasklattice.mcp_servers
  RENAME CONSTRAINT extension_mcp_servers_pkey TO mcp_servers_pkey;
ALTER TABLE tasklattice.knowledge_sources
  RENAME CONSTRAINT extension_knowledge_sources_pkey TO knowledge_sources_pkey;
