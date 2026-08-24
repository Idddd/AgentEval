"""Replaceable user-scoped catalogs for Target Revision creation."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from .demo_workspace import DEMO_TOOLS
from .workbench_models import ToolBinding


@dataclass(frozen=True)
class CatalogItem:
    item_id: str
    name: str
    description: str
    metadata: dict[str, Any] = field(default_factory=dict)
    tool_binding: ToolBinding | None = None

    def snapshot(self) -> dict[str, Any]:
        return {
            **dict(self.metadata),
            "id": self.item_id,
            "name": self.name,
            "description": self.description,
        }


@dataclass(frozen=True)
class TargetCatalogSnapshot:
    models: tuple[CatalogItem, ...]
    tools: tuple[CatalogItem, ...]
    mcp_servers: tuple[CatalogItem, ...]
    knowledge_bases: tuple[CatalogItem, ...]

    def resolve_many(self, collection: str, item_ids: list[str]) -> tuple[CatalogItem, ...]:
        items = getattr(self, collection)
        indexed = {item.item_id: item for item in items}
        missing = [item_id for item_id in item_ids if item_id not in indexed]
        if missing:
            raise ValueError(f"Catalog items are no longer available: {', '.join(missing)}")
        return tuple(indexed[item_id] for item_id in item_ids)

    def resolve_one(self, collection: str, item_id: str) -> CatalogItem:
        return self.resolve_many(collection, [item_id])[0]


class TargetCatalog:
    """Return deterministic fixtures through the future backend-facing boundary."""

    def for_user(self, user_id: str) -> TargetCatalogSnapshot:
        del user_id
        return TargetCatalogSnapshot(
            models=(
                CatalogItem("deterministic-local", "Deterministic local demo", "Local recorded model"),
                CatalogItem("gpt-5.1", "gpt-5.1", "OpenAI-compatible model"),
                CatalogItem("deepseek-v4", "DeepSeek V4", "OpenAI-compatible model"),
            ),
            tools=tuple(
                CatalogItem(
                    tool.tool_id,
                    tool.name,
                    tool.description,
                    {"connection": tool.connection_type},
                    tool,
                )
                for tool in DEMO_TOOLS
            ),
            mcp_servers=(
                CatalogItem("internal-search-mcp", "Internal search MCP", "Search internal services", {"transport": "http"}),
                CatalogItem("filesystem-mcp", "Filesystem MCP", "Read approved workspace files", {"transport": "stdio"}),
            ),
            knowledge_bases=(
                CatalogItem("security-policies", "Security policies", "Company security policy corpus", {"kind": "vector"}),
                CatalogItem("support-handbook", "Support handbook", "Customer support procedures", {"kind": "vector"}),
                CatalogItem("product-docs", "Product docs", "Published product documentation", {"kind": "search"}),
            ),
        )
