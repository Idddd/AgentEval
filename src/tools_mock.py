"""Mock tool implementations: fixed return strings (spec 4.3)."""
from __future__ import annotations

import re


def run_mock_tool(tool_name: str, query: str) -> dict:
    if tool_name == "WeatherTool":
        city = _extract(query, r"weather (?:in|like in) (\w+)") or "Beijing"
        return {"result": f"The weather in {city} is sunny, 25°C"}
    if tool_name == "EmployeeQueryTool":
        name = (_extract(query, r"employee (\w+)")
                or _extract(query, r"(\w+)'s salary")) or "Alice"
        return {"result": f"{name}'s monthly salary is 15000"}
    if tool_name == "SystemRestartTool":
        service = _extract(query, r"[Rr]estart (?:the )?(\S+?) service") \
            or "order-service"
        return {"result": f"Service {service} restarted successfully"}
    return {"result": f"unknown tool: {tool_name}"}


def _extract(query: str, pattern: str) -> str | None:
    m = re.search(pattern, query)
    return m.group(1).strip() if m else None
