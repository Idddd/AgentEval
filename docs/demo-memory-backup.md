# Shared demo memory and backup

Run one Pod with one Node server process. The image and Helm chart set
`MARKETPLACE_DEMO_STORAGE=memory`, which uses a single process-wide SQLite
`:memory:` connection and ignores any legacy `MARKETPLACE_DEMO_DB_FILE` value.
No PVC or writable database directory is required. Normal browser refreshes
retain data, and connected users refresh shared state every three seconds.
Restarting the server clears the database. Multiple Pods do not share memory.

The Helm chart enforces `replicaCount=1` and uses Recreate updates. It no longer
mounts or creates a database volume. Existing retained PVCs are not deleted or
read. For an existing manually managed Deployment, set
`MARKETPLACE_DEMO_STORAGE=memory`, use one replica, and remove an obsolete data
volume claim if it prevents the Pod from starting. On OpenShift, use
`openshift.enabled=true` with the chart so the cluster assigns the runtime UID.

Open `/api/demo-backup` on the same host for the maintenance page. It is not
linked from normal demo screens. Export downloads a JSON snapshot containing
all Guardrails, Profiles, versions, evaluation results and retained activity.
Import validates the file and atomically replaces shared cases after confirmation.
Concurrent changes reject the import instead of silently overwriting them;
select the file again to retry. Export before restoring if you need to keep the
current state. The hidden URL is not authentication: it has the same deployment
access restrictions as the demo API. The maintenance page is disabled in live mode.

If SQLite cannot open or fails during reads/writes, the process automatically
continues with shared JavaScript memory, preserving its most recent successful
snapshot and revision. The failed storage is not retried on every request.
Export and import remain available. If no data could be read before failure,
the normal default cases initialize on the first page visit. Infrastructure
outages or resource exhaustion can still cause service errors. Fallback events
are logged on the server; validation and conflicting edits still reject unsafe
writes instead of overwriting another user's work.
