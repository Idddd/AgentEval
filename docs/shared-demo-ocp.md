# Shared SQLite demo (enabled by default since 0.2.9)

Existing deployments are not modified automatically. Do not retag or overwrite released images.
The 0.2.9 chart enables sharedDemo by default. The original v0.2.8 tag still
requires sharedDemo.enabled=true. Container-only deployments must set
MARKETPLACE_DEMO_DB_FILE to a writable SQLite path.

The demo uses one SQLite table to store the catalog and its revision. One replica
and Recreate upgrades avoid concurrent writers and volume attachment conflicts.
Without a PVC, SQLite is stored on an emptyDir: browser refresh and container
restart keep data, but Pod replacement, deletion, or rollout can lose it.
An optional PVC keeps data across Pod replacement/upgrades. Do not delete that PVC.

## OCP values for a future upgrade

```yaml
replicaCount: 1
marketplace:
  dataMode: mock
  publicOrigin: https://your-demo-route.example.com
persistence:
  enabled: false # No PVC required; enable only when durable volume is available
  existingClaim: "" # Or an existing writable PVC
  size: 1Gi
  storageClass: "" # Uses cluster default; choose an OCP-supported filesystem class
sharedDemo:
  enabled: true # Default; no extra switch needed with the updated chart
openshift:
  enabled: true
  route:
    enabled: false # Keep the existing Route; enable only when creating a new one
```

OCP supplies the permitted user/group via SCC; the chart omits fixed UID/GID/fsGroup
when openshift.enabled=true. The mounted data directory must be writable by that identity.
No privileged container, root init container, or database service is needed.
Use a filesystem supporting SQLite locking. Back up the PVC/database before upgrades.

## Initial migration

First visit after enabling persistence initializes an empty server database using
that browser's existing demo records (or seeded examples if it has no records).
Use the browser containing the desired data first. Once initialized, other browser
caches cannot replace the shared catalog. Clearing browser storage does not reset
the database. Updates poll every three seconds; stale saves are rejected.
The first browser data remains locally available as a rollback copy.

No data is sent to real evaluation providers. Source identifiers in old records
are retained internally for backward reading only; the UI and new evaluation flow
are unified. Security accounts migrate to Admin; Compliance migrates to LCS.

This is a trusted shared demo: account switching is not authentication. Restrict
the Route using your organization's authentication/access controls. Set publicOrigin
to the exact external HTTPS origin so mutation origin checks work behind OCP routing.

## Local development

Set MARKETPLACE_DATA_MODE=mock and MARKETPLACE_DEMO_DB_FILE to an absolute SQLite
path outside the build output, then start the existing Node service. Without the
database setting the old browser-local mode stays enabled. Never use /tmp for the
persistent database in deployed containers.

Before rollout: verify two browsers see updates and reload. With a PVC, also replace
the Pod and verify saved/deleted records remain correct. Test on a separate release
first; no live-cluster deployment has been performed by this implementation task.
