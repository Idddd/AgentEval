from src.config_loader import load_tools_config
from src.intent import RuleIntentAnalyzer

CONFIG = load_tools_config()
ANALYZER = RuleIntentAnalyzer()


def test_weather():
    assert ANALYZER.identify("Check the weather in Beijing today",
                             CONFIG.tools) == "WeatherTool"


def test_employee():
    assert ANALYZER.identify("Query the salary of employee Alice",
                             CONFIG.tools) == "EmployeeQueryTool"


def test_restart():
    assert ANALYZER.identify("Restart the order-service service",
                             CONFIG.tools) == "SystemRestartTool"


def test_unknown():
    assert ANALYZER.identify("Tell me a joke", CONFIG.tools) is None
