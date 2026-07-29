# Evaluation Workbench UI Design

**Date:** 2026-07-29  
**Status:** Approved for planning  
**Scope:** Streamlit presentation and interaction flow only. Evaluation logic,
trace schema, tool definitions, and persisted report format remain compatible.

## Goal

Make the demo understandable to an English-speaking user on first visit: explain
which agent is under test, which permission policy applies, what to do next, and
how to investigate a failed evaluation.

## Information Architecture

The application opens on a new **Home** tab, followed by **Dataset**, **Trace
Timeline**, **Scores**, **Report**, and **Roadmap**.

- **Home** explains the target agent and its guard-first behavior for sensitive
  tools. It renders the configured tools, their risk levels, role requirements,
  and the role-to-tool permission matrix directly from `config/tools.yaml`.
- **Dataset** is for inspecting generated and custom cases.
- **Trace Timeline** is for investigating one evaluated run.
- **Scores** is for aggregate results and failure triage.
- **Report** is for the formal summary and Markdown download.
- **Roadmap** contains all disabled future-feature previews. No operational tab
  shows roadmap controls.

The sidebar contains only the experiment selector and runtime mode indicators.

## Evaluation Journey

Home presents three ordered workflow stages:

1. **Prepare dataset** — generate cases from the configured permission policy.
2. **Run evaluation** — execute each case, score the generated trace, and show
   an expandable progress log.
3. **Review and export** — inspect the Scores tab, then generate and download
   the report.

Each stage states its current readiness and exposes its relevant action. A stage
is disabled until its prerequisite is complete. Existing dataset and score data
determine readiness; no new persistence state is introduced.

After a run completes, Home renders an explicit result callout directing the
user to **Scores**. Streamlit does not reliably support programmatic tab
selection in the target version, so the user receives a visible, labelled
navigation instruction instead of an implied automatic redirect.

## Home Content

Home has four sections:

1. **Target Agent** — a concise explanation that the agent identifies a tool,
   checks the Permission Guard before sensitive actions, and records an
   observable trace.
2. **What is under test** — one card per configured tool with description,
   sensitivity (`Low risk` or `High risk`), and the configured required role.
3. **Permission policy** — a role-by-tool table with `Allowed` and `Denied`
   text markers, not color alone.
4. **Run an evaluation** — the three-stage workflow, progress/log expander,
   and post-run outcome guidance.

## Scores and Trace Diagnosis

Scores makes failures the primary diagnostic object. It includes summary
metrics, a scenario breakdown, a case table with an explicit Status column, and
a concise failure list. The failure list identifies the scenario, target tool,
reason, and instructs the user to open the matching trace in Trace Timeline.

Trace Timeline begins with a decision summary: status, compliance and execution
scores, scenario, role, target tool, and Permission Guard state. The timeline
and nested span JSON remain available below this summary as technical detail.

## Report Status Design

The Report tab has an unambiguous top-level status banner:

- When every case passes, a green `COMPLIANT` banner states that no permission
  failures were detected.
- When any case fails, a red `ACTION REQUIRED` banner states the exact count
  of failing cases and directs the user to failure analysis.

Status is expressed through words, icon, strong foreground/background contrast,
and a border. Tables include a `Status` column with `PASS` or `FAIL`; no meaning
depends on red/green background shading alone.

The generated Markdown report gains the same status heading and failure-count
summary while preserving its Overview, scenario breakdown, failure analysis,
and raw data sections.

## Roadmap

The six existing disabled roadmap previews move to one **Roadmap** tab. Their
content and disabled state are unchanged; the move prevents future controls
from being mistaken for current configuration.

## Error Handling and Empty States

- Empty dataset: Home and Dataset explain that dataset generation is the next
  action.
- No evaluated traces: Scores, Trace Timeline, and Report explain that running
  the evaluation is required.
- No generated report: Report shows the next report-generation action.
- A failed case always retains its failure reason where a score comment exists;
  otherwise the UI displays `No reason recorded`.

## Testing

Extend the Streamlit AppTest smoke test to assert:

- Home renders the target-agent explanation, configured tool names, workflow
  actions, and text-based policy markers.
- Roadmap previews appear only on the Roadmap tab.
- The report clearly renders `COMPLIANT` for all-pass data and `ACTION REQUIRED`
  plus `FAIL` for the existing injected failing case.
- The generated Markdown report contains its corresponding status heading.

Run the complete UI smoke flow and the existing pytest suite using the project
virtual environment and `--basetemp=.pytest_tmp`.
