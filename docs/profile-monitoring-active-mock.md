# Profile Monitoring / Active

## Implemented mock contract

- Configuration remains the existing Profile and pinned Guardrail versions. Monitoring is always enabled; Active is independent and requires an Admin decision.
- Request Active records the requester and a configuration snapshot. Only Admin may approve/reject; approval checks the saved snapshot. Editing clears approval. Active profiles remain read-only until deactivated.
- Existing active sample records retain their activation as legacy data; they do not gain a fabricated approval identity. Newly requested activation uses the approval flow.
- Scan records persist with the existing browser/shared mock store. Each record contains a trace ID, profile snapshot, guardrail ID/version, mode, decision, enforcement flag, timestamps, latency, and error details. `providerScanId` is reserved for the provider response.
- One test request produces a monitoring record per Guardrail, plus an active record per Guardrail when Active is on. Both share the trace and configuration snapshot. Monitoring completion is delayed by queue time and never enforces a block.
- Fail-open is the mock's explicit scanner-error behavior. A scanner error is neither an agent application failure nor a rule violation.
- Metrics cover the last 24 hours of retained records (maximum 500 per profile). Rates use completed scan count; latency excludes queue delay. Per-Guardrail rows use the selected version. Activity retains older-version evidence.
- Existing profiles receive initial safe, violation, and timeout examples once. New profiles start without traffic. Queued/completed state is timestamp-derived and survives refresh.

## Future integration boundary

Replace `trafficEvents` with an execution service and map its response into `ScanEvent`; keep the UI dependent on this normalized record rather than provider JSON. Store approval and scope metadata in the UI backend database. Map each profile revision to provider configuration, and each Guardrail to provider scanner/rule IDs.

Active should call the scanner before releasing traffic; Monitoring should publish the same captured payload/version reference to a durable queue and run independently. F5 flag-only behavior does not itself provide asynchronous execution. Persist provider scan IDs and normalize scanner outcomes into allow / would_block / block / error. Enforced must come from the gateway's actual decision, not merely from detecting risk.

This implementation makes no F5/Nemo evaluation calls and performs no real traffic interception. A real integration additionally needs authenticated authorization, durable jobs, retry/idempotency, provider capability checks, traffic capture, redaction/retention, gateway enforcement, and agent application telemetry. Those are deliberately outside this mock change.

## Profile dashboard integration (2026-09-28)
- Mode controls remain scoped to the Profile; linked Guardrails share that mode.
- Persist runtime stages with start/end timestamps and Guardrail/version snapshots. Approve/deactivate closes the current stage and opens an empty one; request/reject preserves it.
- Statistics period filter selects current or historical stages without changing the running mode. Existing runtime events migrate into a legacy stage.
- Statistics count completed scans for the selected stage/mode. Success means no scanner error; rule violations count as successfully completed scans. Empty-stage rates and latency display an em dash.
- Expand Guardrail rows to see stage traces; Error links filter outcomes, and trace details open in a right sheet. Sources and P95 are omitted.
- Mock scan events retain stage identity and historical evidence. Real deployment will need server pagination/retention for event volume.
- Verified: TypeScript, 14 runtime/provider tests, production build, browser approval/reset, reload persistence and historical statistics selection.
