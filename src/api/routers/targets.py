from fastapi import APIRouter, Depends

from src.sqlite_workbench import SQLiteWorkbenchRepository
from src.workbench_models import ToolBinding

from ..deps import get_repository
from ..dto import (
    agent_profile_to_target,
    agent_revision_to_target_revision,
)


router = APIRouter(prefix="/api/v1/evaluations", tags=["targets"])


def _tool(name: str) -> ToolBinding:
    return ToolBinding(
        tool_id=name,
        name=name,
        description=f"Tool {name}.",
        connection_type="demo",
        adapter_config={"endpoint": f"demo://{name}"},
        input_schema={"type": "object"},
        output_schema={"type": "object"},
        permission={"sensitivity": "low", "required_role": None},
        test_requirements=(),
        verification_required=False,
        enabled=True,
    )


def _config(payload: dict) -> dict:
    model = payload.get("model") or {}
    return {
        "model_id": model.get("id", ""),
        "model_name": model.get("name", ""),
        "system_prompt": payload.get("systemPrompt", ""),
        "mcp_servers": payload.get("mcpServers", []),
        "knowledge_bases": payload.get("knowledgeBases", []),
    }


def current_tools(revision) -> list[str]:
    return [tool.name for tool in revision.tools]


@router.get("/targets/{target_id}")
def get_target(
    target_id: str,
    repository: SQLiteWorkbenchRepository = Depends(get_repository),
) -> dict:
    agent = repository.get_agent(target_id)
    current = repository.get_current_agent_revision(target_id)
    return agent_profile_to_target(agent, current.revision_id if current else None)


@router.post("/targets")
def create_target(
    payload: dict,
    repository: SQLiteWorkbenchRepository = Depends(get_repository),
) -> dict:
    name = payload.get("name", "").strip()
    if not name:
        raise ValueError("Target name is required.")
    tools = tuple(_tool(item) for item in payload.get("tools", []))
    agent, _revision = repository.create_agent_with_revision(
        name,
        payload.get("description", "").strip(),
        _config(payload),
        tools,
        agent_id=payload.get("id"),
        revision_id=payload.get("revisionId"),
    )
    return agent_profile_to_target(agent, payload.get("revisionId"))


@router.post("/targets/{target_id}/revisions")
def create_target_revision(
    target_id: str,
    payload: dict,
    repository: SQLiteWorkbenchRepository = Depends(get_repository),
) -> dict:
    current = repository.get_current_agent_revision(target_id)
    if current is None:
        raise KeyError(target_id)
    config = _config({**agent_revision_to_target_revision(current), **payload})
    tools = tuple(
        _tool(item) for item in payload.get("tools", current_tools(current))
    )
    revision = repository.create_agent_revision(
        target_id,
        config,
        tools,
        revision_id=payload.get("id"),
    )
    return agent_revision_to_target_revision(revision)
