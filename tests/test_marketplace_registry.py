"""Marketplace registry persistence (plan Task 1, Steps 4-5)."""
import pytest

from src.marketplace.registry import DuplicateAgentError, MarketplaceRegistry
from tests.test_marketplace_manifest import VALID


def _registry(tmp_path):
    return MarketplaceRegistry(tmp_path / "marketplace.db")


def test_register_and_get_round_trip(tmp_path):
    reg = _registry(tmp_path)
    agent = reg.register(VALID)
    assert agent.manifest.agent_id == "acme/travel-planner"
    assert agent.registered_at
    got = reg.get("acme/travel-planner", "1.4.0")
    assert got.manifest == agent.manifest
    assert got.registered_at == agent.registered_at


def test_duplicate_version_rejected_new_version_accepted(tmp_path):
    reg = _registry(tmp_path)
    reg.register(VALID)
    with pytest.raises(DuplicateAgentError):
        reg.register(VALID)
    reg.register(VALID.replace("version: 1.4.0", "version: 1.5.0"))
    assert reg.get("acme/travel-planner", "1.5.0").manifest.version == "1.5.0"


def test_list_agents_returns_latest_version_with_count(tmp_path):
    reg = _registry(tmp_path)
    reg.register(VALID)
    reg.register(VALID.replace("version: 1.4.0", "version: 1.5.0"))
    other = VALID.replace("agent_id: acme/travel-planner", "agent_id: acme/other")
    reg.register(other)
    listed = {a.manifest.agent_id: a for a in reg.list_agents()}
    assert set(listed) == {"acme/travel-planner", "acme/other"}
    assert listed["acme/travel-planner"].manifest.version == "1.5.0"
    assert listed["acme/travel-planner"].version_count == 2
    assert listed["acme/other"].version_count == 1


def test_schema_creation_is_idempotent_across_instances(tmp_path):
    db = tmp_path / "marketplace.db"
    MarketplaceRegistry(db).register(VALID)
    assert MarketplaceRegistry(db).get("acme/travel-planner", "1.4.0") is not None
