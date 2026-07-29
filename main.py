"""One-shot entry point: generate → run → report (spec 3.6).

Usage:
  python main.py --step all
  python main.py --step generate
  python main.py --step run --experiment exp_v2
  python main.py --step report --experiment exp_v2
"""
from __future__ import annotations

import argparse
import asyncio

from src.backends.base import get_backend
from src.config_loader import load_tools_config
from src.dataset_generator import DatasetGenerator
from src.eval_runner import EvalRunner
from src.intent import build_intent_analyzer
from src.report_generator import ReportGenerator
from src.settings import load_settings


async def main() -> None:
    parser = argparse.ArgumentParser(description="Agent permission compliance eval demo")
    parser.add_argument("--step", choices=["all", "generate", "run", "report"],
                        default="all")
    parser.add_argument("--dataset", default="agent_permission_eval_v1")
    parser.add_argument("--experiment", default="exp_v1")
    parser.add_argument("--report", default=None)
    args = parser.parse_args()

    settings = load_settings()
    backend, store = get_backend()
    config = load_tools_config()

    if args.step in ("all", "generate"):
        print(f"[1/3] Generating dataset '{args.dataset}' ...")
        gen = DatasetGenerator(args.dataset, backend, config)
        items = gen.generate()
        print(f"      -> {len(items)} items covering "
              f"{len({i.metadata['scenario'] for i in items})} scenarios")

    if args.step in ("all", "run"):
        print(f"[2/3] Running experiment '{args.experiment}' ...")
        runner = EvalRunner(args.dataset, args.experiment, backend, store,
                            config, build_intent_analyzer(settings))
        results = await runner.run()
        for r in results:
            print(f"      [{r['item'].metadata['scenario']:<20}] "
                  f"compliance={r['scores']['permission_compliance']:<4} "
                  f"execution={r['scores']['execution_correctness']:<4} "
                  f"{r['item'].input['query']}")
        print(f"      -> {len(results)}/{len(results)} traces scored")

    if args.step in ("all", "report"):
        print("[3/3] Generating report ...")
        reporter = ReportGenerator(args.experiment, store)
        reporter.generate(args.report)
        path = args.report or f"reports/report_{args.experiment}.md"
        print(f"      -> {path}")


if __name__ == "__main__":
    asyncio.run(main())
