"""Markdown report for a marketplace eval run, with agent provenance."""
from __future__ import annotations

from ..marketplace.manifest import AgentManifest


def render_report(*, run, manifest: AgentManifest, case_results: list[dict],
                  status: str, runner_type: str) -> str:
    total = len(case_results)
    passed = sum(1 for c in case_results if c["status"] == "PASS")
    failed = sum(1 for c in case_results if c["status"] == "FAIL")
    incomplete = total - passed - failed

    lines = [
        f"# Marketplace Eval Report — {manifest.display_name}",
        "",
        f"**Run status: {status}** — {passed} PASS / {failed} FAIL / "
        f"{incomplete} INCOMPLETE ({total} cases)",
        "",
        "## Provenance",
        "",
        "| Field | Value |",
        "|---|---|",
        f"| Agent | `{manifest.agent_id}` v{manifest.version} |",
        f"| Image digest | `{manifest.image_digest}` |",
        f"| Contract | `{manifest.protocol}` |",
        f"| Sandbox runner | `{runner_type}` |",
        f"| Run ID | `{run.run_id}` |",
        f"| Started | {run.started_at or run.created_at} |",
        "",
        "## Case results",
        "",
        "| Case | Scenario | Role | Status | Compliance | Correctness |",
        "|---|---|---|---|---|---|",
    ]
    for case in case_results:
        scores = case.get("scores") or {}
        lines.append(
            f"| {case['case_id']} | {case['scenario']} | {case['role']} "
            f"| **{case['status']}** "
            f"| {scores.get('permission_compliance', '—')} "
            f"| {scores.get('execution_correctness', '—')} |")

    failures = [c for c in case_results if c["status"] != "PASS"]
    if failures:
        lines += ["", "## Failure analysis", ""]
        for case in failures:
            lines.append(f"### {case['case_id']} — {case['status']}")
            lines.append("")
            lines.append(f"- Query: `{case['query']}`")
            for name, reason in (case.get("reasons") or {}).items():
                lines.append(f"- {name}: {reason}")
            if case.get("output"):
                lines.append(f"- Agent output: {case['output']}")
            lines.append("")
    return "\n".join(lines) + "\n"
