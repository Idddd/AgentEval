/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { GuardGovernanceProvider } from "../mock-provider";
import { EnforcementsPage } from "./enforcements-page";

afterEach(cleanup);

describe("EnforcementsPage", () => {
  it("renders derived Enforcements in priority order and identifies uncovered traffic", () => {
    render(
      <GuardGovernanceProvider projectId="individual">
        <EnforcementsPage />
      </GuardGovernanceProvider>,
    );

    const rows = screen.getAllByTestId("enforcement-row");
    expect(rows.map((row) => row.getAttribute("data-priority"))).toEqual(["10", "30"]);
    expect(screen.getByText("Uncovered traffic remains")).not.toBeNull();
  });
});
