/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { useState } from "react";
import type { TrafficScopeExpression } from "../model";
import { TrafficScopeBuilder } from "./traffic-scope-builder";

function Harness() {
  const [value, setValue] = useState<TrafficScopeExpression>({
    combinator: "and",
    rules: [
      { field: "environment", operator: "equals", value: "production" },
    ],
  });
  return (
    <>
      <TrafficScopeBuilder value={value} onChange={setValue} />
      <output>{JSON.stringify(value)}</output>
    </>
  );
}

afterEach(cleanup);

describe("TrafficScopeBuilder", () => {
  it("emits complete expressions while rules and combinator change", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.selectOptions(screen.getByLabelText("Rule 1 field"), "route");
    await user.selectOptions(
      screen.getByLabelText("Rule 1 operator"),
      "starts_with",
    );
    await user.clear(screen.getByLabelText("Rule 1 value"));
    await user.type(screen.getByLabelText("Rule 1 value"), "/support");
    await user.click(screen.getByRole("button", { name: "Add rule" }));
    await user.click(screen.getByRole("button", { name: "Match any rule" }));

    expect(screen.getByText(/"combinator":"or"/).textContent).toBe(
      '{"combinator":"or","rules":[{"field":"route","operator":"starts_with","value":"/support"},{"field":"environment","operator":"equals","value":""}]}',
    );

    await user.click(screen.getByRole("button", { name: "Remove rule 2" }));
    expect(screen.queryByLabelText("Rule 2 value")).toBeNull();
  });

  it("does not allow the final rule to be removed", () => {
    render(<Harness />);
    expect(
      (screen.getByRole("button", {
        name: "Remove rule 1",
      }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});
