import { describe, expect, it } from "vitest";

import { createCsv, createDownloadFilename } from "./csv";

describe("createCsv", () => {
  it("escapes commas, quotes, and line breaks without losing content", () => {
    const csv = createCsv(
      [{ name: 'alpha, "beta"', detail: "first\nsecond" }],
      [
        { header: "Name", value: (row) => row.name },
        { header: "Detail", value: (row) => row.detail },
      ],
    );

    expect(csv).toBe(
      '\uFEFF"Name","Detail"\r\n"alpha, ""beta""","first\nsecond"\r\n',
    );
  });

  it("keeps a stable header-only export for an empty data set", () => {
    expect(
      createCsv([], [{ header: "Event ID", value: () => "unused" }]),
    ).toBe('\uFEFF"Event ID"\r\n');
  });
});

describe("createDownloadFilename", () => {
  it("normalizes sandbox names into a portable filename", () => {
    expect(
      createDownloadFilename(
        ["OpenShell Audit", "Research / Assistant", "2026-07-16"],
        ".csv",
      ),
    ).toBe("openshell-audit-research-assistant-2026-07-16.csv");
  });
});
