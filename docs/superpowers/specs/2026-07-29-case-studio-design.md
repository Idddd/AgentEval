# Case Studio Design

**Goal:** Let users generate, paste, review, edit, select, and add custom
evaluation cases without allowing an LLM to define permission expectations.

## User flow

Dataset gains a **Case Studio** area above the dataset table.

1. A user selects either **Generate draft cases** or **Fill coverage gaps**.
2. The app sends tools, role permissions, test requirements, and a compact list
   of existing cases to the configured LLM.
3. The LLM returns candidate records containing only `tool_name`, `user_role`,
   `query`, and `coverage_reason`.
4. The backend validates each candidate, derives its scenario and expected
   output using `compute_case`, and presents valid candidates in a review table.
5. The user edits queries or roles, selects rows, and presses **Add selected
   cases**. Only then are items persisted with `metadata.custom = true`.

Users can instead paste a JSON array of candidate records. Pasted records use
the same validation and review pipeline.

## Safety and validation

- The LLM never supplies `expected_output`, guard decisions, or scores.
- Unknown tools, unknown roles, blank queries, malformed JSON, and queries
  already present in the dataset are rejected with row-level reasons.
- Every accepted candidate is reconstructed as a `DatasetItemRecord` using
  deterministic `compute_case` output.
- A user can remove any draft and edit its query or role before persistence.

## Coverage-gap mode

The app computes gaps from existing cases: missing `(tool, role)` pairs and
test requirements that have no matching custom case. It passes these gaps to
the LLM and requests non-duplicative candidates that target them. The user
still reviews every result.

## Persistence and reset

Accepted cases are stored in the existing dataset and survive baseline dataset
regeneration because `DatasetGenerator` preserves `custom=True` items. Drafts
exist only in Streamlit session state. Reset Demo clears custom cases through
the existing dataset reset and clears tool test requirements.

## Interfaces

`src/case_studio.py` will expose pure helpers:

- `validate_candidate(candidate, config, existing_queries) -> DraftCase`
- `coverage_gaps(items, config) -> list[str]`
- `candidate_to_item(draft, config) -> DatasetItemRecord`

`src/intent.py` will gain an LLM-backed case-generator client that receives a
JSON-only prompt and returns a list of raw candidate dictionaries. When no LLM
credentials are present, the Case Studio displays an actionable unavailable
state while JSON paste remains usable.

## Verification

Unit tests cover validation, deterministic expected-output derivation,
duplicate rejection, and gap detection. Streamlit smoke tests cover pasted
JSON preview and adding selected valid cases.
