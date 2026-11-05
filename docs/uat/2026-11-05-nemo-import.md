# V3 NeMo import and binding acceptance

Verified locally on 2026-11-05 against the running NeMo controller at `127.0.0.1:18083` and MariaDB at `127.0.0.1:13306`. No remote responses were intercepted or replaced for acceptance. Runtime preview: `http://127.0.0.1:18087/v3/guardrails`, workspace `import-acceptance`.

## Implemented behavior

- First workspace load and **Refresh backend status** send `X-Marketplace-Import: true` on the existing workspace GET. Routine polling does not rediscover resources.
- NeMo Policies appear as V3 Guardrails; NeMo Guardrails appear as V3 Profiles. Exact backend IDs determine identity; repeated imports preserve managed records and do not create duplicates.
- External records remain managed in NeMo. Their real published versions are shown, Profile draft references link to the corresponding Policy, and eligible published Policies can be selected in new V3 Profiles. Business metadata absent from NeMo displays placeholders. Import assigns visibility to the importing workspace control unit; it does not infer NeMo ownership.
- Catalog versions must match published versions before rule/direction bindings become eligible. Incomplete or invalid discovery does not change persisted state. Concurrent workspace changes reject stale imports rather than overwrite newer data.
- Missing resources are marked unavailable. Previous records remain visible if import fails, with an error banner. No local approval or evaluation evidence is fabricated for imported resources.

## Actual service results

1. Imported the initial **32 Policies and 5 Guardrails**, including built-in Policies and persisted user-created resources. All five imported Profiles' draft references resolved. Repeating import yielded identical local IDs and no duplicates.
2. Created a User Guardrail request and saved its implementation as Tech. Actual NeMo Policy `mp-50c739ee84e3-uat-import-mw35mm21-v1` was read back at revision 1 with the submitted name and keyword definition; draft-sync job was `done`.
3. Created a V3 Profile referencing imported Policy `block-code-execution`, published version `1.95.0`. Actual NeMo Guardrail `5d74064a-91eb-47ce-80b1-a55e099ffafd` was read back with that exact Policy/version binding.
4. Final production-build HTTP checks: address reachable; token authenticated with both policies/guardrails write grants; MariaDB authentication and `SELECT 1` succeeded. Import returned **33 Policies and 6 Guardrails / 39 unique records**, retaining the new managed Policy's completed synchronization.
5. Browser verified automatic list population, imported Profile → Policy navigation, and actual versions (`1.95.0`, `4.0.0`, published `r...` identifiers) in the new Profile picker.

The two acceptance-created resources are real unpublished drafts retained for inspection. This test did not release them or change existing NeMo resources. A User request alone still waits for Tech to select the provider and save its implementation before creating a NeMo Policy.

## Checks

- 72 relevant Vitest tests passed across import, draft sync, API, observations, OpenAPI, live UI, Profile form, and connection setup.
- TypeScript check and production build passed.
- Independent review findings (stale concurrent imports and synthetic version labels) were fixed and covered by regression tests.
- Screenshot: `.artifacts/nemo-import-v3.jpg`; local acceptance details: `.artifacts/nemo-import-acceptance-result.json` (both ignored artifacts, no credentials).
