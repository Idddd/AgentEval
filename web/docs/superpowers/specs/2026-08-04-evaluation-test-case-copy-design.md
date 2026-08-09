# Evaluation Test Case Copy

## Goal

Rename user-visible `Policy` and `Policies` copy to `Test Case` and `Test Cases` throughout the new Evaluation module.

## Scope

- Update Evaluation navigation, breadcrumbs, page titles, buttons, forms, run configuration, reports, descriptions, and surfaced mock errors.
- Preserve Security terminology such as `Access Policies` and `Runtime Policies`.
- Preserve internal dataset identifiers, mock state, component names, commands, and `/evaluation/datasets` URLs.

## Verification

- Run focused navigation and breadcrumb tests.
- Run the control TypeScript typecheck.
- Verify the Test Case page in the local browser.
- Skip the full test suite for speed.
