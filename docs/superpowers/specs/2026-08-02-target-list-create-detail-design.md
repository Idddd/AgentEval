# Target List, Creation, and Detail Design

## Goal

Replace the current selector-first Target home with a compact list-first flow matching the Dataset and Evaluation modules. Users can filter Targets, open a Target detail page, or create an immutable Target Revision through a guided form whose interface explains the evaluation model.

## Product model

A Target Revision always contains exactly one Model and can optionally contain:

- one Prompt;
- zero or more Tools;
- zero or more MCP servers;
- zero or more Knowledge Bases.

A Model-only Target is valid. Prompt, Tool, MCP, and Knowledge Base evaluation always runs through the selected Model. The selected configuration is copied into the immutable Target Revision when the user submits the form.

Target creation is atomic: the application creates the Target profile and its first immutable Revision together. It does not expose a Target draft state. An invalid or incomplete form creates neither record.

## User-scoped catalog boundary

The UI consumes a catalog service rather than owning resource definitions. The service exposes user-scoped lists for:

- Models;
- Tools;
- MCP servers;
- Knowledge Bases.

The first implementation returns deterministic in-process fixtures. Its Tool catalog must include every Tool currently used by the demo Target. The interface is intentionally replaceable by a future authenticated backend call without changing the page.

Catalog items have a stable ID, display name, short description, and non-secret connection metadata needed for an immutable Revision snapshot. Tools also carry the existing `ToolBinding` execution configuration. MCP and Knowledge Base selections are stored as immutable, secret-free metadata inside `config_snapshot`.

Target never stores API keys, bearer tokens, passwords, or authorization headers. The Create page shows this English note beneath Resources:

> Authentication is not stored in Target. Supply Tool, MCP, and KB authorization through the Dataset `header` field.

## Target home

The initial Target route shows the list view, not an automatically opened Target.

The page title row has a strict two-column layout:

- `Target` occupies the left, flexible column;
- a small, content-width `Create` primary button occupies the right column and remains aligned to the far-right edge on the same row.

Below the title row, `Target filter` filters by configuration scope:

- All targets;
- Model only;
- With Prompt;
- With Tools;
- With MCP;
- With KB.

Below the filter, a native table renders one Target per row. Columns are Target, Revision, Configuration, Updated, and View. Configuration is a concise derived summary such as `Model only`, `Model · Prompt · 3 Tools`, or `Model · 2 KB`. `View` is linked action text in the final column. Selecting View opens that Target detail and updates the durable selected Target context.

Empty state retains the same title and Create action, then explains that no Targets match the active filter.

## Create Target

Create replaces the list view; the list never remains visible underneath it. A compact back action returns to Target home and clears transient form state.

The page uses a two-column composition:

- the left column is the editable form;
- the narrower right column is a sticky-in-concept Revision preview. Native Streamlit layout need not use browser-sticky positioning.

### Left-side modules

The form is split by compact headings and subtle separators rather than bordered cards.

1. **Target information**
   - Name, required.
   - Description, optional.
   - Helper: `Name this evaluation subject.`

2. **Model**
   - One required selection from the Model catalog.
   - Helper: `The execution model used by this Revision.`
   - Documentation note: `A model-only Target is valid without any optional component below.`

3. **Prompt**
   - One optional system prompt text value.
   - Helper: `Optional system instructions included in every case.`

4. **Resources**
   - Tools: zero or more selections from the Tool catalog.
   - MCP servers: zero or more selections from the MCP catalog.
   - Knowledge bases: zero or more selections from the Knowledge Base catalog.
   - Each selector supports multiple values and displays selected counts.
   - Helper: `Select reusable capabilities available to the current user.`
   - The authentication note appears immediately after the resource selectors.

The action row contains a secondary Cancel action and one primary, content-width `Create target revision` action.

### Revision preview

The preview is the only bounded surface on the page. It contains:

- `Revision preview` label;
- Target name or `Untitled target` fallback;
- status: `Ready` or `Incomplete`;
- Model selection;
- Prompt status: Included or None;
- selected Tool, MCP, and KB counts;
- derived Evaluation scope labels: Model, Prompt, Tool use, MCP access, and Knowledge grounding as applicable;
- explanation that the Model and selected resources are frozen when the Revision is created.

The preview updates on each Streamlit rerun. It is explanatory only and has no independent controls.

### Validation and persistence

Submission requires a non-empty Target name and one Model selection. Catalog IDs must still exist in the current response when submitted. Prompt may be empty; all resource collections may be empty.

On success:

1. Create the Target profile.
2. Resolve selected catalog entries.
3. Build a secret-free immutable `config_snapshot` containing Model, Prompt, MCP, and Knowledge Base snapshots.
4. Store selected Tools as the Revision's `ToolBinding` tuple.
5. Create Target Revision 1.
6. Select the new Target and open its detail page.

If Revision creation fails after profile creation, the service boundary must avoid exposing a partial Target. The initial implementation should provide an atomic repository/service operation or compensate by deleting the unversioned profile within the same transaction boundary.

Validation errors appear adjacent to the form and preserve entered values. Catalog loading failures disable submission and show a concise retryable error without rendering stale choices.

## Target detail

The detail page uses the compact Dataset detail style:

- a `Targets` back action at the upper left;
- Target name, description, Revision, and concise configuration summary;
- an `Evaluate` action near the detail header;
- one native component table with Component, Selection, and Purpose columns;
- Model, Prompt, Tools, MCP, and KB each occupy one row;
- no large configuration cards.

Existing latest Report, trends, and Report history remain available below the configuration section, but use compact headings and native tables. Existing report routing remains unchanged.

## State and navigation

Target module state has three explicit views: `list`, `create`, and `detail`. Only one view renders at a time.

- Entering the global Target route defaults to `list` unless an intentional navigation request selects a Target detail.
- Create changes the view to `create`.
- View selects the Target and changes the view to `detail`.
- Back and Cancel return to `list`.
- Successful creation selects the new Target and opens `detail`.
- Evaluate selects the Target and navigates to Evaluation.

Changing global modules must not leave Create or detail content visible on return unless navigation explicitly requested it.

## Testing

Automated Streamlit tests cover:

- initial Target route renders the filter and one-row-per-Target table;
- the title and compact Create button share the same title-row structure;
- filter choices include all defined configuration scopes and filter correctly;
- View opens the correct Target detail;
- Create hides the Target list;
- Model is required and optional modules may remain empty;
- Tools, MCP, and KB support multiple selected catalog IDs;
- the fixed Tool catalog includes all current demo Tools;
- authentication guidance contains the English Dataset `header` instruction;
- invalid submission persists no partial Target;
- successful submission creates Target Revision 1 with the expected immutable snapshots and Tool bindings;
- successful creation opens the new Target detail;
- detail Evaluate routes to Evaluation with the new Target selected;
- existing report and evaluation routing behavior remains intact.

The full test suite and a real browser inspection of list, create, and detail views are required before completion.
