# Guardrail Multi-Template Creation Design

## Goal

Allow a user to combine multiple built-in Guard templates into one editable Guardrail while keeping the creation flow fully local and Mock-driven. Improve the custom-intent copy and generated safety detail, and remove the redundant Decision posture block from the default Guardrail detail page.

## Scope

- Convert built-in template selection from single-select to multi-select.
- Merge selected templates into one Guardrail and preserve all selected template IDs.
- Generate an editable combined name and detailed Business Purpose when entering Safety intent.
- Keep Analyze as a deterministic Mock operation that fills detailed Allowed and Restricted domains.
- Merge template parameters and Controls into the later creation steps.
- Rename `Blank safety intent` to `Customize Intent Create` and describe it as creating a Guardrail from the entered intent document. This is copy only; no upload or paste-document control is added.
- Remove the entire Decision posture section from the default Guardrail Intent tab while retaining Runtime boundary.
- Keep independent Assignment pages and Mock APIs unchanged.

## Creation Experience

### Starting point

Built-in template cards act as checkable multi-select cards. A card click toggles its selected state, selected cards retain the existing highlighted treatment and check mark, and Continue requires at least one selection. Selection order does not affect the result.

`Customize Intent Create` remains mutually exclusive with built-in templates. Choosing it clears template selections and starts the custom flow. Its description explains that the Guardrail is structured from the business-intent document entered in the next step, without implying a file upload.

### Safety intent

For built-in templates, entering this step derives:

- a concise combined Guardrail name from the selected template names;
- a detailed, editable Business Purpose covering intended users, business operations, approved data and actions, prohibited outcomes, and the protection responsibility contributed by each template;
- Allowed and Restricted domains formed by stable-order union and case-insensitive de-duplication;
- parameter fields grouped under their source template so identical parameter names cannot collide.

For Customize Intent Create, the Business Purpose starts with a detailed editable example. Analyze waits briefly to simulate processing, then deterministically fills Allowed domains, Restricted domains, a safety summary, and review notes from the entered Purpose. Re-analysis replaces the generated fields but never changes the user-entered Purpose.

### Controls

Controls from every selected template are combined and de-duplicated by normalized `risk`, `action`, and reasoning-policy identity. The user can still review and edit the result. Safety level uses the strictest selected level in this order: `maximum`, `strict`, `balanced`, `standard`. Output delivery uses the most conservative selected mode in this order: `full_buffered`, `window_buffered`/`windowed`, `interruptible`.

## Data Model and Mock API

Creation input changes from a single optional `template_id` to `template_ids: string[]`. Template parameters are stored by template ID, then parameter name, preventing collisions. Created Guardrails expose `source_template_ids: string[]`; compatibility accessors may continue returning the first ID where existing detail UI expects a primary template.

The Mock store performs all merge and analysis behavior. No network API is introduced. Invalid or missing template IDs produce the existing operation error. An empty template list is valid only for Customize Intent Create.

## Default Guardrail Detail Cleanup

The Decision posture section is removed from the Intent tab for the default Guardrail. Runtime boundary remains visible because it communicates enforcement behavior not duplicated elsewhere.

## Testing

- Template cards toggle independently and Continue requires at least one selected template.
- Multiple selected templates generate one combined editable Purpose and grouped parameters.
- Topic and Control merging is stable and de-duplicated.
- Strictest safety and most conservative output settings win.
- Mock Analyze fills detailed Allowed and Restricted content and supports re-analysis.
- Customize Intent Create renders the revised title and document-based description without an upload control.
- Created Guardrails retain every selected source template ID.
- Default Guardrail detail no longer renders Decision posture and still renders Runtime boundary.
- Existing single-template behavior remains valid as the one-item multi-template case.

## Out of Scope

- Real AI analysis or any external API.
- File upload, document parsing, or persistence outside current Mock storage.
- Changes to independent Assignment management.
