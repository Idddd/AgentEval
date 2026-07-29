from pathlib import Path

from src.config_loader import (
    add_tool_test_requirement,
    clear_tool_test_requirements,
    load_tools_config,
)


def _config(tmp_path: Path) -> Path:
    path = tmp_path / "tools.yaml"
    path.write_text(
        "tools:\n"
        "  - name: WeatherTool\n"
        "    description: Query the weather\n"
        "    sensitivity: low\n"
        "    required_role: null\n"
        "roles:\n"
        "  - name: guest\n"
        "    permissions: [WeatherTool]\n",
        encoding="utf-8",
    )
    return path


def test_tool_requirement_persists_in_tool_configuration(tmp_path):
    path = _config(tmp_path)

    add_tool_test_requirement(path, "WeatherTool", "Verify city extraction")

    config = load_tools_config(path)
    assert config.tools["WeatherTool"].test_requirements == ["Verify city extraction"]


def test_reset_clears_tool_requirements_without_changing_tools(tmp_path):
    path = _config(tmp_path)
    add_tool_test_requirement(path, "WeatherTool", "Verify city extraction")

    clear_tool_test_requirements(path)

    config = load_tools_config(path)
    assert "WeatherTool" in config.tools
    assert config.roles["guest"] == ["WeatherTool"]
    assert config.tools["WeatherTool"].test_requirements == []
