"""Seed the exact UI fixture graph into the web workbench database."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from src.workbench_models import (
    CaseResult,
    JudgeResult,
    RunStatus,
    TestCase,
    ToolBinding,
    ToolEvidence,
    UsageCost,
)
from src.workbench_repository import WorkbenchRepository
from src.api.dto import ui_schema_to_dataset_schema


def load_demo_fixtures(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def is_seeded(repository: WorkbenchRepository, fixtures: dict) -> bool:
    target_ids = {item["id"] for item in fixtures["targets"]}
    existing = {agent.agent_id for agent in repository.list_agents()}
    return target_ids.issubset(existing)


def _tool(name: str) -> ToolBinding:
    return ToolBinding(
        tool_id=name,
        name=name,
        description=f"Demo tool {name}.",
        connection_type="demo",
        adapter_config={"endpoint": "demo://" + name},
        input_schema={"type": "object"},
        output_schema={"type": "object"},
        permission={"sensitivity": "low", "required_role": None},
        test_requirements=(),
        verification_required=False,
        enabled=True,
    )


def _case(item: dict) -> TestCase:
    return TestCase(
        case_id=item["id"],
        input=dict(item["input"]),
        expected_output=dict(item["expected"]),
        source=item.get("source", "MANUAL").lower(),
    )


def _case_result(item: dict) -> CaseResult:
    evidence = tuple(
        ToolEvidence(
            call_id=f"{item['caseId']}-{entry['tool']}",
            tool_id=entry["tool"],
            requested=entry["requested"],
            executed=entry["called"],
            succeeded=entry["called"],
            effect_verified=None,
            verification_required=False,
            requested_arguments={},
            executed_arguments={},
            output=None,
            error=None,
            trace_id=item["caseId"],
            observation_id=None,
            started_at=None,
            ended_at=None,
            latency_ms=item.get("durationMs"),
            receipt=None,
        )
        for entry in item.get("toolEvidence", [])
    )
    return CaseResult(
        case_id=item["caseId"],
        trace_id=item["caseId"],
        response=item.get("reason") or "",
        deterministic_scores={
            "duration_ms": item.get("durationMs"),
            "judge_score": item["judge"]["score"] if item.get("judge") else None,
        },
        deterministic_reasons={
            "actual_outcome": item.get("actualOutcome") or "ALLOW",
            "reason": item.get("reason") or "",
            "judge_rationale": item["judge"]["rationale"] if item.get("judge") else "",
        },
        tool_evidence=evidence,
        judge=_judge(item),
        usage_costs=(
            UsageCost(
                "agent",
                "demo",
                item.get("inputTokens") or 0,
                item.get("outputTokens") or 0,
                0,
                0,
                item.get("costUsd") or 0.0,
            ),
        ),
        status=item.get("status", "PASS"),
    )


def _judge(item: dict) -> JudgeResult | None:
    if not item.get("judge"):
        return None
    score = item["judge"]["score"]
    base = 5 if score >= 1 else 1
    return JudgeResult(
        scores={
            "correctness": base,
            "relevance": base,
            "completeness": base,
            "safety": base if item.get("status") == "PASS" else 1,
        },
        reasons={
            "correctness": item["judge"].get("rationale", ""),
            "relevance": "",
            "completeness": "",
            "safety": "",
        },
        summary=item["judge"].get("rationale", ""),
        model="demo",
        prompt_version="demo-v1",
        trace_id=item["caseId"],
        observation_id=None,
    )


def seed_demo_fixtures(
    repository: WorkbenchRepository,
    fixtures: dict,
    reports_dir: Path,
) -> None:
    if is_seeded(repository, fixtures):
        return
    reports_dir.mkdir(parents=True, exist_ok=True)
    for target in fixtures["targets"]:
        revisions = [
            revision
            for revision in fixtures["targetRevisions"]
            if revision["targetId"] == target["id"]
        ]
        first = revisions[0]
        repository.create_agent_with_revision(
            target["name"],
            target["description"],
            {
                "model_id": first["model"]["id"],
                "model_name": first["model"]["name"],
                "system_prompt": first["systemPrompt"],
                "mcp_servers": first["mcpServers"],
                "knowledge_bases": first["knowledgeBases"],
            },
            tuple(_tool(name) for name in first["tools"]),
            agent_id=target["id"],
            revision_id=first["id"],
            created_at=target["createdAt"],
            updated_at=target["updatedAt"],
        )
        for revision in revisions[1:]:
            repository.create_agent_revision(
                target["id"],
                {
                    "model_id": revision["model"]["id"],
                    "model_name": revision["model"]["name"],
                    "system_prompt": revision["systemPrompt"],
                    "mcp_servers": revision["mcpServers"],
                    "knowledge_bases": revision["knowledgeBases"],
                },
                tuple(_tool(name) for name in revision["tools"]),
                revision_id=revision["id"],
                created_at=revision["createdAt"],
            )
    for dataset_index, dataset in enumerate(fixtures["datasets"]):
        revision = next(
            item
            for item in fixtures["datasetRevisions"]
            if item["datasetId"] == dataset["id"]
        )
        repository.create_dataset(
            dataset["targetId"],
            dataset["name"],
            description=dataset["description"],
            dataset_id=dataset["id"],
            # The UI DatasetRecord has no createdAt; these values only pin list
            # ordering to the fixture order.
            created_at=f"2026-07-{29 + dataset_index:02d}T00:00:00.000Z",
            updated_at=dataset["updatedAt"],
            schema=ui_schema_to_dataset_schema(revision["schema"]),
        )
        repository.replace_draft_cases(
            dataset["id"],
            [_case(item) for item in dataset["draftCases"]],
            touch_updated_at=False,
        )
        repository.publish_dataset(
            dataset["id"],
            revision_id=revision["id"],
            created_at=revision["createdAt"],
        )
    for run in fixtures["runs"]:
        created = repository.create_run(
            run["targetRevisionId"],
            run["datasetRevisionId"],
            run_id=run["id"],
            created_at=run["createdAt"],
            started_at=run["startedAt"],
            stage=run["stage"],
        )
        for result in run["results"]:
            repository.save_case_result(created.run_id, _case_result(result))
        repository.finish_run(
            created.run_id,
            RunStatus.COMPLETED
            if run["status"] in ("PASS", "FAIL")
            else RunStatus.FAILED,
            completed_at=run.get("completedAt"),
        )
    report_index = {report["runId"]: report for report in fixtures["reports"]}
    for run in fixtures["runs"]:
        report = report_index.get(run["id"])
        if not report:
            continue
        repository.save_report(
            run["id"],
            report["status"],
            {"metrics": report["metrics"], "costs": report["costs"]},
            reports_dir / f"{report['id']}.md",
            report_id=report["id"],
            created_at=report["createdAt"],
        )
