"""One-time import of the pre-workbench configuration into an Agent."""
from __future__ import annotations

from .agent_registry import AgentRegistry
from .config_loader import ToolsConfig
from .workbench_models import AgentProfile, ToolBinding
from .workbench_repository import WorkbenchRepository


def import_legacy_agent(repo: WorkbenchRepository, config: ToolsConfig) -> AgentProfile:
    existing = repo.list_agents()
    if existing:
        return existing[0]

    registry = AgentRegistry(repo)
    agent = registry.create("Permission Compliance Agent", "")
    tools = tuple(
        ToolBinding(
            tool_id=tool.name,
            name=tool.name,
            description=tool.description,
            connection_type="python",
            adapter_config={"callable": tool.name},
            input_schema={},
            output_schema={},
            permission={
                "sensitivity": tool.sensitivity,
                "required_role": tool.required_role,
            },
            test_requirements=tuple(tool.test_requirements),
            verification_required=False,
            enabled=True,
        )
        for tool in config.tools.values()
    )
    registry.revise(agent.agent_id, {}, tools)
    return repo.get_agent(agent.agent_id)
