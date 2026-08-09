---
name: infrastructure-change-review
description: Review infrastructure-as-code, deployment, networking, identity, and configuration changes for operational and security risk. Use before merging or deploying Terraform, Kubernetes, Helm, CI/CD, cloud, database, and platform changes.
---

# Infrastructure Change Review

## Workflow

1. Identify the target environment, blast radius, maintenance window, dependencies, and rollback owner.
2. Read the complete diff with surrounding configuration. Resolve generated output when templates obscure the actual change.
3. Check identity and least privilege, network exposure, secrets, encryption, persistence, resource limits, availability, observability, upgrade order, and data migration behavior.
4. Verify that the plan is reproducible and that mutable tags, implicit defaults, and environment drift are controlled.
5. Require pre-deployment validation, success signals, rollback triggers, and post-deployment verification.
6. Classify findings as `blocker`, `high`, `medium`, `low`, or `note`, with concrete evidence and remediation.

## Guardrails

- Do not apply, merge, or approve changes unless explicitly authorized.
- Never expose credentials or secret values in review output.
- Prefer reversible, staged changes and least-privilege access.
- State when a conclusion depends on unavailable runtime state.

## Output

Lead with blockers, then risks, validation gaps, rollback readiness, and a clear recommendation.

## Source basis

Use the applicable platform documentation and secure development guidance from the [NIST Secure Software Development Framework](https://csrc.nist.gov/pubs/sp/800/218/final).
