# Evaluation UI Polish Design

## Scope

Apply four presentation-only refinements to the existing mock Evaluation UI. Preserve all mock data, evaluator behavior, Dataset card selection, and existing routes unless explicitly changed below.

## Overview

- Move the existing Sampling heading, explanatory copy, slider, and percentage into the right side of the Evaluators section header.
- Keep evaluator rows and their row-scoped Enabled, Minimum score, and Send alert controls unchanged.
- Remove the old Sampling block below the evaluator table so the control appears exactly once.

## Navigation

- Remove the Guard Governance navigation group and its five entries: Guardrails, Assignments, Enforcements, Integrations, and Evidence.
- Change the Guardrails entry in the Security group to navigate to `/$projectId/governance/guardrails`.
- Keep the remaining Security entries and the underlying governance routes available.

## Catalog

- Remove the Generate Dataset action row from Test coverage.
- Remove the empty placeholder row between the Dataset card selector and Guardrail test packs.
- Preserve the Dataset card selector, selected Dataset state, New Dataset card, and Guardrail test pack controls.

## Verification

- Component tests assert that Sampling appears once in the evaluator header and no standalone Sampling block remains.
- Navigation tests assert that Guard Governance is absent and Security Guardrails targets the governance route.
- Catalog tests assert that the two removed rows are absent while Dataset cards and Guardrail test packs remain available.
- Run the affected tests, the full test suite, type checking, and a browser smoke check.
