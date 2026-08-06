UPDATE tasklattice.skills AS skill
SET payload = skill.payload || jsonb_build_object(
  'author', COALESCE(skill.payload -> 'author', to_jsonb(metadata.author)),
  'problemStatement', COALESCE(skill.payload -> 'problemStatement', to_jsonb(metadata.problem_statement)),
  'useCases', COALESCE(skill.payload -> 'useCases', metadata.use_cases),
  'usageGuide', COALESCE(skill.payload -> 'usageGuide', to_jsonb(metadata.usage_guide)),
  'updatedAt', COALESCE(
    skill.payload -> 'updatedAt',
    to_jsonb(to_char(skill.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
  )
)
FROM (
  VALUES
    (
      'employee-policy-search',
      'People Operations',
      'Employees lose time searching across policy documents and may act on outdated or incomplete guidance.',
      '["Answer leave, benefits, and workplace policy questions", "Locate the approved policy behind an HR answer"]'::jsonb,
      'Connect an approved HR knowledge source, then ask a specific policy question. The Skill returns an answer with the relevant policy context for review.'
    ),
    (
      'document-summarization',
      'TaskLattice Knowledge',
      'Long internal documents are difficult to review quickly and important decisions can be hidden in supporting detail.',
      '["Create an executive summary of an internal document", "Extract decisions, risks, and follow-up actions from a report"]'::jsonb,
      'Provide one or more approved documents and specify the audience and desired level of detail. Review cited source sections before sharing the summary.'
    ),
    (
      'onboarding-guidance',
      'People Operations',
      'New hires receive fragmented onboarding instructions and managers repeat the same coordination work.',
      '["Guide a new hire through their first-week checklist", "Answer role-specific onboarding questions"]'::jsonb,
      'Provide the employee role, location, and start date. Connect the approved onboarding knowledge source before requesting a personalized checklist.'
    ),
    (
      'data-extraction',
      'TaskLattice Data',
      'Operational data arrives in inconsistent documents and forms that cannot be processed reliably by downstream systems.',
      '["Extract invoice or form fields into JSON", "Normalize repeated document fields for a workflow"]'::jsonb,
      'Provide the source document and the expected field schema. Validate required fields and confidence-sensitive values before sending the result downstream.'
    ),
    (
      'citation-builder',
      'Knowledge Team',
      'Research claims are difficult to audit when evidence links and source context are assembled manually.',
      '["Add traceable evidence to a research brief", "Normalize source references collected by multiple Agents"]'::jsonb,
      'Pass the research findings together with their source URLs or documents. The Skill produces normalized citations and flags claims without supporting evidence.'
    ),
    (
      'incident-triage',
      'TaskLattice Operations',
      'Responders spend critical time correlating alerts, logs, and recent changes before they can choose the next action.',
      '["Prepare the first incident briefing", "Correlate alerts with recent infrastructure changes"]'::jsonb,
      'Connect read-only observability sources and provide the alert context. Use the generated summary as evidence for a responder, not as authorization to execute changes.'
    ),
    (
      'infrastructure-change-review',
      'Platform Operations',
      'Infrastructure changes can bypass operational conventions or introduce risks that are difficult to spot during manual review.',
      '["Review a pull request containing infrastructure changes", "Check a deployment plan against platform safeguards"]'::jsonb,
      'Provide the proposed diff and target environment. Connect the relevant policy source, then review every warning before approving the change.'
    ),
    (
      'customer-conversation-summary',
      'TaskLattice Customer Experience',
      'Support teams lose context when long conversations are handed between people or Agents.',
      '["Create a handoff summary for another support owner", "Extract the customer''s goal, blockers, and promised actions"]'::jsonb,
      'Provide the conversation transcript and optional account context. Confirm sensitive details are appropriate for the destination before sharing the summary.'
    ),
    (
      'knowledge-answering',
      'Customer Experience',
      'Support answers become inconsistent when Agents rely on memory instead of the current approved knowledge base.',
      '["Answer a product usage question", "Explain an approved troubleshooting procedure"]'::jsonb,
      'Attach an approved product knowledge source and ask a focused question. The Skill should be configured to cite the material used for the answer.'
    ),
    (
      'skill-sql-query',
      'TaskLattice Data',
      'Agents need structured business data but unrestricted SQL access creates correctness and security risks.',
      '["Answer a reporting question from an approved database", "Retrieve read-only records for another workflow step"]'::jsonb,
      'Connect a read-only database identity, describe the required result, and review the generated query and row limits before execution.'
    ),
    (
      'skill-code-generation',
      'Developer Experience',
      'Engineering tasks require repetitive code changes, but generated patches need explicit repository and execution boundaries.',
      '["Draft a scoped implementation from an issue", "Refactor code and produce a reviewable patch"]'::jsonb,
      'Attach the Skill only to an isolated development Agent. Provide repository scope, acceptance criteria, and allowed commands; review the patch and tests before merging.'
    ),
    (
      'skill-web-research',
      'Knowledge Team',
      'Open-web research is slow to reproduce and conclusions are easy to separate from their original sources.',
      '["Investigate a current technical topic", "Collect sources for a market or product comparison"]'::jsonb,
      'State the research question, date sensitivity, and source constraints. Review source quality and publication dates before accepting the synthesized findings.'
    ),
    (
      'helm-chart-developer',
      'Platform Engineering',
      'Helm changes are difficult to validate across environments and template mistakes often appear only during deployment.',
      '["Create or update a Helm chart", "Diagnose rendering and values override problems"]'::jsonb,
      'Provide the chart, target Kubernetes versions, and environment values. Render and lint the result before allowing any cluster deployment.'
    ),
    (
      'kubernetes-expert',
      'Platform Engineering',
      'Kubernetes failures require correlating manifests, runtime state, and platform constraints without granting unnecessary write access.',
      '["Diagnose a failing workload", "Draft a safe Kubernetes manifest or operational change"]'::jsonb,
      'Start with read-only cluster context and the affected manifests. Require operator approval before applying generated changes to a cluster.'
    ),
    (
      'ocp-expert',
      'Platform Engineering',
      'OpenShift adds platform-specific security and lifecycle behavior that generic Kubernetes guidance can miss.',
      '["Troubleshoot Routes, Operators, or SCC behavior", "Review an OpenShift-specific deployment plan"]'::jsonb,
      'Provide the cluster version, namespace, relevant resources, and read-only diagnostics. Escalate SCC or cluster-wide changes for explicit approval.'
    )
) AS metadata(id, author, problem_statement, use_cases, usage_guide)
WHERE skill.id = metadata.id
  AND (
    NOT skill.payload ? 'author'
    OR NOT skill.payload ? 'problemStatement'
    OR NOT skill.payload ? 'useCases'
    OR NOT skill.payload ? 'usageGuide'
    OR NOT skill.payload ? 'updatedAt'
  );

UPDATE tasklattice.skills
SET payload = payload || jsonb_build_object(
  'author', COALESCE(payload -> 'author', to_jsonb(payload ->> 'owner')),
  'problemStatement', COALESCE(payload -> 'problemStatement', to_jsonb(payload ->> 'description')),
  'useCases', COALESCE(payload -> 'useCases', jsonb_build_array(payload ->> 'description')),
  'usageGuide', COALESCE(
    payload -> 'usageGuide',
    to_jsonb('Attach this Skill to a compatible Agent, provide the required context, and review its output before using it in a downstream action.'::text)
  ),
  'updatedAt', COALESCE(
    payload -> 'updatedAt',
    to_jsonb(to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
  )
)
WHERE NOT payload ? 'author'
   OR NOT payload ? 'problemStatement'
   OR NOT payload ? 'useCases'
   OR NOT payload ? 'usageGuide'
   OR NOT payload ? 'updatedAt';
