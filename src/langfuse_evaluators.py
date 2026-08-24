"""Small adapter for Langfuse's unstable public Evaluators API."""
from __future__ import annotations

import base64
import json
from dataclasses import dataclass
from urllib.request import Request, urlopen

from .settings import Settings


@dataclass(frozen=True)
class LangfuseEvaluator:
    evaluator_id: str
    name: str
    evaluator_type: str
    version: int | None = None


def list_langfuse_evaluators(
    settings: Settings, *, timeout_seconds: float = 4.0
) -> list[LangfuseEvaluator]:
    if not settings.langfuse_public_key or not settings.langfuse_secret_key:
        return []
    token = base64.b64encode(
        f"{settings.langfuse_public_key}:{settings.langfuse_secret_key}".encode()
    ).decode()
    request = Request(
        f"{settings.langfuse_host.rstrip('/')}/api/public/unstable/evaluators",
        headers={"Authorization": f"Basic {token}", "Accept": "application/json"},
    )
    with urlopen(request, timeout=timeout_seconds) as response:  # noqa: S310
        payload = json.loads(response.read().decode("utf-8"))
    items = payload.get("data", payload.get("evaluators", payload if isinstance(payload, list) else []))
    result: list[LangfuseEvaluator] = []
    for item in items if isinstance(items, list) else []:
        if not isinstance(item, dict):
            continue
        evaluator_id = str(item.get("id", ""))
        name = str(item.get("name", evaluator_id))
        if evaluator_id:
            result.append(
                LangfuseEvaluator(
                    evaluator_id,
                    name,
                    str(item.get("type", "evaluator")),
                    int(item["version"]) if isinstance(item.get("version"), int) else None,
                )
            )
    return result
