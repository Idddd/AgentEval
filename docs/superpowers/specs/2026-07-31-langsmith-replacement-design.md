# LangSmith replacement design

## Goal

Replace Langfuse completely with LangSmith while preserving the demo's current
case-generation, agent execution, deterministic scoring, Streamlit dashboard,
Markdown report, and Local JSON fallback behavior.

## Scope

- Remove the Langfuse Python dependency, settings, backend implementation, and
  self-hosted Langfuse Docker assets.
- Add a LangSmith Python SDK backend behind the existing `Tracer`,
  `TraceBackend`, and `TraceStore` protocols.
- Keep the existing dataset case format and the full `generate -> run -> report`
  CLI/UI flow unchanged.
- Preserve Local JSON when LangSmith credentials are absent or invalid.

## Architecture

`LangsmithBackend` owns the SDK `Client` and a `LangsmithTracer`.

- A call to `start_trace` creates a root LangSmith run of type `chain`. The
  existing experiment tag supplied by `EvalRunner` becomes the LangSmith
  project name.
- Nested calls to `span` create child runs with `parent_run_id`; their start/end
  times, inputs, outputs, and metadata map directly to `SpanRecord` fields.
- `flush` waits for the SDK background sender so the runner can fetch its trace.
- `LangsmithStore.get_trace` reads the root run then all runs with that
  `trace_id`, converts children to `SpanRecord`s, and produces the existing
  `TraceRecord` shape.
- `list_traces(tag)` looks up root runs in the project/metadata associated with
  the requested experiment. The project is the canonical experiment grouping;
  the existing tag is retained in metadata for compatibility.

## Datasets, scores, and lifecycle

- Dataset items map to LangSmith examples: `input` -> `inputs`,
  `expected_output` -> `outputs`, and metadata remains metadata.
- Replacing a dataset deletes its prior LangSmith dataset before writing the
  generated and preserved custom cases.
- `permission_compliance` and `execution_correctness` map to numeric LangSmith
  feedback associated with the root run. Their textual reasons map to feedback
  comments.
- `register_experiment` keeps the existing local experiment registry only for
  UI compatibility; its entries identify the LangSmith backend and project.
- Reset removes the named remote dataset and demo traces where the LangSmith
  API permits it, removes the local registry, and reports best-effort counts.

## Configuration and user experience

`.env.example`, `Settings`, README, dashboard labels, and runtime mode output
use `LANGSMITH_API_KEY`, optional `LANGSMITH_ENDPOINT`, and optional
`LANGSMITH_WORKSPACE_ID`. Cloud LangSmith is the remote target. No Langfuse
configuration or self-hosted Langfuse files remain in this branch.

When the API key is missing or a lightweight client connectivity check fails,
the application selects Local JSON exactly as it does today. The current demo
cases and their expected outcomes are not changed.

## Tests and acceptance criteria

- Unit tests first verify settings selection, nested-run construction,
  `TraceRecord` reconstruction, dataset/example mapping, and feedback writes
  using a fake LangSmith client.
- Existing local backend and case-flow tests remain green unchanged.
- The local Streamlit smoke test completes the existing demo flow and retains
  the intentional `demo_bypass` failure.
- With valid `LANGSMITH_API_KEY` credentials, the CLI `--step all` completes
  against LangSmith Cloud and the generated dataset, trace tree, and two
  feedback scores are visible remotely.
