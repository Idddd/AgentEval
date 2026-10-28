export type MetricId = "throughput" | "vram" | "ram" | "gpu" | "cpu";
export type MetricSeries = {
  id: MetricId;
  title: string;
  unit: "QPS" | "GB" | "%";
  color: string;
  samples: number[];
};

// Fixed one-minute demo samples, oldest → latest. Headline and plot share the
// same last value. Percentage ranges are usage; GB values imply no capacity.
export const metricSeries: Record<MetricId, MetricSeries> = {
  throughput: {
    id: "throughput",
    title: "Throughput",
    unit: "QPS",
    color: "#2563eb",
    samples: [
      10840, 11210, 11090, 11560, 11720, 11390, 11920, 12100, 11840, 12350,
      12468,
    ],
  },
  vram: {
    id: "vram",
    title: "VRAM Usage",
    unit: "GB",
    color: "#7c3aed",
    samples: [
      60.84, 63.1, 62.7, 64.9, 65.1, 64.5, 66.2, 65.8, 67.4, 67.8, 68.22,
    ],
  },
  ram: {
    id: "ram",
    title: "RAM Usage",
    unit: "GB",
    color: "#0e7490",
    samples: [
      39.42, 38.8, 39.7, 38.3, 37.6, 38.1, 37.2, 36.4, 37.1, 36.8, 36.98,
    ],
  },
  gpu: {
    id: "gpu",
    title: "GPU Usage",
    unit: "%",
    color: "#b45309",
    samples: [
      58.8, 61.2, 59.4, 64.7, 62.8, 66.3, 65.1, 69.2, 68.4, 70.8, 72.42,
    ],
  },
  cpu: {
    id: "cpu",
    title: "CPU Usage",
    unit: "%",
    color: "#047857",
    samples: [
      47.8, 43.5, 45.2, 40.1, 38.7, 41.3, 37.8, 35.2, 37.4, 33.9, 34.65,
    ],
  },
};
export function sampleTime(index: number) {
  return index === 10 ? "Now" : `${10 - index} min ago`;
}
export function metricValue(value: number, unit: MetricSeries["unit"]) {
  return unit === "QPS" ? String(Math.round(value)) : value.toFixed(2);
}
// Demonstration display thresholds, not configured service alert limits.
export function usageState(value: number) {
  return value >= 90
    ? { label: "High", level: "high", color: "#b91c1c" }
    : value >= 70
      ? { label: "Elevated", level: "elevated", color: "#b45309" }
      : { label: "Normal", level: "normal", color: "#047857" };
}
