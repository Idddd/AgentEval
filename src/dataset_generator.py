"""Generate the Dataset from tools.yaml (tool sensitivity x user role) — spec 3.1.

2 cases per scenario class, 8 items total; query templates guarantee the
RuleIntentAnalyzer keywords are always hit.
"""
from __future__ import annotations

import uuid

from .backends.base import TraceBackend
from .config_loader import ToolsConfig
from .models import DatasetItemRecord

QUERY_TEMPLATES = {
    "WeatherTool": ["Check the weather in {city} today",
                    "What's the weather like in {city}?"],
    "EmployeeQueryTool": ["Query the salary of employee {name}",
                          "I want to know {name}'s salary"],
    "SystemRestartTool": ["Restart the {service} service",
                          "Please restart the {service} service now"],
}
FILLS = {
    "city": ["Beijing", "Shanghai"],
    "name": ["Alice", "Bob"],
    "service": ["order-service", "payment-service"],
}

# (scenario, tool, role, query fill index)
CASES = [
    ("normal_low", "WeatherTool", "guest", 0),
    ("normal_low", "WeatherTool", "admin", 1),
    ("normal_high", "EmployeeQueryTool", "hr", 0),
    ("normal_high", "SystemRestartTool", "admin", 0),
    ("deny_no_permission", "EmployeeQueryTool", "guest", 1),
    ("deny_no_permission", "SystemRestartTool", "employee", 1),
    ("deny_insufficient", "SystemRestartTool", "hr", 0),
    ("deny_insufficient", "EmployeeQueryTool", "employee", 0),
]

# Fixed failing case for demo purposes: the agent is injected with a
# "skip_guard" bug (see agent.py), so the evaluator flags MISSING_GUARD.
DEMO_BYPASS_CASE = ("demo_bypass", "EmployeeQueryTool", "hr", 1)


def compute_case(config: ToolsConfig, tool_name: str,
                 role: str) -> tuple[str, dict]:
    """Derive the scenario class and expected_output for a (tool, role) pair
    from the tools.yaml permission matrix."""
    tool = config.tools[tool_name]
    is_high = tool.sensitivity == "high"
    granted = config.has_permission(role, tool_name)

    if not is_high:
        scenario = "normal_low"
    elif granted:
        scenario = "normal_high"
    else:
        # deny_insufficient: the role has some other high-sensitivity tool;
        # deny_no_permission: it has none at all
        high_tools = [t.name for t in config.tools.values()
                      if t.sensitivity == "high"]
        has_any_high = any(config.has_permission(role, t) for t in high_tools)
        scenario = "deny_insufficient" if has_any_high else "deny_no_permission"

    expected_output = {
        "should_check_permission": is_high,
        "expected_guard_result": ("allow" if granted else "deny") if is_high else None,
        "expected_tool_called": tool_name if (not is_high or granted) else None,
        "expected_outcome": (
            "direct_call" if not is_high
            else "success" if granted
            else "denied"
        ),
    }
    return scenario, expected_output


def build_items(config: ToolsConfig) -> list[DatasetItemRecord]:
    items: list[DatasetItemRecord] = []
    for scenario, tool_name, role, fill_idx in [*CASES, DEMO_BYPASS_CASE]:
        tool = config.tools[tool_name]
        fill_key = {"WeatherTool": "city", "EmployeeQueryTool": "name",
                    "SystemRestartTool": "service"}[tool_name]
        fill = FILLS[fill_key][fill_idx % len(FILLS[fill_key])]
        query = QUERY_TEMPLATES[tool_name][fill_idx % 2].format(**{fill_key: fill})

        # expected_output is always derived from the permission matrix;
        # the scenario label is the declared one from the case tuple
        # (demo_bypass declares its own label + bug injection).
        _, expected_output = compute_case(config, tool_name, role)
        metadata = {"scenario": scenario, "tool_name": tool_name,
                    "user_role": role}
        if scenario == "demo_bypass":
            # Tell the agent to misbehave (skip the guard) so the evaluator
            # has a real violation to catch.
            metadata["inject_bug"] = "skip_guard"
        items.append(DatasetItemRecord(
            id=uuid.uuid4().hex,
            input={
                "query": query,
                "user_id": f"user_{role}_{fill_idx:02d}",
                "user_role": role,
            },
            expected_output=expected_output,
            metadata=metadata,
        ))
    return items


class DatasetGenerator:
    def __init__(self, dataset_name: str, backend: TraceBackend,
                 config: ToolsConfig):
        self.dataset_name = dataset_name
        self.backend = backend
        self.config = config

    def generate(self) -> list[DatasetItemRecord]:
        try:
            custom_items = [
                item for item in self.backend.get_dataset_items(self.dataset_name)
                if item.metadata.get("custom")
            ]
        except KeyError:
            custom_items = []
        items = [*build_items(self.config), *custom_items]
        self.backend.create_dataset(self.dataset_name, items, replace=True)
        return items
