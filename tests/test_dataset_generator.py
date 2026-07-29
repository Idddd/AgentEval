from src.backends.local_backend import LocalJsonBackend
from src.config_loader import load_tools_config
from src.dataset_generator import DatasetGenerator, compute_case
from src.models import DatasetItemRecord


def test_regenerating_dataset_preserves_custom_cases(tmp_path):
    backend = LocalJsonBackend(tmp_path)
    config = load_tools_config()
    generator = DatasetGenerator("demo", backend, config)
    generator.generate()
    scenario, expected = compute_case(config, "WeatherTool", "guest")
    backend.add_dataset_item("demo", DatasetItemRecord(
        id="custom-weather-case",
        input={"query": "Check the weather in London", "user_id": "custom", "user_role": "guest"},
        expected_output=expected,
        metadata={"scenario": scenario, "tool_name": "WeatherTool", "custom": True},
    ))

    generator.generate()

    assert any(item.id == "custom-weather-case" for item in backend.get_dataset_items("demo"))
