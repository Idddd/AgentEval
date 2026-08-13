import { describe, expect, it } from "vitest";
import { productionMonitoringDescription } from "./overview";

describe("Production Monitoring route copy", () => {
  it("describes live traffic quality and alerting", () => {
    expect(productionMonitoringDescription).toBe(
      "Track live traffic telemetry to detect response quality and alert.",
    );
  });
});
