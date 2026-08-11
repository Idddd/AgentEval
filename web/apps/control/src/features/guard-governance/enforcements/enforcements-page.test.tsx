/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { GuardGovernanceProvider } from "../mock-provider";
import { EnforcementsPage } from "./enforcements-page";

afterEach(cleanup);

describe("EnforcementsPage", () => {
  it("renders the immutable default baseline and derived custom order", () => {
    render(
      <GuardGovernanceProvider projectId="individual">
        <EnforcementsPage />
      </GuardGovernanceProvider>,
    );

    const rows = screen.getAllByTestId("enforcement-row");
    expect(rows.map((row) => row.getAttribute("data-priority"))).toEqual(["10", "30"]);
    expect(screen.getByText("Default enforcement")).not.toBeNull();
    expect(screen.getByText("Unmatched traffic")).not.toBeNull();
    expect(screen.getByText("Guardrail Version 1")).not.toBeNull();
    expect(screen.getByText("System managed")).not.toBeNull();
  });
});
