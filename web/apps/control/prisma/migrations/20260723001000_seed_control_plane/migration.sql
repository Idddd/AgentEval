INSERT INTO tasklattice.users
    (id, username, email, display_name, auth_provider)
   VALUES ('local-admin', 'admin', 'admin@tasklattice.local', 'Local Administrator', 'local')
   ON CONFLICT (id) DO NOTHING;

INSERT INTO tasklattice.projects
    (id, name, type, created_by)
   VALUES ('individual', 'admin', 'personal', 'local-admin')
   ON CONFLICT (id) DO NOTHING;

INSERT INTO tasklattice.project_members
    (project_id, user_id, role)
   VALUES ('individual', 'local-admin', 'admin')
   ON CONFLICT (project_id, user_id) DO NOTHING;

INSERT INTO tasklattice.extension_skills (project_id, id, payload, sort_order)
       VALUES ('individual', 'employee-policy-search', '{"id":"employee-policy-search","name":"Employee Policy Search","description":"Find and answer questions about company HR policies.","category":"HR","version":"1.2.0","endpoint":"https://skills.internal.example/employee-policy-search.tar.zst","digest":"sha256:1d83…8d12","owner":"People Operations","permissions":1,"bindings":0,"status":"PUBLISHED"}'::jsonb, 0)
       ON CONFLICT (project_id, id) DO NOTHING;

INSERT INTO tasklattice.extension_skills (project_id, id, payload, sort_order)
       VALUES ('individual', 'document-summarization', '{"id":"document-summarization","name":"Document Summarization","description":"Summarize HR documents and reports.","category":"Knowledge","version":"2.0.1","endpoint":"https://skills.internal.example/document-summarization.tar.zst","digest":"sha256:b92f…3b06","owner":"Knowledge Team","permissions":1,"bindings":0,"status":"PUBLISHED"}'::jsonb, 1)
       ON CONFLICT (project_id, id) DO NOTHING;

INSERT INTO tasklattice.extension_skills (project_id, id, payload, sort_order)
       VALUES ('individual', 'onboarding-guidance', '{"id":"onboarding-guidance","name":"Onboarding Guidance","description":"Guide new hires through onboarding steps and resources.","category":"HR","version":"1.1.0","endpoint":"https://skills.internal.example/onboarding-guidance.tar.zst","digest":"sha256:8aa7…011c","owner":"People Operations","permissions":2,"bindings":0,"status":"PUBLISHED"}'::jsonb, 2)
       ON CONFLICT (project_id, id) DO NOTHING;

INSERT INTO tasklattice.extension_skills (project_id, id, payload, sort_order)
       VALUES ('individual', 'data-extraction', '{"id":"data-extraction","name":"Data Extraction","description":"Extract structured data from documents and forms.","category":"Data","version":"1.3.0","endpoint":"https://skills.internal.example/data-extraction.tar.zst","digest":"sha256:f6f1…1c0d","owner":"Data Platform","permissions":2,"bindings":0,"status":"PUBLISHED"}'::jsonb, 3)
       ON CONFLICT (project_id, id) DO NOTHING;

INSERT INTO tasklattice.extension_skills (project_id, id, payload, sort_order)
       VALUES ('individual', 'citation-builder', '{"id":"citation-builder","name":"Citation Builder","description":"Create traceable citations for research findings.","category":"Research","version":"1.5.0","endpoint":"https://skills.internal.example/citation-builder.tar.zst","digest":"sha256:2c81…77f2","owner":"Knowledge Team","permissions":1,"bindings":0,"status":"PUBLISHED"}'::jsonb, 4)
       ON CONFLICT (project_id, id) DO NOTHING;

INSERT INTO tasklattice.extension_skills (project_id, id, payload, sort_order)
       VALUES ('individual', 'incident-triage', '{"id":"incident-triage","name":"Incident Triage","description":"Triage service alerts and assemble an evidence-backed incident summary.","category":"Operations","version":"2.2.0","endpoint":"https://skills.internal.example/incident-triage.tar.zst","digest":"sha256:8a20…5f02","owner":"Platform Operations","permissions":3,"bindings":0,"status":"PUBLISHED"}'::jsonb, 5)
       ON CONFLICT (project_id, id) DO NOTHING;

INSERT INTO tasklattice.extension_skills (project_id, id, payload, sort_order)
       VALUES ('individual', 'infrastructure-change-review', '{"id":"infrastructure-change-review","name":"Infrastructure Change Review","description":"Review infrastructure changes against operational safeguards.","category":"Operations","version":"1.8.0","endpoint":"https://skills.internal.example/infrastructure-change-review.tar.zst","digest":"sha256:22d4…10ac","owner":"Platform Operations","permissions":4,"bindings":0,"status":"PUBLISHED"}'::jsonb, 6)
       ON CONFLICT (project_id, id) DO NOTHING;

INSERT INTO tasklattice.extension_skills (project_id, id, payload, sort_order)
       VALUES ('individual', 'customer-conversation-summary', '{"id":"customer-conversation-summary","name":"Customer Conversation Summary","description":"Summarize customer conversations and identify the requested outcome.","category":"Customer Support","version":"1.4.0","endpoint":"https://skills.internal.example/customer-conversation-summary.tar.zst","digest":"sha256:51b9…70ee","owner":"Customer Experience","permissions":2,"bindings":0,"status":"PUBLISHED"}'::jsonb, 7)
       ON CONFLICT (project_id, id) DO NOTHING;

INSERT INTO tasklattice.extension_skills (project_id, id, payload, sort_order)
       VALUES ('individual', 'knowledge-answering', '{"id":"knowledge-answering","name":"Knowledge Answering","description":"Answer product questions using approved support knowledge.","category":"Customer Support","version":"2.3.0","endpoint":"https://skills.internal.example/knowledge-answering.tar.zst","digest":"sha256:64cc…c501","owner":"Customer Experience","permissions":1,"bindings":0,"status":"PUBLISHED"}'::jsonb, 8)
       ON CONFLICT (project_id, id) DO NOTHING;

INSERT INTO tasklattice.extension_skills (project_id, id, payload, sort_order)
       VALUES ('individual', 'skill-sql-query', '{"id":"skill-sql-query","name":"SQL Query","description":"Run governed read-only queries and return structured results.","category":"Data","version":"1.4.2","endpoint":"https://skills.internal.example/sql-query.tar.zst","digest":"sha256:9a76…12f4","owner":"Data Platform","permissions":2,"bindings":0,"status":"PUBLISHED"}'::jsonb, 9)
       ON CONFLICT (project_id, id) DO NOTHING;

INSERT INTO tasklattice.extension_skills (project_id, id, payload, sort_order)
       VALUES ('individual', 'skill-code-generation', '{"id":"skill-code-generation","name":"Code Generation","description":"Generate and revise code inside an approved project boundary.","category":"Developer Tools","version":"0.9.0","endpoint":"https://skills.internal.example/code-generation.tar.zst","digest":"Pending source check","owner":"Developer Experience","permissions":4,"bindings":0,"status":"DRAFT"}'::jsonb, 10)
       ON CONFLICT (project_id, id) DO NOTHING;

INSERT INTO tasklattice.extension_skills (project_id, id, payload, sort_order)
       VALUES ('individual', 'skill-web-research', '{"id":"skill-web-research","name":"Web Research","description":"Collect public sources and produce citation-backed research notes.","category":"Research","version":"2.1.0","endpoint":"https://skills.internal.example/web-research.tar.zst","digest":"sha256:4bd3…88a1","owner":"Knowledge Team","permissions":3,"bindings":0,"status":"PUBLISHED"}'::jsonb, 11)
       ON CONFLICT (project_id, id) DO NOTHING;

INSERT INTO tasklattice.extension_skills (project_id, id, payload, sort_order)
       VALUES ('individual', 'helm-chart-developer', '{"id":"helm-chart-developer","name":"Helm Chart Developer","description":"Design, review, and troubleshoot Helm charts, templates, values, and release packaging.","category":"Developer Tools","version":"1.0.0","endpoint":"https://skills.internal.example/helm-chart-developer.tar.zst","digest":"sha256:development-seed-helm","owner":"Platform Engineering","permissions":3,"bindings":0,"status":"PUBLISHED"}'::jsonb, 12)
       ON CONFLICT (project_id, id) DO NOTHING;

INSERT INTO tasklattice.extension_skills (project_id, id, payload, sort_order)
       VALUES ('individual', 'kubernetes-expert', '{"id":"kubernetes-expert","name":"Kubernetes Expert","description":"Diagnose Kubernetes workloads and author safe manifests, controllers, and operational changes.","category":"Developer Tools","version":"1.0.0","endpoint":"https://skills.internal.example/kubernetes-expert.tar.zst","digest":"sha256:development-seed-kubernetes","owner":"Platform Engineering","permissions":4,"bindings":0,"status":"PUBLISHED"}'::jsonb, 13)
       ON CONFLICT (project_id, id) DO NOTHING;

INSERT INTO tasklattice.extension_skills (project_id, id, payload, sort_order)
       VALUES ('individual', 'ocp-expert', '{"id":"ocp-expert","name":"OCP Expert","description":"Operate OpenShift clusters with expertise in Routes, Operators, SCCs, and platform-specific workflows.","category":"Operations","version":"1.0.0","endpoint":"https://skills.internal.example/ocp-expert.tar.zst","digest":"sha256:development-seed-ocp","owner":"Platform Engineering","permissions":4,"bindings":0,"status":"PUBLISHED"}'::jsonb, 14)
       ON CONFLICT (project_id, id) DO NOTHING;

INSERT INTO tasklattice.extension_mcp_servers (project_id, id, payload, sort_order)
       VALUES ('individual', 'hr-knowledge-base', '{"id":"hr-knowledge-base","name":"HR Knowledge Base","endpoint":"https://mcp.internal.example/hr-knowledge","transport":"Streamable HTTP","authReference":"vault://people/hr-knowledge","parameters":"{\n  \"scope\": \"employee-handbook\"\n}","status":"HEALTHY","tools":6}'::jsonb, 0)
       ON CONFLICT (project_id, id) DO NOTHING;

INSERT INTO tasklattice.extension_mcp_servers (project_id, id, payload, sort_order)
       VALUES ('individual', 'workday', '{"id":"workday","name":"Workday","endpoint":"https://mcp.internal.example/workday","transport":"Streamable HTTP","authReference":"vault://people/workday-reader","parameters":"{\n  \"access\": \"employee-read\"\n}","status":"HEALTHY","tools":9}'::jsonb, 1)
       ON CONFLICT (project_id, id) DO NOTHING;

INSERT INTO tasklattice.extension_mcp_servers (project_id, id, payload, sort_order)
       VALUES ('individual', 'slack', '{"id":"slack","name":"Slack","endpoint":"https://mcp.internal.example/slack","transport":"Streamable HTTP","authReference":"Not configured","parameters":"{\n  \"channels\": []\n}","status":"UNCHECKED","tools":14}'::jsonb, 2)
       ON CONFLICT (project_id, id) DO NOTHING;

INSERT INTO tasklattice.extension_mcp_servers (project_id, id, payload, sort_order)
       VALUES ('individual', 'google-drive', '{"id":"google-drive","name":"Google Drive","endpoint":"https://mcp.internal.example/google-drive","transport":"Streamable HTTP","authReference":"vault://project/google-drive-reader","parameters":"{\n  \"access\": \"read-only\"\n}","status":"HEALTHY","tools":8}'::jsonb, 3)
       ON CONFLICT (project_id, id) DO NOTHING;

INSERT INTO tasklattice.extension_mcp_servers (project_id, id, payload, sort_order)
       VALUES ('individual', 'mcp-github-tools', '{"id":"mcp-github-tools","name":"GitHub Tools","endpoint":"https://mcp.internal.example/github","transport":"Streamable HTTP","authReference":"vault://platform/github-readonly","parameters":"{\n  \"toolsets\": [\"repos\", \"issues\", \"pull_requests\"]\n}","status":"HEALTHY","tools":18}'::jsonb, 4)
       ON CONFLICT (project_id, id) DO NOTHING;

INSERT INTO tasklattice.extension_mcp_servers (project_id, id, payload, sort_order)
       VALUES ('individual', 'mcp-data-warehouse', '{"id":"mcp-data-warehouse","name":"Data Warehouse","endpoint":"https://mcp.internal.example/warehouse/events","transport":"SSE","authReference":"vault://data/warehouse-reader","parameters":"{\n  \"database\": \"analytics\",\n  \"readOnly\": true\n}","status":"UNCHECKED","tools":7}'::jsonb, 5)
       ON CONFLICT (project_id, id) DO NOTHING;

INSERT INTO tasklattice.extension_knowledge_sources (project_id, id, payload, sort_order)
       VALUES ('individual', 'company-hr-handbook', '{"id":"company-hr-handbook","name":"Company HR Handbook","description":"Current company policies, benefits, onboarding, and people operations guidance.","endpoint":"https://knowledge.internal.example/hr-handbook","mode":"Hybrid","authReference":"vault://knowledge/hr-handbook","status":"READY","topK":8}'::jsonb, 0)
       ON CONFLICT (project_id, id) DO NOTHING;

INSERT INTO tasklattice.extension_knowledge_sources (project_id, id, payload, sort_order)
       VALUES ('individual', 'research-library', '{"id":"research-library","name":"Research Library","description":"Approved research sources and internal citation guidance.","endpoint":"https://knowledge.internal.example/research-library","mode":"Hybrid","authReference":"vault://knowledge/research-library","status":"READY","topK":10}'::jsonb, 1)
       ON CONFLICT (project_id, id) DO NOTHING;

INSERT INTO tasklattice.extension_knowledge_sources (project_id, id, payload, sort_order)
       VALUES ('individual', 'support-handbook', '{"id":"support-handbook","name":"Support Handbook","description":"Product support policies, troubleshooting guides, and escalation paths.","endpoint":"https://knowledge.internal.example/support-handbook","mode":"Hybrid","authReference":"vault://knowledge/support-handbook","status":"READY","topK":8}'::jsonb, 2)
       ON CONFLICT (project_id, id) DO NOTHING;

INSERT INTO tasklattice.extension_knowledge_sources (project_id, id, payload, sort_order)
       VALUES ('individual', 'kb-product-docs', '{"id":"kb-product-docs","name":"Product Documentation","description":"Published product specifications, runbooks, and release notes.","endpoint":"https://knowledge.internal.example/v1/search","mode":"Hybrid","authReference":"vault://knowledge/product-docs","status":"READY","topK":8}'::jsonb, 3)
       ON CONFLICT (project_id, id) DO NOTHING;

INSERT INTO tasklattice.extension_knowledge_sources (project_id, id, payload, sort_order)
       VALUES ('individual', 'kb-incident-history', '{"id":"kb-incident-history","name":"Incident History","description":"Resolved incident timelines and operational learning notes.","endpoint":"https://knowledge.internal.example/incidents/query","mode":"Vector","authReference":"vault://knowledge/incidents","status":"UNCHECKED","topK":5}'::jsonb, 4)
       ON CONFLICT (project_id, id) DO NOTHING;

INSERT INTO tasklattice.agent_specializations (project_id, id, payload, sort_order)
       VALUES ('individual', 'general-purpose', '{"id":"general-purpose","name":"General Purpose","roleLabel":"General Assistant","icon":"sparkles","description":"A flexible Agent that starts without preselected capabilities.","systemPrompt":"You are a focused internal assistant. Complete the user''s request inside the OpenShell sandbox and explain the evidence clearly.","defaultSkillIds":[],"defaultMcpServerIds":[],"defaultKnowledgeSourceIds":[]}'::jsonb, 0)
       ON CONFLICT (project_id, id) DO NOTHING;

INSERT INTO tasklattice.agent_specializations (project_id, id, payload, sort_order)
       VALUES ('individual', 'hr', '{"id":"hr","name":"HR","roleLabel":"HR Specialist","icon":"users","description":"Provides support for HR policies, employee onboarding, benefits, and internal HR processes.","systemPrompt":"You are an HR support Agent. Answer employee questions using approved company policies and connected knowledge sources. Be clear about policy scope, protect confidential employee data, and escalate decisions that require a People Operations owner.","defaultSkillIds":["employee-policy-search","document-summarization","onboarding-guidance"],"defaultMcpServerIds":["hr-knowledge-base","workday"],"defaultKnowledgeSourceIds":["company-hr-handbook"]}'::jsonb, 1)
       ON CONFLICT (project_id, id) DO NOTHING;

INSERT INTO tasklattice.agent_specializations (project_id, id, payload, sort_order)
       VALUES ('individual', 'research-analyst', '{"id":"research-analyst","name":"Research Analyst","roleLabel":"Research Analyst","icon":"telescope","description":"Collects evidence, compares sources, and produces citation-backed research.","systemPrompt":"You are a research analyst. Investigate the request using approved sources, distinguish evidence from inference, cite material claims, surface uncertainty, and provide a concise decision-ready synthesis.","defaultSkillIds":["skill-web-research","citation-builder","document-summarization"],"defaultMcpServerIds":["mcp-github-tools","google-drive"],"defaultKnowledgeSourceIds":["research-library"]}'::jsonb, 2)
       ON CONFLICT (project_id, id) DO NOTHING;

INSERT INTO tasklattice.agent_specializations (project_id, id, payload, sort_order)
       VALUES ('individual', 'devops-engineer', '{"id":"devops-engineer","name":"DevOps Engineer","roleLabel":"DevOps Engineer","icon":"settings","description":"Investigates operational issues and reviews infrastructure changes safely.","systemPrompt":"You are a DevOps engineering Agent. Diagnose from observable evidence, preserve production safety, explain operational risk, and propose reversible changes with explicit verification and rollback steps.","defaultSkillIds":["incident-triage","infrastructure-change-review","helm-chart-developer","kubernetes-expert","ocp-expert"],"defaultMcpServerIds":["mcp-github-tools","slack"],"defaultKnowledgeSourceIds":["kb-incident-history"]}'::jsonb, 3)
       ON CONFLICT (project_id, id) DO NOTHING;

INSERT INTO tasklattice.agent_specializations (project_id, id, payload, sort_order)
       VALUES ('individual', 'customer-support', '{"id":"customer-support","name":"Customer Support","roleLabel":"Customer Support Specialist","icon":"headphones","description":"Resolves product questions using approved support knowledge and escalation paths.","systemPrompt":"You are a customer support Agent. Understand the customer''s goal, use approved support knowledge, give precise next actions, avoid unsupported claims, and escalate account or product issues that require a human owner.","defaultSkillIds":["customer-conversation-summary","knowledge-answering"],"defaultMcpServerIds":["google-drive","slack"],"defaultKnowledgeSourceIds":["support-handbook"]}'::jsonb, 4)
       ON CONFLICT (project_id, id) DO NOTHING;

INSERT INTO tasklattice.agent_specializations (project_id, id, payload, sort_order)
       VALUES ('individual', 'custom', '{"id":"custom","name":"Custom","roleLabel":"Custom Agent","icon":"briefcase","description":"Define custom instructions and assemble capabilities from the available catalog.","systemPrompt":"","defaultSkillIds":[],"defaultMcpServerIds":[],"defaultKnowledgeSourceIds":[]}'::jsonb, 5)
       ON CONFLICT (project_id, id) DO NOTHING;

INSERT INTO tasklattice.sandbox_policies (project_id, id, payload, created_at)
     VALUES ('individual', 'unrestricted', '{"id":"unrestricted","name":"Unrestricted","description":"Allows arbitrary shell, file creation, modification, and execution inside sandbox-owned writable paths.","networkAccess":"Managed inference · operator-approved outbound destinations","policyYaml":"version: 1\nfilesystem_policy:\n  include_workdir: true\n  read_only:\n    - /usr\n    - /opt\n    - /lib\n    - /proc\n    - /dev/urandom\n    - /etc\n    - /var/log\n  read_write:\n    - /sandbox\n    - /tmp\n    - /dev/null\nlandlock:\n  compatibility: best_effort\nprocess:\n  run_as_user: sandbox\n  run_as_group: sandbox\nnetwork_policies: {}\n","enforcement":"ENFORCE","source":"BUILT_IN","immutable":true}'::jsonb, to_timestamp(0))
     ON CONFLICT (project_id, id) DO NOTHING;

INSERT INTO tasklattice.sandbox_policies (project_id, id, payload, created_at)
     VALUES ('individual', 'restricted', '{"id":"restricted","name":"Restricted","description":"Uses the writable runtime baseline while denying additional outbound destinations by default.","networkAccess":"Managed inference only","policyYaml":"version: 1\nfilesystem_policy:\n  include_workdir: true\n  read_only:\n    - /usr\n    - /opt\n    - /lib\n    - /proc\n    - /dev/urandom\n    - /etc\n    - /var/log\n  read_write:\n    - /sandbox\n    - /tmp\n    - /dev/null\nlandlock:\n  compatibility: best_effort\nprocess:\n  run_as_user: sandbox\n  run_as_group: sandbox\nnetwork_policies: {}\n","enforcement":"ENFORCE","source":"BUILT_IN","immutable":true}'::jsonb, to_timestamp(0))
     ON CONFLICT (project_id, id) DO NOTHING;

INSERT INTO tasklattice.sandbox_policies (project_id, id, payload, created_at)
     VALUES ('individual', 'github-readonly', '{"id":"github-readonly","name":"GitHub Read-only","description":"Allows gh and curl to read the GitHub API while write methods remain denied.","networkAccess":"api.github.com · GET, HEAD, OPTIONS","policyYaml":"version: 1\nfilesystem_policy:\n  include_workdir: true\n  read_only:\n    - /usr\n    - /opt\n    - /lib\n    - /proc\n    - /dev/urandom\n    - /etc\n    - /var/log\n  read_write:\n    - /sandbox\n    - /tmp\n    - /dev/null\nlandlock:\n  compatibility: best_effort\nprocess:\n  run_as_user: sandbox\n  run_as_group: sandbox\nnetwork_policies:\n  github_api:\n    name: github-api\n    endpoints:\n      - host: api.github.com\n        port: 443\n        protocol: rest\n        enforcement: enforce\n        access: read-only\n    binaries:\n      - path: /usr/bin/gh\n      - path: /usr/bin/curl\n","enforcement":"ENFORCE","source":"BUILT_IN","immutable":true}'::jsonb, to_timestamp(0))
     ON CONFLICT (project_id, id) DO NOTHING;

INSERT INTO tasklattice.sandbox_policies (project_id, id, payload, created_at)
     VALUES ('individual', 'github-full-access', '{"id":"github-full-access","name":"GitHub Full Access","description":"Allows every HTTP method and path on the declared GitHub API endpoint.","networkAccess":"api.github.com · all methods and paths","policyYaml":"version: 1\nfilesystem_policy:\n  include_workdir: true\n  read_only:\n    - /usr\n    - /opt\n    - /lib\n    - /proc\n    - /dev/urandom\n    - /etc\n    - /var/log\n  read_write:\n    - /sandbox\n    - /tmp\n    - /dev/null\nlandlock:\n  compatibility: best_effort\nprocess:\n  run_as_user: sandbox\n  run_as_group: sandbox\nnetwork_policies:\n  github_api_full_access:\n    name: github-api-full-access\n    endpoints:\n      - host: api.github.com\n        port: 443\n        protocol: rest\n        enforcement: enforce\n        access: full\n    binaries:\n      - path: /usr/bin/gh\n      - path: /usr/bin/curl\n","enforcement":"ENFORCE","source":"BUILT_IN","immutable":true}'::jsonb, to_timestamp(0))
     ON CONFLICT (project_id, id) DO NOTHING;

INSERT INTO tasklattice.sandbox_policies (project_id, id, payload, created_at)
     VALUES ('individual', 'package-install', '{"id":"package-install","name":"Package Install","description":"Allows package managers to reach the npm and Python package registries.","networkAccess":"npmjs.org · pypi.org · pythonhosted.org","policyYaml":"version: 1\nfilesystem_policy:\n  include_workdir: true\n  read_only:\n    - /usr\n    - /opt\n    - /lib\n    - /proc\n    - /dev/urandom\n    - /etc\n    - /var/log\n  read_write:\n    - /sandbox\n    - /tmp\n    - /dev/null\nlandlock:\n  compatibility: best_effort\nprocess:\n  run_as_user: sandbox\n  run_as_group: sandbox\nnetwork_policies:\n  package_registries:\n    name: package-registries\n    endpoints:\n      - host: registry.npmjs.org\n        port: 443\n      - host: pypi.org\n        port: 443\n      - host: files.pythonhosted.org\n        port: 443\n    binaries:\n      - path: /usr/bin/npm\n      - path: /usr/bin/pip\n      - path: /usr/local/bin/pip\n      - path: /usr/local/bin/uv\n","enforcement":"ENFORCE","source":"BUILT_IN","immutable":true}'::jsonb, to_timestamp(0))
     ON CONFLICT (project_id, id) DO NOTHING;
