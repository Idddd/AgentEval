from src.demo_workspace import DEMO_TOOLS


def test_target_catalog_includes_demo_tools_and_secret_free_resources():
    """Removing a demo Tool or embedding auth data must break the catalog contract."""
    from src.target_catalog import TargetCatalog

    catalog = TargetCatalog().for_user("local-user")

    assert {item.item_id for item in catalog.tools} >= {
        tool.tool_id for tool in DEMO_TOOLS
    }
    assert len(catalog.models) >= 2
    assert len(catalog.mcp_servers) >= 2
    assert len(catalog.knowledge_bases) >= 2
    serialized = repr(catalog).lower()
    assert "api_key" not in serialized
    assert "authorization" not in serialized
    assert "bearer " not in serialized


def test_target_catalog_resolves_multiple_resources_by_stable_id():
    """Returning only one selected item would silently lose multi-select choices."""
    from src.target_catalog import TargetCatalog

    catalog = TargetCatalog().for_user("local-user")
    selected = catalog.resolve_many(
        "knowledge_bases",
        [catalog.knowledge_bases[0].item_id, catalog.knowledge_bases[1].item_id],
    )

    assert [item.item_id for item in selected] == [
        catalog.knowledge_bases[0].item_id,
        catalog.knowledge_bases[1].item_id,
    ]


def test_catalog_snapshot_metadata_cannot_replace_stable_identity():
    """Backend metadata must not overwrite the canonical catalog ID or name."""
    from src.target_catalog import CatalogItem

    snapshot = CatalogItem(
        "stable-id",
        "Stable name",
        "Stable description",
        {"id": "spoofed", "name": "Spoofed", "kind": "vector"},
    ).snapshot()

    assert snapshot == {
        "id": "stable-id",
        "name": "Stable name",
        "description": "Stable description",
        "kind": "vector",
    }
