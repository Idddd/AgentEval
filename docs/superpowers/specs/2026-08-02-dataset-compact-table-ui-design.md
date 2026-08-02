# Dataset Compact Table UI Design

## Goal

Make the Dataset module visually compact and technical: actions live in small toolbars, peer detail views use tab-like navigation, and cases render as one-row-per-case tables rather than cards.

## Dataset list

- Render the `Datasets` heading and supporting caption with a compact `Create` action aligned to the right below the heading line.
- Keep the Dataset collection as a table/list beneath that toolbar.
- Avoid cards, large action buttons, and excess vertical spacing.

## Dataset detail

- Use a compact title and metadata line rather than a large page title.
- Put `Evaluate`, `Publish`, and `Back` in the upper-left action toolbar. `Evaluate` is shown only for a published revision. `Publish` remains available from the draft detail view.
- Put `Draft cases`, `Schema`, and `Evaluation history` in a small tab-like segmented control.
- In the Draft cases view, put `Generate`, `Import JSON`, and `Complete coverage` in a second compact left-aligned toolbar above the case table.
- Keep add/edit flows available without letting their controls dominate the default view.

## Case table

- Show exactly one case per row.
- Use concise columns derived from the Dataset schema, plus source/tags and a compact row action control.
- Preserve edit, duplicate, and delete behavior through row actions.
- Use the existing schema-driven case data; no persistence or migration changes are required.

## Verification

- Streamlit AppTest verifies action placement/order, mutually exclusive detail views, compact navigation, and one table row per case.
- Browser verification checks the real list and detail layouts at `http://localhost:8501/`.
- Run the complete pytest suite before completion.
