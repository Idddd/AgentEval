# Target List, Creation, and Detail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a compact Target list-first workflow with filtering, atomic Target Revision creation from user-scoped catalogs, a live Revision preview, and a concise detail page.

**Architecture:** Add a replaceable catalog service that returns secret-free user-scoped Model, Tool, MCP, and KB entries. Extend the repository with one atomic profile-plus-first-revision operation, then refactor the Target Streamlit module into explicit list, create, and detail renderers driven by session state.

**Tech Stack:** Python 3.11, Streamlit, SQLite, dataclasses, Streamlit AppTest, pytest.

## Global Constraints

- A Target Revision always has exactly one Model.
- Prompt is optional and singular; Tools, MCP servers, and Knowledge Bases are optional multi-select resources.
- Target creation persists the profile and Revision 1 atomically with no draft Target state.
- No secrets or authorization headers are stored in Target configuration.
- The Tool catalog includes every Tool currently used by the demo Target.
- Target home renders `Target` and a small content-width `Create` button on the same row, with Create aligned to the far right.
- Target home retains `Target filter` and renders one Target per native table row.
- Create, list, and detail are mutually exclusive views.
- Existing Evaluation and Report routing must remain unchanged.

---

### Task 1: User-scoped resource catalog and atomic Target creation

**Files:**
- Create: `src/target_catalog.py`
- Modify: `src/workbench_repository.py`
- Modify: `src/sqlite_workbench.py`
- Modify: `src/agent_registry.py`
- Test: `tests/test_target_catalog.py`
- Test: `tests/test_sqlite_workbench.py`

**Interfaces:**
- Produces: `CatalogItem`, `TargetCatalog.for_user(user_id: str) -> TargetCatalogSnapshot`.
- Produces: `WorkbenchRepository.create_agent_with_revision(name, description, config_snapshot, tools) -> tuple[AgentProfile, AgentRevision]`.
- Produces: `AgentRegistry.create_revision(...) -> tuple[AgentProfile, AgentRevision]`.

- [ ] **Step 1: Write failing catalog tests** proving stable model/MCP/KB fixtures, multi-resource lookup, and inclusion of the current demo Tool IDs.
- [ ] **Step 2: Write a failing repository test** that injects invalid Revision data and proves no unversioned Target remains after the atomic call fails.
- [ ] **Step 3: Run the focused tests** with `pytest -q tests/test_target_catalog.py tests/test_sqlite_workbench.py -k 'catalog or agent_with_revision'` and confirm failure.
- [ ] **Step 4: Implement catalog dataclasses and fixture service** with stable IDs, descriptions, secret-free metadata, and existing demo `ToolBinding` values.
- [ ] **Step 5: Implement atomic SQLite creation** in one transaction using the same validation and immutable snapshot serialization as existing Revision creation.
- [ ] **Step 6: Add the AgentRegistry service method** that trims and validates the name before calling the atomic repository operation.
- [ ] **Step 7: Run the focused tests** and confirm they pass.

### Task 2: Target list view and filtering

**Files:**
- Modify: `src/ui/agents.py`
- Modify: `src/ui/state.py`
- Test: `tests/test_ui_agents.py`

**Interfaces:**
- Consumes: current revisions from `WorkbenchRepository`.
- Produces: `_target_rows(repository, scope) -> list[dict[str, Any]]` and Target view state values `list`, `create`, `detail`.

- [ ] **Step 1: Add failing AppTests** for the initial list view, `Target filter`, one native table row per Target, and list filtering by Model only, Prompt, Tools, MCP, and KB.
- [ ] **Step 2: Add a failing structural test** that asserts the title row uses one horizontal container with `Target` before a content-width Create button.
- [ ] **Step 3: Add a failing View-action test** proving the selected row opens the correct Target detail and updates `selected_agent_id`.
- [ ] **Step 4: Run the focused Target-home tests** and confirm they fail against the selector-first page.
- [ ] **Step 5: Implement derived configuration summaries and scope predicates** from immutable current Revision data.
- [ ] **Step 6: Implement list-only rendering** with the fixed title row, compact Create action, retained filter, native table, and final View action.
- [ ] **Step 7: Run the focused tests** and confirm they pass.

### Task 3: Modular Create Target form and live Revision preview

**Files:**
- Modify: `src/ui/agents.py`
- Test: `tests/test_ui_agents.py`

**Interfaces:**
- Consumes: `TargetCatalog.for_user()`, `AgentRegistry.create_revision()`.
- Produces: `target_create` session state, `_target_config_snapshot(...)`, and a create renderer that opens detail on success.

- [ ] **Step 1: Add failing AppTests** proving Create hides the list and renders Target information, Model, Prompt, Resources, and Revision preview sections.
- [ ] **Step 2: Add failing tests** proving Model is required, Model-only submission succeeds, and no partial Target persists after invalid submission.
- [ ] **Step 3: Add failing tests** selecting multiple Tools, MCP servers, and KBs and asserting the immutable Revision contains every selection.
- [ ] **Step 4: Add a failing copy test** for the exact English Dataset `header` authentication guidance.
- [ ] **Step 5: Run the focused create tests** and confirm failure.
- [ ] **Step 6: Implement the modular borderless form** with compact section separators and catalog-backed single/multi-selection widgets.
- [ ] **Step 7: Implement the bounded Preview** with Ready/Incomplete status, Target name, component counts, and derived Evaluation scope.
- [ ] **Step 8: Implement submission** through the atomic service, preserving values on validation error and opening the new detail on success.
- [ ] **Step 9: Run the focused tests** and confirm they pass.

### Task 4: Compact Target detail and navigation

**Files:**
- Modify: `src/ui/agents.py`
- Modify: `src/ui/state.py`
- Test: `tests/test_ui_agents.py`
- Test: `tests/test_ui_demo.py`

**Interfaces:**
- Consumes: selected Target ID and immutable current Revision.
- Produces: compact component rows and explicit Back/Evaluate navigation actions.

- [ ] **Step 1: Add failing AppTests** for the Targets back action, one component table, concise Revision summary, and absence of selector-first content.
- [ ] **Step 2: Add a failing Evaluate navigation test** proving the selected Target is retained and `active_page` becomes `Evaluation`.
- [ ] **Step 3: Run focused detail tests** and confirm failure.
- [ ] **Step 4: Implement detail rendering** with Model, Prompt, Tools, MCP, and KB rows, then retain compact Report history below it.
- [ ] **Step 5: Implement Back and Evaluate state transitions** and ensure global module changes do not leak create/detail content.
- [ ] **Step 6: Run Target and demo UI tests** with `pytest -q tests/test_ui_agents.py tests/test_ui_demo.py`.

### Task 5: Verification and real-page inspection

**Files:**
- Modify only files required by failures discovered in this task.

**Interfaces:**
- Consumes: the complete implementation.
- Produces: a verified running application.

- [ ] **Step 1: Run syntax verification** with `python -m py_compile src/target_catalog.py src/ui/agents.py src/ui/state.py src/sqlite_workbench.py`.
- [ ] **Step 2: Run the complete suite** with `pytest -q` and require zero failures.
- [ ] **Step 3: Restart Streamlit** at `http://localhost:8501/`.
- [ ] **Step 4: Inspect Target list, each filter, Create, multi-select Resources, live Preview, successful creation, detail, Back, and Evaluate in the real browser.
- [ ] **Step 5: Request independent code review** and resolve every Critical or Important issue.
- [ ] **Step 6: Re-run `pytest -q` after review fixes and require zero failures.
