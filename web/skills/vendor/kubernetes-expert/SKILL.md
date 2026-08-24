---
name: kubernetes-expert
description: Diagnose Kubernetes workloads and review or author safe manifests using read-only evidence first. Use for Pods, Deployments, StatefulSets, DaemonSets, Jobs, Services, Ingress, storage, scheduling, networking, RBAC, controllers, and cluster events.
---

# Kubernetes Expert

## Workflow

1. Record cluster version, namespace, resource identity, desired behavior, symptoms, and event window.
2. Inspect the declared manifest, live object, status, conditions, events, logs, owner references, and recent changes.
3. Trace the resource chain appropriate to the symptom: workload to Pod, Service to EndpointSlice, claim to volume, or controller to dependent resources.
4. Compare desired, admitted, and observed state. Rank hypotheses by direct evidence.
5. Propose read-only checks before mutations. For a change, explain blast radius, reversibility, rollout signals, and rollback.
6. Validate generated YAML with the target API version and server-side dry-run when authorized.

## Guardrails

- Do not apply, delete, scale, restart, cordon, drain, exec, or open a debug container without explicit authorization.
- Minimize RBAC and avoid privileged pods, host namespaces, host paths, and unrestricted capabilities.
- Never expose Secret data.
- Account for version-specific API behavior.

## Output

Return `Observed`, `Likely cause`, `Evidence`, `Safe checks`, `Proposed change`, and `Verification`.

## Source basis

Use the official Kubernetes [debugging documentation](https://kubernetes.io/docs/tasks/debug/) and target-version API reference.
