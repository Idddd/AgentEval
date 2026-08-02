"""Agent profile and immutable-revision service boundary."""
from __future__ import annotations

from .workbench_models import AgentProfile, AgentRevision, ToolBinding
from .workbench_repository import WorkbenchRepository


class AgentRegistry:
    def __init__(self, repository: WorkbenchRepository):
        self.repository = repository

    def create(self, name: str, description: str) -> AgentProfile:
        name = name.strip()
        if not name:
            raise ValueError("agent name must not be empty")
        return self.repository.create_agent(name, description.strip())

    def revise(
        self, agent_id: str, config_snapshot: dict, tools: tuple[ToolBinding, ...]
    ) -> AgentRevision:
        ids = [tool.tool_id for tool in tools]
        if len(ids) != len(set(ids)):
            raise ValueError("tool IDs must be unique within an agent revision")
        return self.repository.create_agent_revision(agent_id, config_snapshot, tools)

    def create_revision(
        self,
        name: str,
        description: str,
        config_snapshot: dict,
        tools: tuple[ToolBinding, ...],
    ) -> tuple[AgentProfile, AgentRevision]:
        name = name.strip()
        if not name:
            raise ValueError("Target name is required")
        ids = [tool.tool_id for tool in tools]
        if len(ids) != len(set(ids)):
            raise ValueError("tool IDs must be unique within an agent revision")
        return self.repository.create_agent_with_revision(
            name, description.strip(), config_snapshot, tools
        )
