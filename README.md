# Eval Studio

Eval Studio is a local workbench for evaluating Agents against versioned
Datasets. It keeps Agents, Dataset Revisions, evaluation Runs, and Reports in
SQLite so that a result can be reopened and compared after restarting the app.

## Local startup

Prerequisites: Python 3.12+, Docker Desktop (only for local Langfuse), and an
installed project virtual environment.

1. Copy the environment template and configure the providers you want to use.

   ```powershell
   Copy-Item .env.example .env
   ```

   Set either DeepSeek's Anthropic-compatible values
   (`ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN`, and `ANTHROPIC_MODEL`) or
   `OPENAI_API_KEY`. Configure `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`,
   and `LANGFUSE_HOST` when trace links should open in Langfuse. Empty provider
   keys keep the workbench usable with its local/demo adapters.

2. Optionally start the local Langfuse stack.

   ```powershell
   Copy-Item langfuse\.env.example langfuse\.env
   docker compose -f langfuse/docker-compose.yml up -d
   ```

   Langfuse is available at `http://localhost:3000`. Its Web and MinIO ports
   are bound to loopback for local use. Copy the local Langfuse credentials from
   `langfuse/.env.example` into `.env` and set `LANGFUSE_HOST=http://localhost:3000`.

3. Start Eval Studio.

   ```powershell
   .\.venv\Scripts\python.exe -m streamlit run app.py --server.port 8501 --server.headless true
   ```

   Open `http://localhost:8501`.

## Demo flow

On startup, Eval Studio selects the **Permission Compliance Agent** demo. No
provider key or Langfuse connection is required.

1. Review three Tools representing Agent, HTTP API, and local-service adapters.
2. Review the six cases in **Permission Compliance Regression**.
3. Open **Evaluation** and run the local deterministic demo.
4. Inspect Tool evidence, LLM Judge scores, tokens, and cost in **Report**.

The sample Report contains five correct outcomes and one intentionally injected
permission-bypass regression, making `PASS`, correctly blocked safety behavior,
and a genuine `FAIL` easy to distinguish.

The small **Reset demo** control at the bottom of the sidebar restores only the
presentation state. It does not clear Streamlit caches or delete SQLite data.
Agent and Tool create/edit controls are UI previews in the primary Demo; saved
custom Agents remain available in the Agent inventory.

## Extended product flow

1. Create an Agent, or import the original tool configuration using the CLI.
2. Configure the Agent's Tools and save an immutable Agent Revision.
3. Create a Dataset for that Agent, add or generate cases, then publish a
   Dataset Revision.
4. Run an evaluation for one Agent Revision and one Dataset Revision.
5. Reopen the resulting Report at any time, then compare it with another
   Report. Comparisons call out configuration changes and shared-case deltas.

Costs remain separate so a Report makes the trade-offs clear:

- **Agent cost**: model usage while the Agent answers cases.
- **Judge cost**: model usage while the Judge scores answers.
- **Dataset cost**: model usage while cases are generated.
- **Evaluation total**: Agent plus Judge cost; Dataset generation is reported
  separately because it is not spent on every evaluation run.

## CLI

The stable-ID CLI is useful for scripted local demos. IDs printed by each
command are passed to the next command.

```powershell
.\.venv\Scripts\python.exe main.py agents list
.\.venv\Scripts\python.exe main.py agents import-legacy
.\.venv\Scripts\python.exe main.py datasets publish --dataset-id <dataset-id>
.\.venv\Scripts\python.exe main.py runs start --agent-revision-id <agent-revision-id> --dataset-revision-id <dataset-revision-id>
.\.venv\Scripts\python.exe main.py reports create --run-id <run-id>
.\.venv\Scripts\python.exe main.py reports compare --baseline <report-id> --current <report-id>
```

`main.py --step ...` remains temporarily for the original demo automation. It
prints a deprecation message and imports the legacy Agent before routing its
work through the stable records.

## Docker (optional)

```powershell
Copy-Item .env.example .env
docker compose up --build
```

Docker Compose sets `WORKBENCH_DB=/app/data/workbench.db`; the
`agent-eval-data` named volume persists that SQLite database across `docker
compose down` and the next `docker compose up`. Do not use `down -v` unless you
intend to delete the local workbench data.

## Stopping local services

Stop both stacks while keeping their volumes:

```powershell
docker compose down
docker compose -f langfuse/docker-compose.yml down
```

## Verification

```powershell
.\.venv\Scripts\python.exe -m pytest -q --basetemp=.pytest_tmp_modular
.\.venv\Scripts\python.exe tests\ui_smoke.py
docker compose config
docker compose -f langfuse\docker-compose.yml config
```
