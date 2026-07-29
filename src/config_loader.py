"""tools.yaml loading and permission lookup."""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import yaml

CONFIG_PATH = Path(__file__).resolve().parent.parent / "config" / "tools.yaml"


@dataclass
class ToolDef:
    name: str
    description: str
    sensitivity: str            # low | high
    required_role: str | None
    test_requirements: list[str]


@dataclass
class ToolsConfig:
    tools: dict[str, ToolDef]
    roles: dict[str, list[str]]  # role -> [tool names]

    def has_permission(self, role: str, tool_name: str) -> bool:
        return tool_name in self.roles.get(role, [])


def load_tools_config(path: Path = CONFIG_PATH) -> ToolsConfig:
    raw = yaml.safe_load(path.read_text(encoding="utf-8"))
    tools = {
        t["name"]: ToolDef(
            name=t["name"],
            description=t["description"],
            sensitivity=t["sensitivity"],
            required_role=t.get("required_role"),
            test_requirements=list(t.get("test_requirements", [])),
        )
        for t in raw["tools"]
    }
    roles = {r["name"]: list(r["permissions"]) for r in raw["roles"]}
    # validate: role permissions must reference existing tools
    for role, perms in roles.items():
        for p in perms:
            if p not in tools:
                raise ValueError(f"role '{role}' references unknown tool '{p}'")
    return ToolsConfig(tools=tools, roles=roles)


def add_tool_test_requirement(path: Path, tool_name: str, requirement: str) -> None:
    """Persist one non-empty test requirement for a configured tool."""
    requirement = requirement.strip()
    if not requirement:
        raise ValueError("test requirement must not be empty")
    raw = yaml.safe_load(path.read_text(encoding="utf-8"))
    tool = next((item for item in raw["tools"] if item["name"] == tool_name), None)
    if tool is None:
        raise KeyError(f"tool '{tool_name}' not found")
    requirements = tool.setdefault("test_requirements", [])
    if requirement not in requirements:
        requirements.append(requirement)
    path.write_text(yaml.safe_dump(raw, sort_keys=False, allow_unicode=True), encoding="utf-8")


def clear_tool_test_requirements(path: Path = CONFIG_PATH) -> None:
    """Clear only user-authored testing requirements, preserving policy config."""
    raw = yaml.safe_load(path.read_text(encoding="utf-8"))
    for tool in raw["tools"]:
        tool["test_requirements"] = []
    path.write_text(yaml.safe_dump(raw, sort_keys=False, allow_unicode=True), encoding="utf-8")
