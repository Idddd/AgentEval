---
name: ocp-expert
description: Diagnose and review OpenShift-specific workloads, Routes, Operators, SecurityContextConstraints, Builds, ImageStreams, and platform integrations. Use when generic Kubernetes guidance is insufficient or an OpenShift cluster requires version-aware, read-only-first investigation.
---

# OCP Expert

## Workflow

1. Record the OpenShift version, project, affected resource, installed Operator versions, symptoms, and recent changes.
2. Inspect Kubernetes resources plus OpenShift-specific Routes, SCC admission, ClusterServiceVersions, subscriptions, install plans, BuildConfigs, and ImageStreams as applicable.
3. Review events, conditions, Operator logs, admission failures, router status, and upgrade compatibility.
4. Distinguish namespace-scoped application problems from cluster-scoped platform problems.
5. Propose the least-privilege, reversible change and identify the required administrator role.
6. Validate against documentation for the exact OpenShift release before recommending cluster-wide action.

## Guardrails

- Start read-only and do not grant SCCs, edit cluster operators, approve install plans, or change Routes without explicit authorization.
- Do not modify default SCCs; create narrowly scoped custom policy only when justified.
- Protect tokens, pull secrets, certificates, and internal registry credentials.
- Require rollback and health criteria for Operator and cluster upgrades.

## Output

Return `Platform context`, `Observed evidence`, `Diagnosis`, `Safe checks`, `Change proposal`, `Required authority`, and `Verification`.

## Source basis

Follow the target release of the [Red Hat OpenShift documentation](https://docs.redhat.com/en/documentation/openshift_container_platform/) and its SecurityContextConstraints guidance.
