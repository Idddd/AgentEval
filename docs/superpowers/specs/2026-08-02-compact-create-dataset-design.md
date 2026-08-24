# Compact Create Dataset Design

## Goal

Turn Create Dataset into a narrow, low-density editor that is faster to scan and does not fill the full content canvas.

## Layout

- Constrain the editor to approximately 660px and keep it left aligned.
- Use a small heading and a single muted instruction line.
- Put Name and a short Description inside the constrained Basic information section.
- Keep labels, controls, and section spacing compact.

## Columns

- Render locked `query`, `expected_action`, and `header` fields as one concise row each.
- Each locked row shows name, input/output kind, data type, and required state; omit dividers and long descriptions.
- Render custom columns as compact rows with Name, Kind, Type, Required, and lightweight duplicate/delete actions.
- Keep Description optional and visually secondary.
- Use a small `Add column` text action.

## Actions and behavior

- Keep Create and Cancel in one compact bottom toolbar.
- Preserve schema validation, custom-field behavior, and Dataset creation routing.
- Verify with Streamlit AppTest, the full pytest suite, and a browser screenshot.
