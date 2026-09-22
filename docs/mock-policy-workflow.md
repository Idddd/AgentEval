# Mock Policy workflow

The local demo supports two roles, selected from the bottom-left account menu:
User (existing business users) and Agent Wizard (technical configuration).
This is demo role simulation, not backend authorization.

User creates a Policy with Name and Rule text only. Save draft keeps Draft;
Submit enters Awaiting Agent Wizard and does not start a completion timer.
Agent Wizard starts configuration, selects Nemo/F5, saves technical notes, asks
for clarification, or completes configuration. Completing both sources creates
two independent policies with a shared business request ID. Existing source
policies retain their source when revised.

Progress: Draft → Awaiting Agent Wizard → Configuring → Ready. Request changes
returns Needs input; User can edit and resubmit. Progress is separate from
runtime status, stored in browser mock data, and available as a list filter.
The database and provider APIs are not used in mock mode. Technical fields are
demo configuration text, not validated vendor schemas, and no eval or sync runs.

Runtime is `MARKETPLACE_DATA_MODE=mock` with automatic Guard token disabled.
The previous live configuration is retained locally in the ignored
`.artifacts/guard-local/frontend.before-workflow-mock.env` file.

## Status presentation

Policies use a Status filter and column. State transitions are:
- Draft -> Awaiting Agent Wizard when User submits.
- Awaiting Agent Wizard -> Configuring when Agent Wizard starts.
- Configuring -> Ready when configuration is completed.
- Configuring -> Needs input when Agent Wizard requests changes.
- Needs input -> Awaiting Agent Wizard when User resubmits (saving without submitting returns to Draft).
- Editing a Ready policy creates a new draft revision; submitting sends that revision back to Awaiting Agent Wizard.

Non-Ready states have a compact stage progress bar: Draft 10%, Awaiting Agent Wizard 40%, Configuring 75%, Needs input 25%. These are stage markers, not elapsed-time estimates; no numeric percentages or step fractions appear. Needs input rolls progress back to the requirements stage. Ready shows only its green status badge. The accessible progress value text names the current state.

## Role-specific status labels

Awaiting Agent Wizard and Configuring appear as Pending implement to User and Needs input to Agent Wizard until Ready. Returned requirements show Needs input to User. Draft and Ready keep their names. List, detail, accessible progress labels and filters share this mapping. Changing role resets status filters. Internal transitions and stage progress remain unchanged.


User never sees Needs input: all submitted, unfinished policies show Pending implement. User is not asked to clarify; the technical editor no longer offers Request changes. Existing returned policies can be picked up again by Agent Wizard using Start configuration.

## Structured technical editor

Tech now edits provider parameters instead of a generic notes field. Nemo fields follow controller/server/policy-studio/model.ts in the local tasklattice-guard checkout: Colang version, source files, rail bindings (rail/flow/execution/action/timeout/failure/required), parameter definitions, action references and model/prompt dependencies. Optional scheduling, execution-contract and evaluation-test editors are not exposed in this initial form. F5 follows https://docs.aisecurity.f5.com/api-docs/creating-custom-scanner.html: custom.input, regex.pattern or keyword.words, plus version name/description. F5 direction stays both. Name/description remain the business policy fields. Publication and evaluation are not performed by this mock.

Configuration values are serialized structured objects in the existing per-source config storage. Drafts may be incomplete. Complete configuration checks required fields and supported enum/range values. This is structural validation, not compilation or vendor evaluation. Old text notes are retained and shown in a collapsed legacy section; they cannot complete a new configuration without filling the form. Ready configurations are read-only.
