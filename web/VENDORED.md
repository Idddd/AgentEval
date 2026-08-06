# Vendored TaskLattice console

`web/` is a vendored snapshot of the TaskLattice control console, merged back
into AgentEval so the advanced Evaluation UI runs against AgentEval's real
Python/SQLite backend.

## Snapshot source

- Repository: `C:\Users\95602\IdeaProjects\TaskLattice` (worktree `.worktrees\evaluation-layer`)
- Branch: `codex/evaluation-roles`
- Commit: `78147f8`
- Three local tweaks carried over (uncommitted in the source worktree):
  1. `apps/control/vite.config.ts` reads `PORT` / `HOST` from the environment.
  2. `apps/control/package.json` `dev` script uses `--env-file-if-exists` without
     hard-coded host/port flags.
  3. Regenerated `apps/control/src/routeTree.gen.ts`.
- Excluded: `.git`, `node_modules`, build outputs, logs, `docs-local-startup.txt`,
  `start-dev.ps1`.

## Rules for UI changes

- The Evaluations module's demo graph (`apps/control/src/features/evaluations/fixtures.ts`)
  is mirrored to `src/api/demo_fixtures.json` by
  `scripts/export-evaluation-fixtures.ts`. Change the fixtures and regenerate
  the mirror, or the API parity test (`tests/test_api_demo_parity.py`) fails:

  ```powershell
  npx tsx scripts/export-evaluation-fixtures.ts
  ```

- The Evaluations module's data layer is `apps/control/src/features/evaluations/api-store.ts`
  (same `EvaluationStore` interface as the old mock store). Backend operations
  that return 501 keep their local mock result; the page must never error on a
  501.

## Run

See `../README.md` (Web UI section) and `../start-dev.ps1`.
