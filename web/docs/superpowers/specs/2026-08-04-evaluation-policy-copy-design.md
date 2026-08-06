# Evaluation Policy Copy

## Goal

Rename user-visible `Dataset` and `Datasets` copy to `Policy` and `Policies` throughout the new Evaluation module, and remove the shared `Mock demo` badge.

## Scope

- Update Evaluation sidebar, breadcrumbs, page titles, buttons, forms, tables, reports, descriptions, and surfaced mock errors.
- Remove the `Mock demo` badge from the shared Evaluation page frame so it disappears from every Evaluation page.
- Preserve internal dataset models, commands, fixture keys, component names, route parameters, and `/evaluation/datasets` URLs.
- Do not change the legacy Evaluations module.

## Verification

- Run focused navigation and breadcrumb tests.
- Run the control app TypeScript typecheck.
- Verify the Policy list and absence of `Mock demo` in the local browser.
- Skip the full test suite as requested.
