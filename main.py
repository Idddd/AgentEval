"""Local CLI for the durable Eval Studio workbench.

The stable commands print IDs that can be used by the next command.  The old
``--step`` flow remains for one release so existing demo scripts keep working.
"""
from __future__ import annotations

import argparse
import asyncio
from dataclasses import asdict, is_dataclass
from pathlib import Path
from typing import Any

from src.agent import TargetAgent
from src.agent_adapter import PermissionAgentAdapter
from src.backends.base import get_backend
from src.code_evaluator import CodeEvaluator
from src.config_loader import load_tools_config
from src.dataset_generator import DatasetGenerator
from src.dataset_registry import DatasetRegistry
from src.eval_runner import EvalRunner
from src.intent import build_intent_analyzer, build_llm_gateway
from src.legacy_import import import_legacy_agent
from src.llm_judge import LlmJudge
from src.report_generator import ReportGenerator
from src.report_service import ReportService
from src.settings import load_settings
from src.sqlite_workbench import SQLiteWorkbenchRepository


def _repository() -> SQLiteWorkbenchRepository:
    return SQLiteWorkbenchRepository(load_settings(probe=False).workbench_db)


def _print(value: Any) -> None:
    if is_dataclass(value):
        value = asdict(value)
    print(value)


async def _run_revision(agent_revision_id: str, dataset_revision_id: str) -> None:
    settings = load_settings()
    backend, store = get_backend()
    config = load_tools_config()
    agent = TargetAgent(config, backend.tracer, build_intent_analyzer(settings))
    adapter = PermissionAgentAdapter(agent, store)
    judge = LlmJudge(build_llm_gateway(settings), backend.tracer)
    run = await EvalRunner(
        _repository(), adapter, CodeEvaluator(), judge,
    ).run_revision(agent_revision_id, dataset_revision_id)
    print(run.run_id)


async def _run_legacy(args: argparse.Namespace) -> None:
    """Compatibility shim for the pre-workbench one-shot demo pipeline."""
    print("DEPRECATED: --step is retained for one release; use stable IDs instead.")
    settings = load_settings()
    backend, store = get_backend()
    config = load_tools_config()
    imported = import_legacy_agent(_repository(), config)
    print(f"legacy Agent imported as {imported.agent_id}")

    if args.step in ("all", "generate"):
        print(f"[1/3] Generating dataset '{args.dataset}' ...")
        items = DatasetGenerator(args.dataset, backend, config).generate()
        print(f"      -> {len(items)} items")
    if args.step in ("all", "run"):
        print(f"[2/3] Running experiment '{args.experiment}' ...")
        results = await EvalRunner(
            args.dataset, args.experiment, backend, store, config,
            build_intent_analyzer(settings),
        ).run()
        print(f"      -> {len(results)} traces scored")
    if args.step in ("all", "report"):
        print("[3/3] Generating report ...")
        ReportGenerator(args.experiment, store).generate(args.report)
        print(args.report or f"reports/report_{args.experiment}.md")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Eval Studio local workbench")
    parser.add_argument("--step", choices=["all", "generate", "run", "report"])
    parser.add_argument("--dataset", default="agent_permission_eval_v1")
    parser.add_argument("--experiment", default="exp_v1")
    parser.add_argument("--report")
    commands = parser.add_subparsers(dest="command")

    agents = commands.add_parser("agents")
    agent_commands = agents.add_subparsers(dest="agents_command", required=True)
    agent_commands.add_parser("list")
    agent_commands.add_parser("import-legacy")

    datasets = commands.add_parser("datasets")
    dataset_commands = datasets.add_subparsers(dest="datasets_command", required=True)
    publish = dataset_commands.add_parser("publish")
    publish.add_argument("--dataset-id", required=True)

    runs = commands.add_parser("runs")
    run_commands = runs.add_subparsers(dest="runs_command", required=True)
    start = run_commands.add_parser("start")
    start.add_argument("--agent-revision-id", required=True)
    start.add_argument("--dataset-revision-id", required=True)

    reports = commands.add_parser("reports")
    report_commands = reports.add_subparsers(dest="reports_command", required=True)
    create = report_commands.add_parser("create")
    create.add_argument("--run-id", required=True)
    compare = report_commands.add_parser("compare")
    compare.add_argument("--baseline", required=True)
    compare.add_argument("--current", required=True)
    return parser


async def main() -> None:
    args = build_parser().parse_args()
    if args.step:
        await _run_legacy(args)
        return
    repository = _repository()
    if args.command == "agents":
        if args.agents_command == "list":
            for agent in repository.list_agents():
                print(f"{agent.agent_id}\t{agent.name}\trevision {agent.current_revision}")
        else:
            agent = import_legacy_agent(repository, load_tools_config())
            print(agent.agent_id)
    elif args.command == "datasets":
        revision = DatasetRegistry(repository).publish(args.dataset_id)
        print(revision.revision_id)
    elif args.command == "runs":
        await _run_revision(args.agent_revision_id, args.dataset_revision_id)
    elif args.command == "reports":
        service = ReportService(repository, Path("reports"))
        if args.reports_command == "create":
            print(service.create(args.run_id).report_id)
        else:
            _print(service.compare(args.baseline, args.current))
    else:
        build_parser().print_help()


if __name__ == "__main__":
    asyncio.run(main())
