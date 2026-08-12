/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  EvaluationLayerDataset,
  EvaluationLayerDatasetRevision,
} from "../model";
import {
  DatasetCardSelector,
  datasetCardSummary,
} from "./dataset-card-selector";

const datasets: EvaluationLayerDataset[] = [
  {
    id: "dataset-a",
    targetId: "target-a",
    name: "Support Dataset",
    description: "Approved support conversations.",
    currentRevisionId: "revision-2",
    createdAt: "2026-08-12T00:00:00.000Z",
  },
  {
    id: "dataset-b",
    targetId: "target-a",
    name: "Empty Dataset",
    description: "",
    currentRevisionId: "",
    createdAt: "2026-08-12T00:00:00.000Z",
  },
];

const revisions: EvaluationLayerDatasetRevision[] = [
  {
    id: "revision-1",
    datasetId: "dataset-a",
    targetId: "target-a",
    revision: 1,
    status: "PUBLISHED",
    cases: [
      {
        id: "case-1",
        input: {},
        expectedOutput: {},
        tags: [],
        source: "custom",
      },
    ],
    createdAt: "2026-08-11T00:00:00.000Z",
  },
  {
    id: "revision-2",
    datasetId: "dataset-a",
    targetId: "target-a",
    revision: 2,
    status: "DRAFT",
    cases: [
      {
        id: "case-2",
        input: {},
        expectedOutput: {},
        tags: [],
        source: "custom",
      },
      {
        id: "case-3",
        input: {},
        expectedOutput: {},
        tags: [],
        source: "custom",
      },
    ],
    createdAt: "2026-08-12T00:00:00.000Z",
  },
];

afterEach(cleanup);

describe("DatasetCardSelector", () => {
  it("summarizes the current revision with state and case count", () => {
    expect(datasetCardSummary(datasets[0]!, revisions)).toEqual({
      revisionLabel: "R2",
      statusLabel: "Draft",
      caseLabel: "2 cases",
    });
    expect(datasetCardSummary(datasets[1]!, revisions)).toEqual({
      revisionLabel: "No revisions",
      statusLabel: "",
      caseLabel: "0 cases",
    });
  });

  it("selects an existing Dataset and opens New Dataset separately", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onOpenDetails = vi.fn();
    const onCreate = vi.fn();
    render(
      <DatasetCardSelector
        datasets={datasets}
        revisions={revisions}
        selectedDatasetId="dataset-a"
        onSelect={onSelect}
        onOpenDetails={onOpenDetails}
        onCreate={onCreate}
      />,
    );

    expect(screen.getByRole("radiogroup", { name: "Dataset" })).not.toBeNull();
    expect(
      (screen.getByRole("radio", { name: /Support Dataset/ }) as HTMLInputElement)
        .checked,
    ).toBe(true);
    expect(screen.getByText("Approved support conversations.")).not.toBeNull();
    expect(screen.getByText("R2")).not.toBeNull();
    expect(screen.getByText("Draft")).not.toBeNull();
    expect(screen.getByText("2 cases")).not.toBeNull();
    expect(screen.getByText("No description")).not.toBeNull();

    await user.click(screen.getByRole("radio", { name: /Empty Dataset/ }));
    expect(onSelect).toHaveBeenCalledWith("dataset-b");
    await user.click(screen.getByRole("button", { name: "New Dataset" }));
    expect(onCreate).toHaveBeenCalledOnce();
    expect(screen.queryByRole("radio", { name: /New Dataset/ })).toBeNull();
  });

  it("opens a Dataset detail without triggering card selection", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onOpenDetails = vi.fn();
    render(
      <DatasetCardSelector
        datasets={datasets}
        revisions={revisions}
        selectedDatasetId="dataset-a"
        onSelect={onSelect}
        onOpenDetails={onOpenDetails}
        onCreate={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Open Support Dataset details" }),
    ).not.toBeNull();
    expect(
      screen.getByRole("button", { name: "Open Empty Dataset details" }),
    ).not.toBeNull();
    await user.click(
      screen.getByRole("button", { name: "Open Empty Dataset details" }),
    );
    expect(onOpenDetails).toHaveBeenCalledWith("dataset-b");
    expect(onSelect).not.toHaveBeenCalled();
  });
});
